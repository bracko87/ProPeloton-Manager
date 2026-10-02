-- Phase 2A security hardening:
-- Youth Academy is Premium-only. Mirror the UI read-only state on the RPC so
-- an expired Premium account cannot accept/refuse recruitment approaches
-- through a direct RPC call.

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='respond_to_youth_recruitment_offer_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'respond_to_youth_recruitment_offer_v1 not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);

  if position('Premium membership is required to manage Youth recruitment offers.' in v_def)=0 then
    v_new:=replace(
      v_def,
      $old$  if v_user is null then raise exception 'Not authenticated'; end if;

  select o.* into v_offer$old$,
      $new$  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth recruitment offers.';
  end if;

  select o.* into v_offer$new$
    );

    if v_new=v_def then
      raise exception 'Youth incoming-offer Premium guard patch point not found';
    end if;

    execute v_new;
  end if;
end $$;
