-- SAT-12 read-only role grant audit. No payout or tax RPC invocation.
select p.oid::regprocedure::text as function_signature,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('finance_grant_sponsor_contract_payment','finance_apply_income_tax')
order by function_signature;