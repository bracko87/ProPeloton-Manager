-- SAT-SEC: read-only finance RPC effective-grant inventory.
-- Safe to run against production for OBSERVATION ONLY before changing grants,
-- or against isolated staging after proposed privilege hardening. This audit
-- does not modify existing users, financial ledger, clubs or SQL grants.
with target(name,signature) as (
 values
   ('finance_grant_new_club_bonus','public.finance_grant_new_club_bonus(uuid,bigint)'),
   ('finance_setup_new_club','public.finance_setup_new_club(uuid)'),
   ('finance_credit_to_club','public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)'),
   ('finance_get_or_create_club_account','public.finance_get_or_create_club_account(uuid,text,text)')
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
    ('finance_credit_to_club'),('finance_get_or_create_club_account')
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
