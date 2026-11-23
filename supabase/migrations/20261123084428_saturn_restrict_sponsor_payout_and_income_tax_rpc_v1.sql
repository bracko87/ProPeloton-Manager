-- SAT-12: Close direct untrusted financial ledger write RPCs.
-- PUBLIC/anon/authenticated must not select arbitrary sponsor payout amounts
-- or generate tax debits for another club. Internal SECURITY DEFINER flows
-- owned by postgres continue to invoke these helpers.
-- No financial transactions, club balances or user rows are changed here.
do $check$
declare
 v_signature text;
 v_oid oid;
 v_name text;
begin
 for v_signature in select x.sig from (values
   ('public.finance_grant_sponsor_contract_payment(uuid,uuid,bigint,jsonb)'),
   ('public.finance_apply_income_tax(uuid,uuid,text,bigint,jsonb)')
 ) x(sig)
 loop
   v_oid := to_regprocedure(v_signature);
   if v_oid is null or not exists (
     select 1 from pg_proc p
     where p.oid=v_oid and p.prosecdef and p.proowner='postgres'::regrole
   ) then
     raise exception 'SAT12 missing or changed SECURITY DEFINER helper: %',v_signature;
   end if;
   select proname into v_name from pg_proc where oid=v_oid;
   if exists(
     select 1 from pg_proc p
     where p.oid<>v_oid and not p.prosecdef and p.prosrc ilike '%'||v_name||'%'
   ) or exists(select 1 from pg_trigger t where t.tgfoid=v_oid and not t.tgisinternal)
     or exists(select 1 from pg_depend d join pg_rewrite rw on rw.oid=d.objid where d.refobjid=v_oid)
   then
     raise exception 'SAT12 unreviewed direct caller, trigger or view: %',v_signature;
   end if;
 end loop;
end;
$check$;

revoke execute on function public.finance_grant_sponsor_contract_payment(uuid,uuid,bigint,jsonb)
  from public, anon, authenticated;
revoke execute on function public.finance_apply_income_tax(uuid,uuid,text,bigint,jsonb)
  from public, anon, authenticated;
grant execute on function public.finance_grant_sponsor_contract_payment(uuid,uuid,bigint,jsonb)
  to service_role;
grant execute on function public.finance_apply_income_tax(uuid,uuid,text,bigint,jsonb)
  to service_role;