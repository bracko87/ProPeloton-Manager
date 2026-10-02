-- Phase 2A production fix:
-- The human-Academy Premium guard needs the source club owner. The previous
-- patch referenced c.owner_user_id without joining public.clubs as c.

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
    and p.proname='run_my_youth_scouting_cycle_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'run_my_youth_scouting_cycle_v1 not found';
  end if;

  v_def:=pg_get_functiondef(v_oid);

  -- Idempotent: only add the join when it is not already present.
  if position('join public.clubs c on c.id=a.club_id' in v_def)=0 then
    v_new:=replace(
      v_def,
      $old$      join public.youth_academies a on a.id=r.academy_id
      where a.id<>v_academy.id$old$,
      $new$      join public.youth_academies a on a.id=r.academy_id
      join public.clubs c on c.id=a.club_id
      where a.id<>v_academy.id$new$
    );

    if v_new=v_def then
      raise exception 'Youth scouting source-club join patch point not found';
    end if;

    execute v_new;
  end if;
end $$;
