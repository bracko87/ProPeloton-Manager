-- Keep Premium access aligned with Stripe cancellation state.
-- A fully canceled/expired Stripe subscription must not remain Premium solely
-- because a stale access_until value is in the future.
-- Explicit manual QA entitlements are preserved.

create or replace function public.get_my_premium_status()
returns table(
  access_tier text,
  is_premium boolean,
  plan_code text,
  plan_name text,
  stripe_status text,
  access_until timestamptz,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  coins_per_paid_invoice integer
)
language sql
security definer
set search_path to 'public'
as $function$
  with premium_state as (
    select
      s.*,
      (
        coalesce(s.access_until > now(), false)
        and (
          coalesce(s.stripe_status, 'free') not in (
            'canceled',
            'incomplete_expired'
          )
          or lower(
            coalesce(
              s.metadata ->> 'manual_test_access',
              'false'
            )
          ) in ('true', '1', 'yes')
        )
      ) as has_premium_access
    from (
      select auth.uid() as user_id
    ) me
    left join public.user_premium_subscriptions s
      on s.user_id = me.user_id
  )
  select
    case
      when coalesce(s.has_premium_access, false)
        then 'premium'
      else 'free'
    end as access_tier,

    coalesce(s.has_premium_access, false) as is_premium,

    s.plan_code,
    p.name as plan_name,

    coalesce(
      s.stripe_status,
      'free'
    ) as stripe_status,

    s.access_until,

    coalesce(
      s.cancel_at_period_end,
      false
    ) as cancel_at_period_end,

    s.current_period_end,

    coalesce(
      p.coins_per_paid_invoice,
      0
    ) as coins_per_paid_invoice

  from premium_state s
  left join public.premium_plans p
    on p.code = s.plan_code;
$function$;

comment on function public.get_my_premium_status() is
  'Returns current Premium access. Fully canceled/expired Stripe subscriptions do not retain Premium from a stale future access_until value; explicit manual QA entitlements remain supported.';
