-- Match the protected production Season 1 reset fixes.
-- 1) Acquire nonblocking advisory lock before status check to stop duplicate
-- executions racing after a client timeout.
-- 2) Keep canonical S1 club tiers/divisions after all generated competitions.
-- 3) Developing teams with shared parent inventory correctly expect 0 owned
-- starter items, while all regular clubs still require 60.
-- 4) Championship cleanup also requires source_frozen status.
do $patch$
declare
  c text; v text; n text;
  c_needle text := E'  if not exists (\n    select 1 from public.game_world_reset_runs\n    where id=p_reset_run_id and status=''source_frozen''\n  ) then';
  c_marker text := 'if not pg_try_advisory_xact_lock(hashtext(''game_world_reset_v1'')::bigint) then';
  c_validation text := '    v_validation := public.game_world_reset_validate_v2();';
  v_old text := E'    from public.game_world_reset_s1_competition_baseline_v1 b\n    left join public.club_equipment_inventory e\n      on e.club_id=b.club_id and coalesce(e.status,''ready'') not in (''sold'',''discarded'')\n    group by b.club_id\n    having count(e.id)<>60';
  v_new text := E'    from public.game_world_reset_s1_competition_baseline_v1 b\n    join public.clubs c on c.id=b.club_id\n    left join public.club_equipment_inventory e\n      on e.club_id=b.club_id and coalesce(e.status,''ready'') not in (''sold'',''discarded'')\n    group by b.club_id,c.club_type,c.parent_club_id,c.is_ai\n    having count(e.id) <> case when c.club_type=''developing'' and c.parent_club_id is not null and c.is_ai=false then 0 else 60 end';
  n_needle text := 'if coalesce(current_setting(''app.s1_world_reset_authorization'',true),'''') <> p_reset_run_id::text';
begin
 select pg_get_functiondef('public.game_world_reset_execute_core_v1(uuid,text)'::regprocedure) into c;
 if strpos(c,c_marker)=0 then
   if strpos(c,c_needle)=0 then raise exception 'Core source-frozen check missing';end if;
   c:=replace(c,c_needle,E'  -- Acquire nonblocking transaction lock before checking run status; duplicates fail fast.\n  '||c_marker||E'\n    raise exception ''Another Season 1 reset execution is already running'';\n  end if;\n\n'||c_needle);
 end if;
 if strpos(c,'Final canonical Season 1 club baseline alignment')=0 then
   if strpos(c,c_validation)=0 then raise exception 'Core validation line missing';end if;
   c:=replace(c,c_validation,E'    -- Final canonical Season 1 club baseline alignment.\n    -- Roster and championship generators must not leave altered tiers, divisions or ownership flags.\n    update public.clubs c\n    set club_tier=b.club_tier::public.club_tier,\n        tier2_division=b.tier2_division,\n        tier3_division=b.tier3_division,\n        amateur_division=b.amateur_division,\n        is_ai=(c.owner_user_id is null),\n        is_active=true,\n        deleted_at=null,\n        updated_at=clock_timestamp()\n    from public.game_world_reset_s1_competition_baseline_v1 b\n    where c.id=b.club_id\n      and (c.deleted_at is not null\n           or c.is_active is distinct from true\n           or c.club_tier::text is distinct from b.club_tier\n           or c.tier2_division is distinct from b.tier2_division\n           or c.tier3_division is distinct from b.tier3_division\n           or c.amateur_division is distinct from b.amateur_division\n           or c.is_ai is distinct from (c.owner_user_id is null));\n\n'||c_validation);
 end if;
 execute c;
 select pg_get_functiondef('public.game_world_reset_validate_core_v1()'::regprocedure) into v;
 if strpos(v,v_old)>0 then execute replace(v,v_old,v_new);
 elsif strpos(v,v_new)=0 then raise exception 'Expected inventory validator pattern not found';end if;
 select pg_get_functiondef('private.game_world_reset_cleanup_national_competitions_v1(uuid)'::regprocedure) into n;
 if strpos(n,'and r.status=''source_frozen''')=0 then
   if strpos(n,n_needle)=0 then raise exception 'Scoped cleanup guard missing';end if;
   execute replace(n,n_needle,n_needle||E'\n     or not exists (select 1 from public.game_world_reset_runs r where r.id=p_reset_run_id and r.status=''source_frozen'')');
 end if;
end $patch$;
