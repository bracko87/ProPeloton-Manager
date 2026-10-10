-- Deliver trial reminder/expiry inbox messages on real-world clock,
-- including when the player is offline. Safe to re-run (event keys and flags).
create or replace function public.process_premium_trial_notifications_v1()
returns integer language plpgsql security definer set search_path=''
as $fn$
declare
 v public.premium_welcome_trials_v1%rowtype;
 v_done integer:=0;
begin
 for v in
   select * from public.premium_welcome_trials_v1 t
   where (
     (t.expires_at>now() and t.expires_at<=now()+interval '24 hours'
       and t.reminder_notified_at is null)
     or (t.expires_at<=now() and t.expiry_notified_at is null)
   )
   order by t.expires_at
   limit 500
   for update skip locked
 loop
   if public.user_has_paid_premium_access_v1(v.user_id) then
     update public.premium_welcome_trials_v1
       set reminder_notified_at=coalesce(reminder_notified_at,now()),
           expiry_notified_at=coalesce(expiry_notified_at,now())
       where user_id=v.user_id;
     continue;
   end if;
   if v.expires_at<=now() then
     perform public.create_user_game_notification_v1(
       v.user_id,'WELCOME_MESSAGE','Your Premium trial has ended',
       'Thanks for playing! Your free Premium trial has ended. Your team and progress remain safe. Continue for free or explore the Pro Package page.',
       '/dashboard/pro',
       jsonb_build_object('system_key','premium_trial_expired_v1','category','premium_trial','kind','expired'),
       'premium_trial_expired:'||v.user_id::text
     );
     update public.premium_welcome_trials_v1 set expiry_notified_at=now()
       where user_id=v.user_id;
   else
     perform public.create_user_game_notification_v1(
       v.user_id,'WELCOME_MESSAGE','Your Premium trial ends soon',
       'Your Premium trial ends within 24 hours. You may continue playing for free, or explore the Pro Package page to keep Premium features.',
       '/dashboard/pro',
       jsonb_build_object('system_key','premium_trial_reminder_v1','category','premium_trial','kind','reminder'),
       'premium_trial_reminder:'||v.user_id::text
     );
     update public.premium_welcome_trials_v1 set reminder_notified_at=now()
       where user_id=v.user_id;
   end if;
   v_done:=v_done+1;
 end loop;
 return v_done;
end;
$fn$;
revoke all on function public.process_premium_trial_notifications_v1() from public,anon,authenticated;
grant execute on function public.process_premium_trial_notifications_v1() to service_role;

-- Runs once hourly. The game clock does not control a REAL-DAY trial.
select cron.schedule(
  'premium-trial-notifications-hourly-v1',
  '7 * * * *',
  'select public.process_premium_trial_notifications_v1()'
);
