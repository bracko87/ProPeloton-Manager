do $migration$
declare
  v_stage record;
  v_result jsonb;
  v_readiness jsonb;
  v_stage_count integer;
  v_bad_visible integer;
  v_touched integer;
  v_missing_profiles integer;
begin
  select count(*) into v_stage_count
  from public.race_stages s
  where s.stage_date >= date '2000-05-01' and s.stage_date < date '2000-06-01';

  if v_stage_count <> 229 then
    raise exception 'May sporting-point reconciliation aborted: expected 229 stages, found %', v_stage_count;
  end if;

  select count(*) into v_missing_profiles
  from public.race_stages s
  where s.stage_date >= date '2000-05-01' and s.stage_date < date '2000-06-01'
    and not exists (select 1 from public.race_stage_profile_details p where p.stage_id=s.id);

  if v_missing_profiles <> 0 then
    raise exception 'May sporting-point reconciliation aborted: % stages have no profile', v_missing_profiles;
  end if;

  select count(*) into v_touched
  from public.race_stages s
  where s.stage_date >= date '2000-05-01' and s.stage_date < date '2000-06-01'
    and (
      exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      or exists(select 1 from public.race_stage_simulation_runs r where r.stage_id=s.id)
      or exists(select 1 from public.race_stage_point_results pr where pr.stage_id=s.id)
    );

  if v_touched <> 0 then
    raise exception 'May sporting-point reconciliation aborted: % stages already have engine/result activity', v_touched;
  end if;

  select count(*) into v_bad_visible
  from public.race_stages s
  where s.stage_date >= date '2000-05-01' and s.stage_date < date '2000-06-01'
    and not coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'visible_sources_match')::boolean,false);

  if v_bad_visible <> 0 then
    raise exception 'May sporting-point reconciliation aborted: % stage/profile definitions disagree', v_bad_visible;
  end if;

  for v_stage in
    select s.id,s.stage_number,s.stage_date
    from public.race_stages s
    where s.stage_date >= date '2000-05-01' and s.stage_date < date '2000-06-01'
    order by s.stage_date,s.race_id,s.stage_number,s.id
  loop
    v_result := public.reconcile_unprocessed_stage_sporting_points_v1(v_stage.id);
    v_readiness := public.race_stage_sporting_point_profile_readiness_v1(v_stage.id);

    if not coalesce((v_readiness->>'ready')::boolean,false) then
      raise exception 'May sporting-point reconciliation failed for stage % (% stage %): result %, readiness %',
        v_stage.id,v_stage.stage_date,v_stage.stage_number,v_result,v_readiness;
    end if;
  end loop;

  if exists (
    select 1
    from public.race_stages s
    where s.stage_date >= date '2000-05-01' and s.stage_date < date '2000-06-01'
      and not coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'ready')::boolean,false)
  ) then
    raise exception 'May sporting-point reconciliation aborted: post-reconciliation exact-readiness assertion failed';
  end if;
end
$migration$;
