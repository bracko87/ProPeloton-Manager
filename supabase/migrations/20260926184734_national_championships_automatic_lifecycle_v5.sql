
insert into public.notification_types (
  code,name,source,icon_name,priority,is_active,preference_group
)
values
  ('NATIONAL_CHAMPIONSHIP_SELECTED','National Championship Selection','game','trophy',2,true,'races'),
  ('NATIONAL_CHAMPIONSHIP_QUALIFIED','National Championship Qualification','game','trophy',2,true,'races'),
  ('NATIONAL_CHAMPION','National Champion','game','award',3,true,'races')
on conflict (code) do update
set name=excluded.name,
    source=excluded.source,
    icon_name=excluded.icon_name,
    priority=excluded.priority,
    is_active=true,
    preference_group=excluded.preference_group;

create or replace function public.national_championship_notify_selection_v1(
  p_edition_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    return 0;
  end if;

  for x in
    select
      en.rider_id,
      en.rider_name_snapshot,
      en.entry_path,
      en.heat_number,
      root.owner_user_id
    from public.national_championship_entries en
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root
      on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null
          then rc.parent_club_id
        else rc.id
      end
    where en.edition_id=e.id
      and root.owner_user_id is not null
  loop
    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      case
        when x.entry_path='direct'
          then x.rider_name_snapshot||' qualified for the National Championship'
        else x.rider_name_snapshot||' selected for National Championship qualification'
      end,
      case
        when x.entry_path='direct'
          then x.rider_name_snapshot||' is directly qualified through the National Ranking for the '||
               e.country_code||' National Road Championship on '||e.final_date||'. You can set the rider''s equipment and individual race tactics from National Ranking.'
        else x.rider_name_snapshot||' will ride qualification heat '||coalesce(x.heat_number,1)||
             ' on '||e.qualification_date||'. The top riders from the heat will advance to the national final.'
      end,
      '/dashboard/national-ranking?country='||e.country_code,
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',e.qualification_date,
        'final_date',e.final_date
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.national_championship_process_qualification_results_v1()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  h record;
  v_stage_id uuid;
  v_result_count integer;
  v_qualified_count integer;
  v_processed integer := 0;
  v_completed_editions uuid[] := '{}'::uuid[];
  q record;
begin
  for h in
    select
      heat.*,
      e.country_code,
      e.final_date,
      e.final_race_id,
      e.status as edition_status
    from public.national_championship_heats heat
    join public.national_championship_editions e on e.id=heat.edition_id
    where heat.status='ready'
      and heat.race_id is not null
      and e.status in ('qualification_pending','qualification_completed','final_ready')
    order by heat.qualification_date,heat.edition_id,heat.heat_number
  loop
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id=h.race_id
    order by s.stage_number
    limit 1;

    if v_stage_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id
        and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id
      and rs.rider_id is not null;

    if v_result_count=0 then
      continue;
    end if;

    insert into public.national_championship_result_history (
      edition_id,
      event_type,
      heat_id,
      rider_id,
      club_id_snapshot,
      rank,
      status,
      rider_name_snapshot,
      club_name_snapshot,
      country_code_snapshot,
      race_id
    )
    select
      h.edition_id,
      'qualification',
      h.id,
      rs.rider_id,
      en.club_id_snapshot,
      coalesce(rs.rank,9999),
      rs.status,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name),
      coalesce(c.name,rs.team_name_snapshot),
      en.country_code_snapshot,
      h.race_id
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=h.edition_id
     and en.rider_id=rs.rider_id
     and en.heat_id=h.id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    where rs.stage_id=v_stage_id
    on conflict do nothing;

    update public.national_championship_entries en
    set entry_status=case
          when rs.rank is not null
               and rs.rank<=h.qualifying_places
               and lower(coalesce(rs.status,'finished'))='finished'
            then 'qualified'
          else 'eliminated'
        end,
        updated_at=now()
    from public.race_stage_results rs
    where en.edition_id=h.edition_id
      and en.heat_id=h.id
      and en.rider_id=rs.rider_id
      and rs.stage_id=v_stage_id
      and en.entry_status='qualification_assigned';

    update public.national_championship_duties d
    set status='completed',updated_at=now()
    where d.edition_id=h.edition_id
      and d.heat_id=h.id
      and d.duty_type='qualification'
      and d.status='confirmed';

    insert into public.national_championship_duties (
      edition_id,rider_id,duty_type,duty_date,heat_id,status,label
    )
    select
      h.edition_id,
      en.rider_id,
      'final',
      h.final_date,
      null,
      'confirmed',
      'National Duty — '||h.country_code||' National Road Championship'
    from public.national_championship_entries en
    where en.edition_id=h.edition_id
      and en.heat_id=h.id
      and en.entry_status='qualified'
    on conflict (edition_id,rider_id,duty_type) do update
      set duty_date=excluded.duty_date,
          heat_id=null,
          status='confirmed',
          label=excluded.label,
          updated_at=now();

    /*
     * Carry the qualification plan forward as the rider's initial final plan.
     * The manager can still change it before the final starts.
     */
    insert into public.national_championship_rider_plans (
      edition_id,
      rider_id,
      event_type,
      heat_id,
      equipment_setup_id,
      phase_1_command,
      phase_2_command,
      phase_3_command,
      phase_4_command,
      updated_by_user_id
    )
    select
      qp.edition_id,
      qp.rider_id,
      'final',
      null,
      qp.equipment_setup_id,
      qp.phase_1_command,
      qp.phase_2_command,
      qp.phase_3_command,
      qp.phase_4_command,
      qp.updated_by_user_id
    from public.national_championship_rider_plans qp
    join public.national_championship_entries en
      on en.edition_id=qp.edition_id
     and en.rider_id=qp.rider_id
     and en.entry_status='qualified'
    where qp.edition_id=h.edition_id
      and qp.event_type='qualification'
      and en.heat_id=h.id
    on conflict (edition_id,rider_id,event_type) do nothing;

    select count(*)::int into v_qualified_count
    from public.national_championship_entries
    where edition_id=h.edition_id
      and heat_id=h.id
      and entry_status='qualified';

    update public.national_championship_heats
    set status='completed',updated_at=now()
    where id=h.id;

    for q in
      select
        en.rider_id,
        en.rider_name_snapshot,
        root.owner_user_id
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=h.edition_id
        and en.heat_id=h.id
        and en.entry_status='qualified'
        and root.owner_user_id is not null
    loop
      perform public.ppm_create_user_notification_direct_v1(
        q.owner_user_id,
        'NATIONAL_CHAMPIONSHIP_QUALIFIED',
        q.rider_name_snapshot||' qualified for the National Championship final',
        q.rider_name_snapshot||' advanced from qualification heat '||h.heat_number||
          ' and will race the '||h.country_code||' National Road Championship on '||h.final_date||
          '. The qualification equipment and tactics were copied to the final and can still be changed.',
        '/dashboard/national-ranking?country='||h.country_code,
        jsonb_build_object(
          'edition_id',h.edition_id,
          'country_code',h.country_code,
          'rider_id',q.rider_id,
          'rider_name',q.rider_name_snapshot,
          'heat_number',h.heat_number,
          'final_date',h.final_date
        ),
        'national-championship-qualified:'||h.edition_id::text||':'||q.rider_id::text
      );
    end loop;

    perform public.national_championship_sync_race_participants_v1(
      h.edition_id,'final',null
    );

    if not exists (
      select 1
      from public.national_championship_heats pending
      where pending.edition_id=h.edition_id
        and pending.status<>'completed'
    ) then
      update public.national_championship_entries
      set entry_status='finalist',updated_at=now()
      where edition_id=h.edition_id
        and entry_status in ('direct_qualified','qualified');

      update public.national_championship_editions
      set status='final_ready',updated_at=now()
      where id=h.edition_id
        and status in ('qualification_pending','qualification_completed');

      perform public.national_championship_sync_race_participants_v1(
        h.edition_id,'final',null
      );

      v_completed_editions:=array_append(v_completed_editions,h.edition_id);
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'qualification_heats_processed',v_processed,
    'finals_unlocked_for_editions',to_jsonb(v_completed_editions)
  );
