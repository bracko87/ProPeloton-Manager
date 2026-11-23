-- Official ProPeloton Manager release date change requested 19 November 2026.
-- December 10, 2026 07:00 CET = 2026-12-10 06:00 UTC.
--
-- Live database already rescheduled and validated on 19 Nov; this
-- versioned migration makes the explicit production change reproducible.
-- Strictly preserves all accounts, existing clubs, purchase entitlements,
-- reset snapshots and the paused game clock.
-- Safe to replay once: no-op if the desired dates are already present.
do $change$
declare
  v_old timestamptz := '2026-12-01 06:00:00+00'::timestamptz;
  v_new timestamptz := '2026-12-10 06:00:00+00'::timestamptz;
  v_current timestamptz;
  v_status text;
  v_published timestamptz;
  v_code text;
  v_old_message text:='ProPeloton Manager officially released on 1 December 2026 at 07:00 CET.';
  v_new_message text:='ProPeloton Manager officially released on 10 December 2026 at 07:00 CET.';
begin
  -- This migration only RESCHEDULES an already-approved historical release.
  -- A fresh installation intentionally has no release-control row or launch
  -- cron. Do not invent one or rewrite premium trials in that environment.
  if not exists (
    select 1 from private.ppm_december_2026_release_control_v1 where id=true
  ) then
    if exists (select 1 from public.premium_trial_launch_v1 where id=true and launched_at in (v_old,v_new))
       or exists (
         select 1 from public.premium_welcome_trials_v1
         where started_at in (v_old,v_new)
       ) then
      raise exception 'Partial release records exist without the release control';
    end if;
    raise notice 'Skipping one-time December release reschedule: no prior schedule on fresh install';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('ppm-december-2026-release-v1')::bigint);
  select release_at,status,launched_at into v_current,v_status,v_published
  from private.ppm_december_2026_release_control_v1 where id=true for update;

  if v_current not in (v_old,v_new) or v_status <> 'scheduled' or v_published is not null
  then
    raise exception 'Release schedule unexpectedly changed; refusing to overwrite';
  end if;

  if v_current=v_old then
    update private.ppm_december_2026_release_control_v1
    set release_at=v_new,updated_at=clock_timestamp()
    where id=true and release_at=v_old and status='scheduled';
  end if;

  select pg_get_functiondef('private.ppm_december_2026_release_tick_v1()'::regprocedure) into v_code;
  if strpos(v_code,v_old_message)>0 then
    execute replace(v_code,v_old_message,v_new_message);
  elsif strpos(v_code,v_new_message)=0 then
    raise exception 'Launch function copy changed unexpectedly';
  end if;

  if exists(select 1 from public.premium_trial_launch_v1
           where id=true and launched_at not in(v_old,v_new)) then
    raise exception 'Premium launch anchor has an unexpected date';
  end if;

  update public.premium_trial_launch_v1
  set launched_at=v_new where id=true and launched_at=v_old;

  if exists(select 1 from public.premium_welcome_trials_v1
            where started_at=v_old and
             (expires_at<>v_old+interval '7 days'
              or reminder_notified_at is not null
              or expiry_notified_at is not null)) then
    raise exception 'Premium trial data unexpected; no adjustment';
  end if;

  update public.premium_welcome_trials_v1
  set started_at=v_new,expires_at=v_new+interval '7 days'
  where started_at=v_old and expires_at=v_old+interval '7 days';

  update private.ppm_public_registration_gate_v1
  set reason='Registration is open. Official ProPeloton Manager release: 10 December 2026, 07:00 CET. Season 1 game time and seven-day free Premium trial begin at release.',
      updated_at=clock_timestamp()
  where id=true and registration_open=true
    and registration_phase='prelaunch_test' and launch_approved_at is null;
end $change$;
