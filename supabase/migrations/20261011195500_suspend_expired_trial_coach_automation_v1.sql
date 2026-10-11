-- An expired seven-day trial loses server-side Premium eligibility immediately.
-- Ensure any future auto-generated Head Coach plans cannot continue running on
-- game ticks after the expiration boundary. Paid subscribers are excluded.
create or replace function public.suspend_expired_trial_head_coach_automation_v1()
returns integer language plpgsql security definer set search_path=''
as $fn$
declare
  v_count integer:=0;
begin
  with affected as (
    update public.club_regular_training_automation a
    set is_enabled=false,
        metadata=coalesce(a.metadata,'{}'::jsonb) ||
          jsonb_build_object('disabled_reason','premium_trial_expired','disabled_at',now()),
        updated_at=now()
    from public.clubs c
    join public.premium_welcome_trials_v1 t on t.user_id=c.owner_user_id
    where a.club_id=c.id
      and a.is_enabled=true
      and c.deleted_at is null
      and t.expires_at<=now()
      and not public.user_has_paid_premium_access_v1(t.user_id)
    returning a.club_id
  ), superseded as (
    update public.rider_regular_training_daily_plans p
    set status='superseded',
        decision_reason_json=coalesce(p.decision_reason_json,'{}'::jsonb) ||
          jsonb_build_object('superseded_reason','premium_trial_expired','superseded_at',now()),
        updated_at=now()
    where p.club_id in(select club_id from affected)
      and p.plan_date >= public.get_current_game_date_date()
      and p.source_type in ('head_coach','u23_head_coach')
      and p.status='planned'
    returning p.rider_id
  )
  select count(*) into v_count from affected;

  return v_count;
end;
$fn$;
revoke all on function public.suspend_expired_trial_head_coach_automation_v1()
  from public,anon,authenticated;
grant execute on function public.suspend_expired_trial_head_coach_automation_v1()
  to service_role;

select cron.schedule(
 'premium-trial-head-coach-expiry-v1',
 '*/5 * * * *',
 'select public.suspend_expired_trial_head_coach_automation_v1()'
);
