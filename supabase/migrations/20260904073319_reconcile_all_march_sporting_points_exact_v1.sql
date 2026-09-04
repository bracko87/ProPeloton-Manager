do $$
declare
  v_total integer;
  v_processed integer;
  v_visible_bad integer;
  v_not_ready integer;
  r record;
  v_result jsonb;
  v_readiness jsonb;
begin
  select count(*)::integer
  into v_total
  from public.race_stages s
  where s.stage_date >= date '2000-03-01'
    and s.stage_date < date '2000-04-01';

  if v_total = 0 then
    raise exception 'March reconciliation aborted: no March stages found.';
  end if;

  select count(*)::integer
  into v_processed
  from public.race_stages s
  where s.stage_date >= date '2000-03-01'
    and s.stage_date < date '2000-04-01'
    and (
      exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      or exists (select 1 from public.race_stage_point_results pr where pr.stage_id=s.id)
      or exists (select 1 from public.race_stage_simulation_runs sr where sr.stage_id=s.id)
    );

  if v_processed <> 0 then
    raise exception 'March reconciliation aborted: % stages already have simulation/authoritative/point-result activity.', v_processed;
  end if;

  select count(*)::integer
  into v_visible_bad
  from public.race_stages s
  where s.stage_date >= date '2000-03-01'
    and s.stage_date < date '2000-04-01'
    and not coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'visible_sources_match')::boolean,false);

  if v_visible_bad <> 0 then
    raise exception 'March reconciliation aborted: % stages have stage JSON/profile disagreement.', v_visible_bad;
  end if;

  for r in
    select s.id, s.race_id, s.stage_number, s.stage_date
    from public.race_stages s
    where s.stage_date >= date '2000-03-01'
      and s.stage_date < date '2000-04-01'
    order by s.stage_date, s.race_id, s.stage_number, s.id
  loop
    v_result := public.reconcile_unprocessed_stage_sporting_points_v1(r.id);
    v_readiness := public.race_stage_sporting_point_profile_readiness_v1(r.id);

    if not coalesce((v_readiness->>'ready')::boolean,false) then
      raise exception 'March reconciliation failed for stage %: result %, readiness %', r.id, v_result, v_readiness;
    end if;
  end loop;

  select count(*)::integer
  into v_not_ready
  from public.race_stages s
  where s.stage_date >= date '2000-03-01'
    and s.stage_date < date '2000-04-01'
    and not coalesce((public.race_stage_sporting_point_profile_readiness_v1(s.id)->>'ready')::boolean,false);

  if v_not_ready <> 0 then
    raise exception 'March reconciliation verification failed: % stages remain not exact-ready.', v_not_ready;
  end if;
end;
$$;