end;
$$;

create or replace function public.national_championship_process_final_results_v1()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e record;
  v_stage_id uuid;
  v_result_count integer;
  v_champion record;
  v_processed integer := 0;
begin
  for e in
    select *
    from public.national_championship_editions
    where status='final_ready'
      and final_race_id is not null
    order by final_date,country_code
  loop
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id=e.final_race_id
    order by s.stage_number
    limit 1;

    if v_stage_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id
        and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id
      and rs.rider_id is not null;

    if v_result_count=0 then
      continue;
    end if;

    insert into public.national_championship_result_history (
      edition_id,
      event_type,
      heat_id,
      rider_id,
      club_id_snapshot,
      rank,
      status,
      rider_name_snapshot,
      club_name_snapshot,
      country_code_snapshot,
      race_id
    )
    select
      e.id,
      'final',
      null,
      rs.rider_id,
      en.club_id_snapshot,
      coalesce(rs.rank,9999),
      rs.status,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name),
      coalesce(c.name,rs.team_name_snapshot),
      en.country_code_snapshot,
      e.final_race_id
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=e.id
     and en.rider_id=rs.rider_id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    where rs.stage_id=v_stage_id
    on conflict do nothing;

    select
      rs.rider_id,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name) as rider_name,
      en.club_id_snapshot,
      c.name as club_name,
      root.owner_user_id
    into v_champion
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=e.id
     and en.rider_id=rs.rider_id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    left join public.clubs root
      on root.id=case
        when c.club_type='developing' and c.parent_club_id is not null
          then c.parent_club_id
        else c.id
      end
    where rs.stage_id=v_stage_id
      and rs.rank=1
      and lower(coalesce(rs.status,'finished'))='finished'
    order by rs.id
    limit 1;

    if v_champion.rider_id is null then
      continue;
    end if;

    /*
     * Rider-only national ranking bonus. This intentionally does not write
     * Team Ranking points.
     */
    insert into public.national_championship_ranking_bonus_awards (
      edition_id,rider_id,rank,points,award_date
    )
    select
      e.id,
      rs.rider_id,
      rs.rank,
      case
        when rs.rank=1 then 200
        when rs.rank=2 then 140
        when rs.rank=3 then 110
        when rs.rank=4 then 90
        when rs.rank=5 then 75
        when rs.rank=6 then 60
        when rs.rank=7 then 50
        when rs.rank=8 then 42
        when rs.rank=9 then 35
        when rs.rank=10 then 30
        when rs.rank between 11 and 15 then 20
        when rs.rank between 16 and 20 then 10
        else 0
      end,
      e.final_date
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id
      and rs.rider_id is not null
      and rs.rank between 1 and 20
      and lower(coalesce(rs.status,'finished'))='finished'
    on conflict (edition_id,rider_id) do update
      set rank=excluded.rank,
          points=excluded.points,
          award_date=excluded.award_date;

    update public.national_championship_duties
    set status='completed',updated_at=now()
    where edition_id=e.id
      and duty_type='final'
      and status='confirmed';

    update public.national_championship_editions
    set status='completed',
        champion_rider_id=v_champion.rider_id,
        champion_name_snapshot=v_champion.rider_name,
        champion_club_id=v_champion.club_id_snapshot,
        champion_club_name_snapshot=v_champion.club_name,
        completed_at=now(),
        updated_at=now()
    where id=e.id;

    if v_champion.owner_user_id is not null then
      perform public.ppm_create_user_notification_direct_v1(
        v_champion.owner_user_id,
        'NATIONAL_CHAMPION',
        v_champion.rider_name||' is National Champion!',
        v_champion.rider_name||' won the '||e.country_code||
          ' National Road Championship. The title is now part of the rider''s career honours and National Ranking record.',
        '/dashboard/national-ranking?country='||e.country_code,
        jsonb_build_object(
          'edition_id',e.id,
          'country_code',e.country_code,
          'season_number',e.season_number,
          'rider_id',v_champion.rider_id,
          'rider_name',v_champion.rider_name,
          'final_race_id',e.final_race_id
        ),
        'national-champion:'||e.id::text||':'||v_champion.rider_id::text
      );
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object('national_finals_processed',v_processed);
end;
$$;

