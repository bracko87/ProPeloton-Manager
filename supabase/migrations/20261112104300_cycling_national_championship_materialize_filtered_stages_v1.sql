-- Make national championship source-stage selection filter eligible
-- country stages first and rank only the reduced candidate set.
-- MATERIALIZED prevents the planner from sorting all stages by deterministic
-- hash before applying host-country and eligibility checks.
-- The filters, preferred private-reserve priority and final MD5 tie-break
-- are identical to the preexisting algorithm.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.national_championship_pick_source_stage_for_window_v2(text,integer,text,date,date,uuid)'::regprocedure)
 INTO v_src;
 IF v_src IS NULL OR
   (length(v_src)-length(replace(v_src,'  select s.id
  into v_stage
  from public.race_stages s','')))/length('  select s.id
  into v_stage
  from public.race_stages s')<>1
   OR (length(v_src)-length(replace(v_src,'  order by
    case
      when rp.race_id is not null and rp.is_calendar_public=false then 0
      else 1
    end,
    md5(
      s.id::text||'':''||v_country||'':''||p_season_number::text||'':''||
      coalesce(p_event_key,''event'')||'':''||p_window_start::text
    )
  limit 1;','')))/length('  order by
    case
      when rp.race_id is not null and rp.is_calendar_public=false then 0
      else 1
    end,
    md5(
      s.id::text||'':''||v_country||'':''||p_season_number::text||'':''||
      coalesce(p_event_key,''event'')||'':''||p_window_start::text
    )
  limit 1;')<>1
 THEN RAISE EXCEPTION 'National championship stage selector baseline mismatch'; END IF;
 v_src:=replace(v_src,'  select s.id
  into v_stage
  from public.race_stages s','  with eligible_stage_candidates as materialized (
    select s.id,
      case when rp.race_id is not null and rp.is_calendar_public=false then 0 else 1 end as priority
    from public.race_stages s');
 v_src:=replace(v_src,'  order by
    case
      when rp.race_id is not null and rp.is_calendar_public=false then 0
      else 1
    end,
    md5(
      s.id::text||'':''||v_country||'':''||p_season_number::text||'':''||
      coalesce(p_event_key,''event'')||'':''||p_window_start::text
    )
  limit 1;','  )
  select e.id into v_stage
  from eligible_stage_candidates e
  order by
    e.priority,
    md5(
      e.id::text||'':''||v_country||'':''||p_season_number::text||'':''||
      coalesce(p_event_key,''event'')||'':''||p_window_start::text
    )
  limit 1;');
 EXECUTE v_src;
END $guard$;