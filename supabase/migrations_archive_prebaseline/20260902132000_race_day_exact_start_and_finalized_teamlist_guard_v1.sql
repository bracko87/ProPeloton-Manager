do $block$
declare
  v_oid oid;
  v_def text;
  v_active_marker text := 'when v_today_ordinal >= public.game_date_ordinal_v1(';
  v_open_marker text := 'when v_today_ordinal < public.game_date_ordinal_v1(';
  v_active_replacement text := $sql$when public.get_current_game_timestamp()::timestamp without time zone >= coalesce(
        (
          select rs.stage_date::timestamp
            + make_interval(
                hours => coalesce(rs.planned_start_hour_number, r.planned_start_hour_number, 12),
                mins => coalesce(rs.planned_start_minute, r.planned_start_minute, 0)
              )
          from public.race_stages rs
          where rs.race_id = r.id
          order by rs.stage_number
          limit 1
        ),
        r.start_date::timestamp
          + make_interval(
              hours => coalesce(r.planned_start_hour_number, 12),
              mins => coalesce(r.planned_start_minute, 0)
            )
      )
      and v_today_ordinal >= public.game_date_ordinal_v1($sql$;
  v_open_replacement text := $sql$when lower(coalesce(r.metadata ->> 'team_list_announcement_finalized', 'false')) in ('true', '1', 'yes')
        then 'closed'

      when v_today_ordinal < public.game_date_ordinal_v1($sql$;
begin
  for v_oid in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in ('sync_race_application_statuses_v1','process_race_application_deadlines_v1')
  loop
    v_def := pg_get_functiondef(v_oid);
    if position(v_active_marker in v_def)=0 then
      raise exception 'Race-active CASE marker not found in function oid %', v_oid;
    end if;
    if position(v_open_marker in v_def)=0 then
      raise exception 'Application-open CASE marker not found in function oid %', v_oid;
    end if;
    v_def := replace(v_def, v_active_marker, v_active_replacement);
    v_def := replace(v_def, v_open_marker, v_open_replacement);
    execute v_def;
  end loop;
end;
$block$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_marker text := 'and coalesce(rer.applications_status, '''') in (''open'', ''not_open'')';
  v_replacement text := $sql$and coalesce(rer.applications_status, '') in ('open', 'not_open')
    and lower(coalesce(r.metadata ->> 'team_list_announcement_finalized', 'false')) not in ('true', '1', 'yes')$sql$;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='cleanup_premature_ai_race_entries_v1'
  limit 1;
  if v_oid is null then raise exception 'cleanup_premature_ai_race_entries_v1 not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_marker in v_def)=0 then raise exception 'Cleanup applications-status marker not found'; end if;
  v_def := replace(v_def, v_marker, v_replacement);
  execute v_def;
end;
$block$;

do $block$
declare
  v_oid oid;
  v_def text;
  v_marker text := 'and lower(coalesce(rules.applications_status,''''))=''closed''';
  v_replacement text := 'and lower(coalesce(race.metadata->>''team_list_announcement_finalized'',''false'')) in (''true'',''1'',''yes'')';
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='process_due_race_startlist_captain_finalizations_v1'
    and pg_get_function_identity_arguments(p.oid)='p_limit integer'
  limit 1;
  if v_oid is null then raise exception 'process_due_race_startlist_captain_finalizations_v1(integer) not found'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_marker in v_def)=0 then raise exception 'Captain-finalizer applications-status marker not found'; end if;
  execute replace(v_def, v_marker, v_replacement);
end;
$block$;