do $$
declare
  v_stage record;
  v_before jsonb;
  v_reconcile jsonb;
  v_after jsonb;
  v_count integer := 0;
begin
  -- Guard the entire month before modifying anything.
  if exists (
    select 1
    from public.race_stages s
    where extract(month from s.stage_date)=6
      and (
        exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
        or exists(select 1 from public.race_stage_simulation_runs r where r.stage_id=s.id)
        or exists(select 1 from public.race_stage_point_results pr where pr.stage_id=s.id)
      )
  ) then
    raise exception 'June reconciliation aborted: at least one stage has simulation/authoritative/official point-result activity.';
  end if;

  for v_stage in
    select s.id, s.stage_date, s.stage_number, r.name as race_name
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where extract(month from s.stage_date)=6
    order by s.stage_date, r.name, s.stage_number, s.id
  loop
    if not exists (select 1 from public.race_stage_profile_details p where p.stage_id=v_stage.id) then
      raise exception 'June reconciliation aborted: profile missing for stage % (% stage %).', v_stage.id, v_stage.race_name, v_stage.stage_number;
    end if;

    v_before := public.race_stage_sporting_point_profile_readiness_v1(v_stage.id);
    if not coalesce((v_before->>'visible_sources_match')::boolean,false) then
      raise exception 'June reconciliation aborted: visible stage/profile mismatch for stage % (% stage %): %', v_stage.id, v_stage.race_name, v_stage.stage_number, v_before;
    end if;

    v_reconcile := public.reconcile_unprocessed_stage_sporting_points_v1(v_stage.id);
    v_after := public.race_stage_sporting_point_profile_readiness_v1(v_stage.id);

    if not coalesce((v_after->>'ready')::boolean,false) then
      raise exception 'June reconciliation failed exact readiness for stage % (% stage %). reconcile=% after=%', v_stage.id, v_stage.race_name, v_stage.stage_number, v_reconcile, v_after;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_count <> (select count(*) from public.race_stages where extract(month from stage_date)=6) then
    raise exception 'June reconciliation stage-count mismatch: processed %, expected %', v_count, (select count(*) from public.race_stages where extract(month from stage_date)=6);
  end if;
end
$$;
