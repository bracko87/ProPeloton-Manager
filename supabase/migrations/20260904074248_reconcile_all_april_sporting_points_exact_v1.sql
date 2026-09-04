do $$
declare
  v_stage record;
  v_result jsonb;
  v_readiness jsonb;
  v_total integer;
  v_ready integer;
begin
  select count(*)::integer into v_total
  from public.race_stages s
  where s.stage_date >= date '2000-04-01'
    and s.stage_date < date '2000-05-01';

  if v_total = 0 then
    raise exception 'April sporting-point reconciliation aborted: no April stages found.';
  end if;

  if exists (
    select 1
    from public.race_stages s
    where s.stage_date >= date '2000-04-01'
      and s.stage_date < date '2000-05-01'
      and not exists (
        select 1 from public.race_stage_profile_details p where p.stage_id=s.id
      )
  ) then
    raise exception 'April sporting-point reconciliation aborted: one or more stage profiles are missing.';
  end if;

  if exists (
    select 1
    from public.race_stages s
    where s.stage_date >= date '2000-04-01'
      and s.stage_date < date '2000-05-01'
      and not coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'visible_sources_match')::boolean,false)
  ) then
    raise exception 'April sporting-point reconciliation aborted: stage JSON/profile disagreement exists.';
  end if;

  if exists (
    select 1
    from public.race_stages s
    where s.stage_date >= date '2000-04-01'
      and s.stage_date < date '2000-05-01'
      and (
        exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
        or exists(select 1 from public.race_stage_simulation_runs r where r.stage_id=s.id)
        or exists(select 1 from public.race_stage_point_results pr where pr.stage_id=s.id)
      )
  ) then
    raise exception 'April sporting-point reconciliation aborted: processed/touched stage exists.';
  end if;

  for v_stage in
    select s.id, s.stage_date, s.stage_number
    from public.race_stages s
    where s.stage_date >= date '2000-04-01'
      and s.stage_date < date '2000-05-01'
    order by s.stage_date, s.stage_number, s.id
  loop
    v_result := public.reconcile_unprocessed_stage_sporting_points_v1(v_stage.id);
    v_readiness := public.race_stage_sporting_point_profile_readiness_v1(v_stage.id);

    if not coalesce((v_readiness->>'ready')::boolean,false) then
      raise exception 'April stage % failed exact reconciliation. Result: %, readiness: %', v_stage.id, v_result, v_readiness;
    end if;
  end loop;

  select count(*)::integer into v_ready
  from public.race_stages s
  where s.stage_date >= date '2000-04-01'
    and s.stage_date < date '2000-05-01'
    and coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'ready')::boolean,false);

  if v_ready <> v_total then
    raise exception 'April sporting-point reconciliation incomplete: % of % exact-ready.', v_ready, v_total;
  end if;
end;
$$;
