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