create or replace function public.process_national_championship_runtime_v2()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_season integer;
  v_game_date date;
  v_created integer := 0;
  v_frozen integer := 0;
  v_races_ready integer := 0;
  r record;
  q jsonb;
  f jsonb;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_created:=public.ensure_national_championship_editions_for_season_v1(v_season);

  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and status='planned'
      and ranking_snapshot_date<=v_game_date
    order by ranking_snapshot_date,country_code
  loop
    perform public.freeze_national_championship_ranking_v1(r.id);
    perform public.national_championship_ensure_races_v1(r.id);
    perform public.national_championship_notify_selection_v1(r.id);
    v_frozen:=v_frozen+1;
    v_races_ready:=v_races_ready+1;
  end loop;

  /*
   * Self-heal any edition that was frozen by an older/manual process before
   * event races were generated.
   */
  for r in
    select id
    from public.national_championship_editions
    where season_number=v_season
      and discipline='road'
      and status in ('ranking_frozen','qualification_pending','final_ready')
      and (
        final_race_id is null
        or exists (
          select 1
          from public.national_championship_heats h
          where h.edition_id=national_championship_editions.id
            and h.race_id is null
        )
      )
    order by country_code
  loop
    perform public.national_championship_ensure_races_v1(r.id);
    v_races_ready:=v_races_ready+1;
  end loop;

  q:=public.national_championship_process_qualification_results_v1();
  f:=public.national_championship_process_final_results_v1();

  return jsonb_build_object(
    'status','ok',
    'season_number',v_season,
    'game_date',v_game_date,
    'editions_created',v_created,
    'rankings_frozen',v_frozen,
    'race_sets_ensured',v_races_ready,
    'qualification_processing',q,
    'final_processing',f
  );
end;
$$;

revoke execute on function public.national_championship_notify_selection_v1(uuid)
  from public,anon,authenticated;
revoke execute on function public.national_championship_process_qualification_results_v1()
  from public,anon,authenticated;
revoke execute on function public.national_championship_process_final_results_v1()
  from public,anon,authenticated;
revoke execute on function public.process_national_championship_runtime_v2()
  from public,anon,authenticated;

grant execute on function public.national_championship_notify_selection_v1(uuid)
  to service_role;
grant execute on function public.national_championship_process_qualification_results_v1()
  to service_role;
grant execute on function public.national_championship_process_final_results_v1()
  to service_role;
grant execute on function public.process_national_championship_runtime_v2()
  to service_role;

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid
  from cron.job
  where jobname='national-championship-planner-v1'
  limit 1;

  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;

  perform cron.schedule(
    'national-championship-planner-v1',
    '*/15 * * * *',
    'select public.process_national_championship_runtime_v2();'
  );
end;
$$;
