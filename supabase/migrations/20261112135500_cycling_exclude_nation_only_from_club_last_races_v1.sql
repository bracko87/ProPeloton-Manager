-- Club racing history includes only club-eligible races, never nation/individual-only championships.
-- Rider and national team historical results remain untouched.
DO $repair$
DECLARE
  v_source text;
  v_old text := 'where r.status::text in (''completed'', ''archived'', ''finished'', ''race_finished'')';
  v_new text := 'where r.status::text in (''completed'', ''archived'', ''finished'', ''race_finished'')
  and coalesce(r.metadata->>''individual_only'',''false'') <> ''true''
  and not exists (select 1 from public.world_road_championship_editions wc where wc.race_id = r.id)
  and not exists (select 1 from public.national_championship_editions nc where nc.final_race_id = r.id)';
BEGIN
 SELECT pg_get_functiondef('public.get_team_last_five_races(uuid,integer)'::regprocedure) INTO v_source;
 IF v_source IS NULL THEN RAISE EXCEPTION 'Team last races function missing'; END IF;
 IF strpos(v_source,v_new)>0 THEN RETURN; END IF;
 IF (length(v_source)-length(replace(v_source,v_old,'')))/length(v_old)<>1
 THEN RAISE EXCEPTION 'Team history source changed; refusing patch'; END IF;
 EXECUTE replace(v_source,v_old,v_new);
END $repair$;