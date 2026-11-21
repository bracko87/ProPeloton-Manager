-- SAT-SEC: read-only finance RPC effective-grant inventory.
-- Safe to run against production for OBSERVATION ONLY before changing grants,
-- or against isolated staging after proposed privilege hardening. This audit
-- does not modify existing users, financial ledger, clubs or SQL grants.
with target(name,signature) as (
 values
   ('finance_grant_new_club_bonus','public.finance_grant_new_club_bonus(uuid,bigint)'),
   ('finance_setup_new_club','public.finance_setup_new_club(uuid)'),
   ('finance_credit_to_club','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)'),
   ('finance_get_or_create_club_account','public.finance_get_or_create_club_account(uuid,text,text)'),
   ('finance_apply_club_house_tax_rebate_v1','public.finance_apply_club_house_tax_rebate_v1(uuid,date,date)'),
   ('finance_charge_emergency_loan_weekly_payment','public.finance_charge_emergency_loan_weekly_payment(uuid,date)'),
   ('finance_charge_race_cost','public.finance_charge_race_cost(uuid,uuid,bigint,jsonb)'),
   ('finance_create_club_house_rebate_v1','public.finance_create_club_house_rebate_v1(uuid,uuid,text,bigint,integer,text)'),
   ('finance_force_transfer_club_to_club','public.finance_force_transfer_club_to_club(uuid,uuid,bigint,text,text,text,jsonb)'),
   ('finance_issue_emergency_loan_non_ai_core_v1','public.finance_issue_emergency_loan_non_ai_core_v1(uuid,text,text,text)'),
   ('finance_run_monthly_tax_audit_for_club','public.finance_run_monthly_tax_audit_for_club(uuid,date,date,boolean)'),
   ('race_engine_refund_one_day_weather_cancelled_race_v1','public.race_engine_refund_one_day_weather_cancelled_race_v1(uuid)'),
   ('refund_one_day_weather_cancelled_race_v2','public.refund_one_day_weather_cancelled_race_v2(uuid)'),
   ('finance_spend_from_club','public.finance_spend_from_club(uuid,bigint,text,text,text,jsonb)'),
   ('finance_spend_from_club_non_ai_core_v1','public.finance_spend_from_club_non_ai_core_v1(uuid,bigint,text,text,text,jsonb)'),
   ('finance_issue_emergency_loan','public.finance_issue_emergency_loan(uuid,text,text,text)'),
   ('finance_liquidate_club_for_insolvency','public.finance_liquidate_club_for_insolvency(uuid,text,text)'),
   ('finance_liquidate_club_for_insolvency_non_ai_core_v1','public.finance_liquidate_club_for_insolvency_non_ai_core_v1(uuid,text,text)'),
   ('finance_ensure_mandatory_funds','public.finance_ensure_mandatory_funds(uuid,bigint,text,text,text)'),
   ('finance_ensure_mandatory_funds_non_ai_core_v1','public.finance_ensure_mandatory_funds_non_ai_core_v1(uuid,bigint,text,text,text)'),
   ('finance_process_weekly_emergency_loan_repayments','public.finance_process_weekly_emergency_loan_repayments()'),
   ('finance_run_due_monthly_tax_audits','public.finance_run_due_monthly_tax_audits(boolean)')
)
select target.name,
       target.signature,
       (to_regprocedure(target.signature) is not null) as exists_in_database,
       coalesce(has_function_privilege('anon',to_regprocedure(target.signature),'EXECUTE'),false) as anon_can_execute,
       coalesce(has_function_privilege('authenticated',to_regprocedure(target.signature),'EXECUTE'),false) as authenticated_can_execute,
       coalesce(has_function_privilege('service_role',to_regprocedure(target.signature),'EXECUTE'),false) as service_role_can_execute,
       coalesce((select p.prosecdef from pg_proc p where p.oid=to_regprocedure(target.signature)),false) as security_definer
from target
order by target.name;

-- Direct textual routine references, not a proof of the complete call graph.
-- Review dynamic SQL, deployed Edge Functions, indirect wrappers and app
-- callers separately. Do not print routine bodies or scheduler commands.
with routines as (
  select p.oid,n.nspname,p.proname,
    pg_get_function_identity_arguments(p.oid) as args,
    p.prosecdef,pg_get_userbyid(p.proowner) as owner,p.prosrc
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private','finance','control_center_private','archive')
    and p.prokind in ('f','p')
), refs as (
  select r.*,t.target
  from routines r cross join (values
    ('finance_grant_new_club_bonus'),('finance_setup_new_club'),
    ('finance_credit_to_club'),('finance_get_or_create_club_account'),
    ('finance_apply_club_house_tax_rebate_v1'),
    ('finance_charge_emergency_loan_weekly_payment'),
    ('finance_charge_race_cost'),
    ('finance_create_club_house_rebate_v1'),
    ('finance_force_transfer_club_to_club'),
    ('finance_issue_emergency_loan_non_ai_core_v1'),
    ('finance_run_monthly_tax_audit_for_club'),
    ('race_engine_refund_one_day_weather_cancelled_race_v1'),
    ('refund_one_day_weather_cancelled_race_v2'),
    ('finance_spend_from_club'),
    ('finance_spend_from_club_non_ai_core_v1'),
    ('finance_issue_emergency_loan'),
    ('finance_liquidate_club_for_insolvency'),
    ('finance_liquidate_club_for_insolvency_non_ai_core_v1'),
    ('finance_ensure_mandatory_funds'),
    ('finance_ensure_mandatory_funds_non_ai_core_v1'),
    ('finance_process_weekly_emergency_loan_repayments'),
    ('finance_run_due_monthly_tax_audits')
  ) t(target)
  where strpos(lower(r.prosrc),t.target)>0 and r.proname<>t.target
)
select nspname,proname,args,prosecdef,owner,
  array_agg(target order by target) as referenced_primitives,
  has_function_privilege('anon',oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',oid,'EXECUTE') as service_execute,
  case when not prosecdef then 'REVIEW INVOKER'
       when owner<>'postgres' then 'REVIEW OWNER'
       else 'DEFINER OWNER PATH; REVIEW WRAPPER AUTHORIZATION' end as review_status
from refs
group by oid,nspname,proname,args,prosecdef,owner
order by nspname,proname,args;

-- Run separately only where pg_cron is installed and accessible:
-- select count(*) filter(where active) as active_jobs,count(*) as total_jobs,
-- count(*) filter(where command ~* 'finance_grant_new_club_bonus|finance_setup_new_club|finance_credit_to_club|finance_get_or_create_club_account') as direct_target_jobs
-- from cron.job;
