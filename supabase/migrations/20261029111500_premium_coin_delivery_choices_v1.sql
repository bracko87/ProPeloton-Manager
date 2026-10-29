-- Existing paid invoices and already-credited coins are left unchanged.
create table if not exists private.premium_coin_distribution_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 mode text not null default 'upfront' check(mode in ('monthly','upfront')),
 updated_at timestamptz not null default now()
);
revoke all on private.premium_coin_distribution_preferences from public,anon,authenticated;
create table if not exists private.premium_coin_installments (
 stripe_invoice_id text not null references public.premium_invoice_payments(stripe_invoice_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 installment_number integer not null check(installment_number between 1 and 11),
 coins integer not null check(coins=30),
 due_at timestamptz not null,
 granted_at timestamptz,
 primary key(stripe_invoice_id,installment_number)
);
create index if not exists premium_coin_installments_due_ungranted_idx
 on private.premium_coin_installments(due_at) where granted_at is null;
revoke all on private.premium_coin_installments from public,anon,authenticated;
create or replace function public.set_my_premium_coin_distribution_v1(p_mode text)
returns text language plpgsql security definer set search_path to 'public','private','auth','pg_temp'
as $dist$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Not authenticated'; end if;
 if p_mode not in ('monthly','upfront') then raise exception 'Invalid coin distribution choice'; end if;
 insert into private.premium_coin_distribution_preferences(user_id,mode)
 values(v_user,p_mode) on conflict(user_id) do update set mode=excluded.mode,updated_at=now();
 return p_mode;
end; $dist$;
revoke all on function public.set_my_premium_coin_distribution_v1(text) from public,anon;
grant execute on function public.set_my_premium_coin_distribution_v1(text) to authenticated;
create or replace function public.get_my_premium_coin_distribution_v1()
returns text language sql stable security definer set search_path to ''
as $dist$
 select coalesce((select mode from private.premium_coin_distribution_preferences where user_id=auth.uid()),'upfront');
$dist$;
revoke all on function public.get_my_premium_coin_distribution_v1() from public,anon;
grant execute on function public.get_my_premium_coin_distribution_v1() to authenticated;

CREATE OR REPLACE FUNCTION public.process_premium_invoice_paid_v1(p_user_id uuid, p_plan_code text, p_stripe_customer_id text, p_stripe_subscription_id text, p_stripe_price_id text, p_stripe_status text, p_stripe_invoice_id text, p_stripe_event_id text, p_stripe_event_created bigint, p_billing_reason text, p_amount_paid_cents bigint, p_currency text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_current_period_start timestamp with time zone, p_current_period_end timestamp with time zone, p_cancel_at_period_end boolean, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan public.premium_plans%rowtype;
  v_inserted_invoice_id text;
  v_system_key text;
  v_grant_now integer;
  v_split_monthly boolean := false;
  v_slot integer;
  v_existing_access_until timestamptz;
  v_new_access_until timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  IF NULLIF(btrim(p_stripe_invoice_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_stripe_invoice_id is required';
  END IF;

  IF NULLIF(btrim(p_stripe_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_stripe_event_id is required';
  END IF;

  IF NULLIF(btrim(p_stripe_subscription_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_stripe_subscription_id is required';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION
      'Paid invoice period_start and period_end are required';
  END IF;

  IF p_period_end <= p_period_start THEN
    RAISE EXCEPTION
      'Paid invoice period_end must be after period_start';
  END IF;

  SELECT *
  INTO v_plan
  FROM public.premium_plans p
  WHERE p.code = p_plan_code
    AND p.active = true
  FOR UPDATE;

  IF v_plan.code IS NULL THEN
    RAISE EXCEPTION
      'Active Premium plan not found: %',
      p_plan_code;
  END IF;

  IF v_plan.provider_price_id IS NOT NULL
     AND NULLIF(btrim(p_stripe_price_id), '')
       IS DISTINCT FROM v_plan.provider_price_id
  THEN
    RAISE EXCEPTION
      'Stripe price does not match Premium plan configuration';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'premium_invoice:' ||
      p_stripe_invoice_id,
      0
    )
  );

  select coalesce((
    select pref.mode = 'monthly' from private.premium_coin_distribution_preferences pref
    where pref.user_id = p_user_id
  ), false) and v_plan.code in ('premium_quarterly','premium_yearly') into v_split_monthly;
  v_grant_now := case when v_split_monthly then 30 else v_plan.coins_per_paid_invoice end;
  v_system_key :=
    'stripe_invoice_' ||
    p_stripe_invoice_id;

  /*
   * Insert first. A duplicate invoice returns idempotently.
   * Any later failure rolls this insert back with the transaction.
   */
  INSERT INTO public.premium_invoice_payments (
    stripe_invoice_id,
    stripe_event_id,
    user_id,
    plan_code,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    billing_reason,
    amount_paid_cents,
    currency,
    period_start,
    period_end,
    coins_granted,
    ledger_system_key,
    stripe_event_created,
    raw_payload
  )
  VALUES (
    p_stripe_invoice_id,
    p_stripe_event_id,
    p_user_id,
    v_plan.code,
    NULLIF(btrim(p_stripe_customer_id), ''),
    p_stripe_subscription_id,
    NULLIF(btrim(p_stripe_price_id), ''),
    NULLIF(btrim(p_billing_reason), ''),
    p_amount_paid_cents,
    upper(NULLIF(btrim(p_currency), '')),
    p_period_start,
    p_period_end,
    v_grant_now,
    v_system_key,
    p_stripe_event_created,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (stripe_invoice_id) DO NOTHING
  RETURNING stripe_invoice_id
  INTO v_inserted_invoice_id;

  IF v_inserted_invoice_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok',
      true,
      'idempotent',
      true,
      'stripe_invoice_id',
      p_stripe_invoice_id,
      'coins_granted',
      0
    );
  END IF;

  SELECT s.access_until
  INTO v_existing_access_until
  FROM public.user_premium_subscriptions s
  WHERE s.user_id = p_user_id
  FOR UPDATE;

  v_new_access_until :=
    CASE
      WHEN v_existing_access_until IS NULL THEN
        p_period_end
      WHEN p_period_end > v_existing_access_until THEN
        p_period_end
      ELSE
        v_existing_access_until
    END;

  INSERT INTO public.user_premium_subscriptions (
    user_id,
    plan_code,
    provider,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_price_id,
    stripe_status,
    cancel_at_period_end,
    current_period_start,
    current_period_end,
    access_until,
    latest_invoice_id,
    last_paid_invoice_id,
    last_stripe_event_id,
    last_stripe_event_created,
    metadata
  )
  VALUES (
    p_user_id,
    v_plan.code,
    'stripe',
    NULLIF(btrim(p_stripe_customer_id), ''),
    p_stripe_subscription_id,
    NULLIF(btrim(p_stripe_price_id), ''),
    COALESCE(
      NULLIF(btrim(p_stripe_status), ''),
      'active'
    ),
    COALESCE(p_cancel_at_period_end, false),
    p_current_period_start,
    p_current_period_end,
    p_period_end,
    p_stripe_invoice_id,
    p_stripe_invoice_id,
    p_stripe_event_id,
    p_stripe_event_created,
    jsonb_build_object(
      'last_paid_billing_reason',
      p_billing_reason
    )
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    plan_code = EXCLUDED.plan_code,
    provider = EXCLUDED.provider,
    stripe_customer_id = EXCLUDED.stripe_customer_id,
    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
    stripe_price_id = EXCLUDED.stripe_price_id,

    stripe_status =
      CASE
        WHEN
          public.user_premium_subscriptions
            .last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created >=
            public.user_premium_subscriptions
              .last_stripe_event_created
        THEN EXCLUDED.stripe_status
        ELSE
          public.user_premium_subscriptions
            .stripe_status
      END,

    cancel_at_period_end =
      CASE
        WHEN
          public.user_premium_subscriptions
            .last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created >=
            public.user_premium_subscriptions
              .last_stripe_event_created
        THEN EXCLUDED.cancel_at_period_end
        ELSE
          public.user_premium_subscriptions
            .cancel_at_period_end
      END,

    current_period_start =
      CASE
        WHEN
          public.user_premium_subscriptions
            .last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created >=
            public.user_premium_subscriptions
              .last_stripe_event_created
        THEN EXCLUDED.current_period_start
        ELSE
          public.user_premium_subscriptions
            .current_period_start
      END,

    current_period_end =
      CASE
        WHEN
          public.user_premium_subscriptions
            .last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created >=
            public.user_premium_subscriptions
              .last_stripe_event_created
        THEN EXCLUDED.current_period_end
        ELSE
          public.user_premium_subscriptions
            .current_period_end
      END,

    access_until = v_new_access_until,

    latest_invoice_id =
      CASE
        WHEN
          public.user_premium_subscriptions
            .access_until IS NULL
          OR p_period_end >=
            public.user_premium_subscriptions
              .access_until
        THEN p_stripe_invoice_id
        ELSE
          public.user_premium_subscriptions
            .latest_invoice_id
      END,

    last_paid_invoice_id =
      CASE
        WHEN
          public.user_premium_subscriptions
            .access_until IS NULL
          OR p_period_end >=
            public.user_premium_subscriptions
              .access_until
        THEN p_stripe_invoice_id
        ELSE
          public.user_premium_subscriptions
            .last_paid_invoice_id
      END,

    last_stripe_event_id =
      CASE
        WHEN
          public.user_premium_subscriptions
            .last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created >=
            public.user_premium_subscriptions
              .last_stripe_event_created
        THEN EXCLUDED.last_stripe_event_id
        ELSE
          public.user_premium_subscriptions
            .last_stripe_event_id
      END,

    last_stripe_event_created =
      CASE
        WHEN
          public.user_premium_subscriptions
            .last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created IS NULL
          OR EXCLUDED.last_stripe_event_created >=
            public.user_premium_subscriptions
              .last_stripe_event_created
        THEN EXCLUDED.last_stripe_event_created
        ELSE
          public.user_premium_subscriptions
            .last_stripe_event_created
      END,

    metadata =
      public.user_premium_subscriptions.metadata
      || EXCLUDED.metadata;

  /*
   * The repaired wallet function rejects invalid debits and deduplicates
   * automated entries by payload_json.system_key.
   */
  PERFORM public.apply_coin_delta(
    p_user_id,
    v_grant_now,
    'premium_monthly_grant',
    jsonb_build_object(
      'system_key',
      v_system_key,
      'category',
      'premium_monthly_grant',
      'provider',
      'stripe',
      'plan_code',
      v_plan.code,
      'stripe_invoice_id',
      p_stripe_invoice_id,
      'stripe_subscription_id',
      p_stripe_subscription_id,
      'stripe_event_id',
      p_stripe_event_id,
      'billing_reason',
      p_billing_reason,
      'period_start',
      p_period_start,
      'period_end',
      p_period_end,
      'amount_paid_cents',
      p_amount_paid_cents,
      'currency',
      upper(NULLIF(btrim(p_currency), ''))
    )
  );

  if v_split_monthly then
    for v_slot in 1..(v_plan.coins_per_paid_invoice / 30 - 1) loop
      insert into private.premium_coin_installments
        (stripe_invoice_id,user_id,installment_number,coins,due_at)
      values(p_stripe_invoice_id,p_user_id,v_slot,30,p_period_start+make_interval(months=>v_slot))
      on conflict(stripe_invoice_id,installment_number) do nothing;
    end loop;
  end if;
  RETURN jsonb_build_object(
    'ok',
    true,
    'idempotent',
    false,
    'user_id',
    p_user_id,
    'plan_code',
    v_plan.code,
    'stripe_invoice_id',
    p_stripe_invoice_id,
    'access_until',
    v_new_access_until,
    'coins_granted',
    v_grant_now,
    'ledger_system_key',
    v_system_key
  );
END;
$function$
;
create or replace function private.grant_due_premium_coin_installments_v1()
returns jsonb language plpgsql security definer set search_path to 'public','private','pg_temp'
as $inst$
declare v record; v_paid integer:=0;
begin
 for v in select i.* from private.premium_coin_installments i
   where i.granted_at is null and i.due_at<=now()
   order by i.due_at,i.stripe_invoice_id,i.installment_number
   for update skip locked limit 250
 loop
   perform public.apply_coin_delta(v.user_id,v.coins,'premium_monthly_grant',
    jsonb_build_object('system_key','premium_installment:'||v.stripe_invoice_id||':'||v.installment_number,
    'stripe_invoice_id',v.stripe_invoice_id,'installment_number',v.installment_number,
    'grant_type','premium_paid_installment','due_at',v.due_at));
   update private.premium_coin_installments set granted_at=now()
    where stripe_invoice_id=v.stripe_invoice_id and installment_number=v.installment_number
      and granted_at is null;
   v_paid:=v_paid+1;
 end loop;
 return jsonb_build_object('ok',true,'coins_grants_processed',v_paid);
end; $inst$;
revoke all on function private.grant_due_premium_coin_installments_v1() from public,anon,authenticated;
select cron.schedule('premium-coin-installments-v1','15 5 * * *',
'select private.grant_due_premium_coin_installments_v1();')
where not exists(select 1 from cron.job where jobname='premium-coin-installments-v1');
