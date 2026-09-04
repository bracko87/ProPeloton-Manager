do $$
declare
  v_stage record;
  v_result jsonb;
  v_ready jsonb;
  v_count integer := 0;
begin
  if exists (
    select 1
    from public.race_stages s
    where extract(month from s.stage_date)=2
      and exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id
      )
  ) then
    raise exception 'February sporting-point reconciliation aborted: authoritative run exists.';
  end if;

  if exists (
    select 1
    from public.race_stages s
    where extract(month from s.stage_date)=2
      and exists (
        select 1 from public.race_stage_point_results pr where pr.stage_id=s.id
      )
  ) then
    raise exception 'February sporting-point reconciliation aborted: official point results exist.';
  end if;

  if exists (
    select 1
    from public.race_stages s
    cross join lateral public.race_stage_sporting_point_profile_readiness_v1(s.id) r
    where extract(month from s.stage_date)=2
      and not coalesce((r->>'visible_sources_match')::boolean,false)
  ) then
    raise exception 'February sporting-point reconciliation aborted: visible stage/profile sources disagree.';
  end if;

  for v_stage in
    select s.id, s.stage_date, s.stage_number, r.name as race_name
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where extract(month from s.stage_date)=2
    order by s.stage_date, r.name, s.stage_number, s.id
  loop
    v_result := public.reconcile_unprocessed_stage_sporting_points_v1(v_stage.id);
    v_ready := public.race_stage_sporting_point_profile_readiness_v1(v_stage.id);

    if not coalesce((v_ready->>'ready')::boolean,false) then
      raise exception 'February reconciliation failed for % stage % (%): result=%, readiness=%',
        v_stage.race_name, v_stage.stage_number, v_stage.id, v_result, v_ready;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count <> 128 then
    raise exception 'February sporting-point reconciliation expected 128 stages but processed %.', v_count;
  end if;
end $$;
