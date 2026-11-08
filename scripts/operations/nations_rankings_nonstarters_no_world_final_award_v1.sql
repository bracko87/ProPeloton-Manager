-- Only nations that really started a rider in this group's official events
-- may receive championship ranking points. Keep valid qualification awards.
CREATE OR REPLACE FUNCTION private.award_nations_team_ranking_points_v1(p_group_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inserted integer:=0;
begin
  insert into public.nations_team_ranking_points(
    association_id,edition_id,season_number,round_id,group_id,
    phase,final_group_rank,points,scale_version
  )
  select
    ce.association_id,
    r.edition_id,
    ed.season_number,
    r.id,
    g.id,
    case when r.round_type='world_final' then 'world_final' else 'qualification' end,
    nge.final_group_rank,
    ps.points,
    1
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  join public.nations_group_entries nge on nge.group_id=g.id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  join public.nations_team_ranking_point_scale ps
    on ps.version=1
   and ps.phase=case when r.round_type='world_final' then 'world_final' else 'qualification' end
   and ps.finishing_position=nge.final_group_rank
  where g.id=p_group_id
    and g.status='completed'
    and nge.status<>'withdrawn'
    and nge.final_group_rank between 1 and 16
    -- Qualification alone cannot earn points for a round in which the nation
    -- never started a rider. A valid DNF/OTL still counts as participating.
    and exists (
      select 1
      from public.national_association_race_team_identities ti
      join public.nations_group_events ev on ev.group_id=g.id
      join public.race_stage_results result
        on result.stage_id=ev.stage_id
       and result.team_id=ti.technical_club_id
       and result.status in ('finished','dnf','otl')
      join public.race_stage_authoritative_runs official
        on official.stage_id=result.stage_id
       and official.simulation_run_id=result.simulation_run_id
      where ti.association_id=ce.association_id
    )
  on conflict(group_id,association_id) do update
  set final_group_rank=excluded.final_group_rank,
      points=excluded.points,
      phase=excluded.phase,
      scale_version=excluded.scale_version,
      awarded_at=now();

  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;

-- Correct the single already-recorded World Final award to Albania.
-- Preserve the ledger record and all earlier qualification ranking points.
do $disqualified_award$
declare
  v_albania_association_id uuid;
  v_previous integer;
  v_rows integer;
begin
  select ce.association_id into strict v_albania_association_id
  from public.nations_group_entries nge
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where nge.group_id='d8606846-ffc3-4df8-86cc-1e29ebac8eba'::uuid
    and ce.country_code='AL';

  select p.points into strict v_previous
  from public.nations_team_ranking_points p
  where p.group_id='d8606846-ffc3-4df8-86cc-1e29ebac8eba'::uuid
    and p.association_id=v_albania_association_id
    and p.phase='world_final';

  if v_previous<>70 then
    raise exception 'Unexpected existing Albania World Final award %: leaving it untouched.',v_previous;
  end if;

  if exists (
    select 1 from public.nations_group_events e
    join public.race_stage_results rr on rr.stage_id=e.stage_id
    join public.race_stage_authoritative_runs ar
      on ar.stage_id=rr.stage_id and ar.simulation_run_id=rr.simulation_run_id
    join public.national_association_race_team_identities ti
      on ti.technical_club_id=rr.team_id
    where e.group_id='d8606846-ffc3-4df8-86cc-1e29ebac8eba'::uuid
      and ti.association_id=v_albania_association_id
      and rr.status in ('finished','dnf','otl')
  ) then
    raise exception 'Albania actually started a rider: refusing to change ranking points.';
  end if;

  update public.nations_team_ranking_points
  set points=0,awarded_at=now()
  where group_id='d8606846-ffc3-4df8-86cc-1e29ebac8eba'::uuid
    and association_id=v_albania_association_id
    and phase='world_final'
    and points=70;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then
    raise exception 'Expected exactly one Alabama World Final correction, got %',v_rows;
  end if;
end;
$disqualified_award$;
