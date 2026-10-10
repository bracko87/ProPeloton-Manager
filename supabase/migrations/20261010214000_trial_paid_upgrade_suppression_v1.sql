-- A paid upgrade supersedes the seven-day promotional trial.
create or replace function public.get_my_premium_trial_onboarding_v1(
  p_action text default null
) returns jsonb language plpgsql security definer set search_path=''
as $fn$
declare
  v_user uuid:=auth.uid();
  v_created timestamptz;
  v_email text;
  v_hash text;
  v_trial public.premium_welcome_trials_v1%rowtype;
  v_now timestamptz:=now();
  v_launch timestamptz;
  v_action text:=coalesce(p_action,'');
  v_started boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select p.created_at, coalesce(nullif(trim(p.email),''),u.email)
  into v_created,v_email
  from public.profiles p join auth.users u on u.id=p.id
  where p.id=v_user;
  if v_created is null then return jsonb_build_object('state','not_ready'); end if;
  select launched_at into v_launch from public.premium_trial_launch_v1 where id=true;
  v_hash:=md5(lower(trim(coalesce(v_email,v_user::text))));

  perform pg_advisory_xact_lock(hashtext('premium_welcome:'||v_user::text));
  select * into v_trial from public.premium_welcome_trials_v1 where user_id=v_user;

  if v_trial.user_id is null and v_created >= v_launch
    and not public.user_has_paid_premium_access_v1(v_user)
  then
    insert into public.premium_welcome_trials_v1
      (user_id,account_email_hash,started_at,expires_at)
    values (v_user,v_hash,v_now,v_now+interval '7 days')
    on conflict do nothing
    returning * into v_trial;
    v_started:=v_trial.user_id is not null;
  end if;

  if v_trial.user_id is null then
    return jsonb_build_object('state','ineligible','is_premium',public.user_has_premium_access_v1(v_user));
  end if;

  if v_action='dismiss_welcome' then
    update public.premium_welcome_trials_v1
      set welcome_dismissed_at=coalesce(welcome_dismissed_at,v_now)
    where user_id=v_user;
  elsif v_action='dismiss_expired' then
    update public.premium_welcome_trials_v1
      set expiry_dismissed_at=coalesce(expiry_dismissed_at,v_now)
    where user_id=v_user and expires_at<=v_now;
  elsif v_action not in ('','status') then
    raise exception 'Unsupported onboarding action';
  end if;

  select * into v_trial from public.premium_welcome_trials_v1 where user_id=v_user;

  -- A subsequent paid subscription supersedes any promotional trial.
  -- Never display an expiry popup or send an expiry message to a payer.
  if public.user_has_paid_premium_access_v1(v_user) then
    return jsonb_build_object('state','subscribed','show_welcome',false,'show_expired',false);
  end if;

  if v_trial.expires_at <= v_now and v_trial.expiry_notified_at is null then
    perform public.create_user_game_notification_v1(
      v_user,'WELCOME_MESSAGE','Your Premium trial has ended',
      'Thanks for playing ProPeloton Manager! Your free Premium trial has ended. Your team and progress are safe. You can continue for free or explore Premium plans.',
      '/dashboard/pro',
      jsonb_build_object('system_key','premium_trial_expired_v1','category','premium_trial','kind','expired'),
      'premium_trial_expired:'||v_user::text
    );
    update public.premium_welcome_trials_v1 set expiry_notified_at=v_now where user_id=v_user;
  elsif v_trial.expires_at>v_now
     and v_trial.expires_at<=v_now+interval '24 hours'
     and v_trial.reminder_notified_at is null then
    perform public.create_user_game_notification_v1(
      v_user,'WELCOME_MESSAGE','Your Premium trial ends soon',
      'Your seven-day Premium trial ends within 24 hours. Enjoy your remaining access, or visit the Pro Package page to continue.',
      '/dashboard/pro',
      jsonb_build_object('system_key','premium_trial_reminder_v1','category','premium_trial','kind','reminder'),
      'premium_trial_reminder:'||v_user::text
    );
    update public.premium_welcome_trials_v1 set reminder_notified_at=v_now where user_id=v_user;
  end if;

  return jsonb_build_object(
    'state',case when v_trial.expires_at>v_now then 'active' else 'expired' end,
    'trial_started',v_started,
    'started_at',v_trial.started_at,'expires_at',v_trial.expires_at,
    'seconds_left',greatest(0,ceil(extract(epoch from v_trial.expires_at-v_now))),
    'show_welcome',v_trial.welcome_dismissed_at is null and v_trial.expires_at>v_now,
    'show_expired',v_trial.expiry_dismissed_at is null and v_trial.expires_at<=v_now
  );
end;
$fn$;