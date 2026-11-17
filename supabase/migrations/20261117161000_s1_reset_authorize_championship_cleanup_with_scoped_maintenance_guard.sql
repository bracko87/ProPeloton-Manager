-- Ensure National Championship cleanup only runs inside the guarded, paused
-- full-world reset transaction. Existing account, maintenance and cron checks
-- remain mandatory; direct calls without the core's transaction token fail.
do $patch$
declare
 v_src text;
 v_find text := 'perform set_config(''request.jwt.claim.role'',''service_role'',true);';
 v_new text := 'perform set_config(''app.s1_world_reset_authorization'',p_reset_run_id::text,true);' || E'\n    ' || v_find;
begin
 select pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure) into v_src;
 if strpos(v_src,'app.s1_world_reset_authorization')=0 then
   if strpos(v_src,v_find)=0 then raise exception 'Core guard initializer missing'; end if;
   execute replace(v_src,v_find,v_new);
 end if;
end $patch$;

create or replace function private.game_world_reset_cleanup_national_competitions_v1(p_reset_run_id uuid)
returns jsonb language plpgsql security definer
set search_path to ''
as $function$
declare
 v_old_race_count integer;
 v_nations_count integer;
begin
 if coalesce(current_setting('app.s1_world_reset_authorization',true),'') <> p_reset_run_id::text
    or not exists (
      select 1 from private.game_world_reset_maintenance_gate_v1 m
      where m.id=true and m.locked and m.reset_run_id=p_reset_run_id
    )
    or not exists (
      select 1 from public.game_state g
      join public.game_clock_config c on c.id=true
      where g.id=true and g.season_number=1
        and g.month_number=1 and g.day_number=1
        and g.hour_number=1 and g.minute_number=0 and g.is_paused
        and c.is_paused and c.base_season=1
        and c.base_game_at=timestamp '2000-01-01 01:00:00'
    )
 then
  raise exception 'National cleanup requires an authorized frozen Season 1 reset transaction with the correct maintenance lock and paused clock';
 end if;
 perform private.game_world_reset_execute_guard_v1(p_reset_run_id);

 if exists (
   select 1 from public.race_stage_results sr join public.race_stages s on s.id=sr.stage_id
   where s.stage_date>=date '2000-01-01' and s.stage_date<date '2001-01-01' limit 1
 ) then raise exception 'Race results must be cleared before championship race cleanup'; end if;

 select count(*) into v_nations_count from public.nations_competition_editions;
 truncate table public.nations_competition_editions cascade;
 truncate table public.nations_team_standing_history;
 truncate table public.national_team_selection_cycles cascade;
 truncate table public.national_team_squads cascade;
 truncate table public.nations_host_route_requests;

 select count(*) into v_old_race_count from public.races r
 where r.start_date>=date '2000-01-01' and r.start_date<date '2001-01-01'
   and r.category in ('NC','NCQ','WRC','WNF','WNQ');

 delete from public.races r
 where r.start_date>=date '2000-01-01' and r.start_date<date '2001-01-01'
   and r.category in ('NC','NCQ','WRC','WNF','WNQ');

 if exists(select 1 from public.races r
           where r.start_date>=date '2000-01-01' and r.start_date<date '2001-01-01'
             and r.category in ('NC','NCQ','WRC','WNF','WNQ'))
    or exists(select 1 from public.nations_competition_editions)
 then raise exception 'Old national/nations competition runtime survived cleanup'; end if;

 return jsonb_build_object('ok',true,
  'previous_nations_editions',v_nations_count,
  'removed_old_championship_nations_races',v_old_race_count,
  'persistent_undated_reserve_routes_preserved',true,
  'player_accounts_unmodified',true);
end;
$function$;
