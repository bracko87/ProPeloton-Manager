create or replace function public.process_nations_competition_planning_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_season integer;
  v_today date;
  v_generation_gate date;
  v_active_count integer;
  v_create jsonb;
  v_edition_id uuid;
  v_round_id uuid;
  v_round_status text;
  v_draw jsonb := null;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number)
  into v_season, v_today
  from public.game_state gs
  where gs.id = true;

  v_generation_gate := public.game_date_from_parts(v_season, 1, 28);

  if v_today < v_generation_gate then
    return jsonb_build_object(
      'status','waiting_for_january_election_window',
      'season_number',v_season,
      'generation_gate',v_generation_gate
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id) >= (
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  if v_active_count=0 then
    return jsonb_build_object(
      'status','waiting_for_active_associations',
      'season_number',v_season,
      'active_associations',0
    );
  end if;

  v_create := public.create_nations_competition_edition_v1(v_season);
  v_edition_id := nullif(v_create->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season
    limit 1;
  end if;

  if v_edition_id is null then
    return coalesce(v_create,'{}'::jsonb)
      || jsonb_build_object('status','edition_not_available');
  end if;

  select id,status
  into v_round_id,v_round_status
  from public.nations_competition_rounds
  where edition_id=v_edition_id
    and round_index=1
  limit 1;

  if v_round_id is not null
     and v_round_status='planned'
     and not exists(
       select 1
       from public.nations_group_entries nge
       join public.nations_competition_groups g on g.id=nge.group_id
       where g.round_id=v_round_id
     ) then
    v_draw := public.draw_nations_round_v1(v_round_id);

    update public.nations_competition_editions
    set status='qualification',
        updated_at=now()
    where id=v_edition_id
      and status='planned';
  end if;

  return jsonb_build_object(
    'status','ready',
    'season_number',v_season,
    'edition_id',v_edition_id,
    'active_associations',v_active_count,
    'edition_creation',v_create,
    'first_round_draw',v_draw
  );
end;
$function$;

revoke all on function public.process_nations_competition_planning_v1() from public, anon, authenticated;

create or replace function public.finalize_nations_round_v1(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_edition public.nations_competition_editions%rowtype;
  v_incomplete integer;
  v_advanced integer;
  v_next_round_id uuid;
  v_winner_entry_id uuid;
  v_winner_association_id uuid;
  v_winner_country_code text;
  v_winner_count integer;
begin
  select * into v_round
  from public.nations_competition_rounds
  where id=p_round_id
  for update;

  if v_round.id is null then
    raise exception 'Nations round not found.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=v_round.edition_id
  for update;

  select count(*)::integer
  into v_incomplete
  from public.nations_competition_groups
  where round_id=v_round.id
    and status<>'completed';

  if v_incomplete>0 then
    return jsonb_build_object(
      'status','groups_incomplete',
      'round_id',v_round.id,
      'incomplete_groups',v_incomplete
    );
  end if;

  select count(*)::integer
  into v_advanced
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  where g.round_id=v_round.id
    and nge.status in ('advanced','winner');

  update public.nations_competition_entries e
  set status=case
      when exists(
        select 1
        from public.nations_group_entries nge
        join public.nations_competition_groups g on g.id=nge.group_id
        where g.round_id=v_round.id
          and nge.competition_entry_id=e.id
          and nge.status in ('advanced','winner')
      )
      then case
        when v_round.round_type='world_final' then 'champion'
        when v_round.round_type='final_qualification' then 'finalist'
        else 'advanced'
      end
      else case
        when e.status='withdrawn' then e.status
        else 'eliminated'
      end
    end,
    updated_at=now()
  where e.edition_id=v_round.edition_id
    and exists(
      select 1
      from public.nations_group_entries nge
      join public.nations_competition_groups g on g.id=nge.group_id
      where g.round_id=v_round.id
        and nge.competition_entry_id=e.id
    );

  update public.nations_competition_rounds
  set status='completed',updated_at=now()
  where id=v_round.id;

  select id into v_next_round_id
  from public.nations_competition_rounds
  where edition_id=v_round.edition_id
    and round_index=v_round.round_index+1;

  if v_next_round_id is not null then
    return jsonb_build_object(
      'status','completed',
      'round_id',v_round.id,
      'advanced',v_advanced,
      'next_round_id',v_next_round_id
    );
  end if;

  if v_round.round_type<>'world_final' then
    return jsonb_build_object(
      'status','completed',
      'round_id',v_round.id,
      'advanced',v_advanced,
      'next_round_id',null
    );
  end if;

  select
    count(*)::integer,
    min(ce.id),
    min(ce.association_id),
    min(ce.country_code)
  into
    v_winner_count,
    v_winner_entry_id,
    v_winner_association_id,
    v_winner_country_code
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where g.round_id=v_round.id
    and nge.status='winner';

  if v_winner_count<>1 then
    raise exception 'World Nations Final must resolve to exactly one champion before the edition can be completed.';
  end if;

  update public.nations_competition_editions
  set status='completed',
      champion_association_id=v_winner_association_id,
      champion_country_code=v_winner_country_code,
      completed_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  where id=v_round.edition_id;

  insert into public.nations_competition_history(
    edition_id,season_number,association_id,country_code,
    final_rank,total_points,was_host
  )
  select
    v_round.edition_id,
    v_edition.season_number,
    ce.association_id,
    ce.country_code,
    nge.final_group_rank,
    nge.total_points,
    ce.association_id=v_edition.host_association_id
  from public.nations_group_entries nge
  join public.nations_competition_groups g on g.id=nge.group_id
  join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
  where g.round_id=v_round.id
    and nge.final_group_rank is not null
  on conflict(edition_id,country_code) do update
  set final_rank=excluded.final_rank,
      total_points=excluded.total_points,
      was_host=excluded.was_host;

  return jsonb_build_object(
    'status','edition_completed',
    'round_id',v_round.id,
    'advanced',v_advanced,
    'next_round_id',null,
    'champion_entry_id',v_winner_entry_id,
    'champion_association_id',v_winner_association_id,
    'champion_country_code',v_winner_country_code
  );
end;
$function$;

revoke all on function public.finalize_nations_round_v1(uuid) from public, anon, authenticated;

create or replace function private.national_association_run_game_day_maintenance_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_result jsonb:='{}'::jsonb;
  v_task jsonb;
  v_expired integer;
begin
  begin
    v_task:=public.refresh_national_association_statuses_v1();
    v_result:=v_result||jsonb_build_object('association_statuses',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'association_statuses','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'association_statuses','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('association_statuses_error',sqlerrm);
  end;

  begin
    v_task:=public.process_national_coach_elections_v1();
    v_result:=v_result||jsonb_build_object('coach_elections',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'coach_elections','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'coach_elections','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('coach_elections_error',sqlerrm);
  end;

  begin
    v_expired:=public.expire_national_team_callups_v1();
    v_task:=jsonb_build_object('expired',v_expired);
    v_result:=v_result||jsonb_build_object('callup_expiry',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'callup_expiry','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'callup_expiry','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('callup_expiry_error',sqlerrm);
  end;

  begin
    v_task:=public.refresh_national_team_duty_status_v1();
    v_result:=v_result||jsonb_build_object('national_duty',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'national_duty','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'national_duty','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('national_duty_error',sqlerrm);
  end;

  begin
    v_task:=public.process_nations_competition_planning_v1();
    v_result:=v_result||jsonb_build_object('nations_competition',v_task);
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'nations_competition','ok',v_task);
  exception when others then
    insert into public.national_association_maintenance_log(game_date,task_key,status,details)
    values(v_today,'nations_competition','error',jsonb_build_object('message',sqlerrm));
    v_result:=v_result||jsonb_build_object('nations_competition_error',sqlerrm);
  end;

  return v_result;
end;
$function$;
