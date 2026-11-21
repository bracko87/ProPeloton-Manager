-- SAT-08: READ-ONLY isolated staging identity/expiry audit.
-- Run after real test players link email/Google, BEFORE and AFTER finalization.
-- An Auth label of is_anonymous=false does NOT indicate Saturn conversion.
-- No UPDATE/DELETE/INSERT and no guest signup enabled by this report.
select t.user_id,t.club_id,u.is_anonymous,
       t.started_at,t.expires_at,t.converted_at,
       case
         when t.converted_at is not null then 'fully_converted'
         when t.expires_at<=now() and u.is_anonymous is false
           then 'expired_linked_unconverted'
         when t.expires_at<=now() then 'expired_unconverted_anonymous'
         when u.is_anonymous is false then 'active_linked_unconverted'
         else 'active_unconverted_anonymous'
       end as saturn_account_state,
       (t.converted_at is null and t.expires_at<=now()) as must_be_read_only,
       (t.converted_at is null and t.started_at<=now() and t.expires_at>now())
         as active_trial_eligible
from public.saturn_test_accounts_v1 t
join auth.users u on u.id=t.user_id
order by t.started_at,t.user_id;
