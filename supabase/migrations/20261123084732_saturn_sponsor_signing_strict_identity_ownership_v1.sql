-- SAT-12B: Fix sponsor_sign_offer() identity-null ownership bypass.
-- This user-facing RPC stays callable for rightful club owners. Internal
-- sponsor payment helpers from SAT-12 remain private to privileged callers.
-- Recreates the exact current function body with ONE authorization predicate
-- replaced; no sponsor offer is signed, no money or player data is modified.
do $sat12$
declare
  v_oid oid := to_regprocedure('public.sponsor_sign_offer(uuid)');
  v_definition text;
  v_old text := $old$if auth.uid() is not null
     and auth.role() <> 'service_role'
     and v_offer.owner_user_id <> auth.uid() then$old$;
  v_new text := $new$if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or v_offer.owner_user_id is distinct from auth.uid()) then$new$;
begin
  if v_oid is null or not exists (
    select 1 from pg_proc p
    where p.oid=v_oid and p.prosecdef and p.proowner='postgres'::regrole
  ) then
    raise exception 'SAT12B sponsor signing definer drift';
  end if;
  select pg_get_functiondef(v_oid) into v_definition;
  if (length(v_definition)-length(replace(v_definition,v_old,''))) / length(v_old) <> 1 then
    raise exception 'SAT12B original ownership guard drift';
  end if;
  v_definition := replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$sat12$;