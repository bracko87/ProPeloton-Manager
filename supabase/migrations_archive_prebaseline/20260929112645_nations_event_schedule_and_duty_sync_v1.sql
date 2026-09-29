create or replace function public.get_nations_competition_event_schedule_v1(
  p_edition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'round_id',r.id,
        'round_index',r.round_index,
        'round_type',r.round_type,
        'round_label',r.round_label,
        'group_id',g.id,
        'group_number',g.group_number,
        'group_label',g.group_label,
        'event_id',e.id,
        'race_day',e.race_day,
        'race_type',e.race_type,
        'cycle_key',e.cycle_key,
        'event_date',e.event_date,
        'race_id',e.race_id,
        'stage_id',e.stage_id,
        'source_stage_id',e.source_stage_id,
        'status',e.status
      )
      order by r.round_index,g.group_number,e.race_day
    ),
    '[]'::jsonb
  )
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  join public.nations_group_events e on e.group_id=g.id
  where r.edition_id=p_edition_id;
$function$;

revoke all on function public.get_nations_competition_event_schedule_v1(uuid) from public;
grant execute on function public.get_nations_competition_event_schedule_v1(uuid) to authenticated;

create or replace function public.set_nations_group_schedule_v1(
  p_group_id uuid,
  p_day1_date date
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group public.nations_competition_groups%rowtype;
  v_round public.nations_competition_rounds%rowtype;
  v_cycle_key text;
  v_squad record;
  v_duty_count integer:=0;
begin
  if p_group_id is null or p_day1_date is null then
    raise exception 'Group and Day 1 date are required.';
  end if;

  select * into v_group
  from public.nations_competition_groups
  where id=p_group_id
  for update;

  if v_group.id is null then
    raise exception 'Nations group not found.';
  end if;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id
  for update;

  perform private.ensure_nations_group_runtime_v1(v_group.id);
  v_cycle_key:='nations:'||v_group.id::text;

  update public.nations_group_events
  set event_date=p_day1_date+(race_day-1),
      status=case when status='planned' then 'scheduled' else status end,
      updated_at=now()
  where group_id=v_group.id;

  update public.nations_competition_rounds r
  set starts_on_game_date=(
        select min(e.event_date)
        from public.nations_competition_groups g2
        join public.nations_group_events e on e.group_id=g2.id
        where g2.round_id=r.id
      ),
      ends_on_game_date=(
        select max(e.event_date)
        from public.nations_competition_groups g2
        join public.nations_group_events e on e.group_id=g2.id
        where g2.round_id=r.id
      ),
      updated_at=now()
  where r.id=v_round.id;

  for v_squad in
    select s.id
    from public.national_team_squads s
    join public.nations_group_entries nge on true
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where nge.group_id=v_group.id
      and ce.association_id=s.association_id
      and s.season_number=(
        select ed.season_number
        from public.nations_competition_editions ed
        where ed.id=v_round.edition_id
      )
      and s.cycle_key=v_cycle_key
      and s.status in ('confirmed','on_duty')
    group by s.id
  loop
    perform public.set_national_team_duty_window_v1(
      v_squad.id,
      p_day1_date,
      p_day1_date+2
    );
    v_duty_count:=v_duty_count+1;
  end loop;

  return jsonb_build_object(
    'group_id',v_group.id,
    'cycle_key',v_cycle_key,
    'day1_date',p_day1_date,
    'day2_date',p_day1_date+1,
    'day3_date',p_day1_date+2,
    'duty_windows_updated',v_duty_count
  );
end;
$function$;

revoke all on function public.set_nations_group_schedule_v1(uuid,date)
from public,anon,authenticated;

create or replace function private.trg_sync_nations_squad_duty_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_group_id uuid;
  v_start date;
  v_end date;
  v_count integer;
begin
  if new.status not in ('confirmed','on_duty')
     or new.cycle_key not like 'nations:%' then
    return new;
  end if;

  begin
    v_group_id:=substring(new.cycle_key from 9)::uuid;
  exception when others then
    return new;
  end;

  select min(event_date),max(event_date),count(*) filter(where event_date is not null)
  into v_start,v_end,v_count
  from public.nations_group_events
  where group_id=v_group_id;

  if v_count=3 and v_start is not null and v_end is not null then
    perform public.set_national_team_duty_window_v1(new.id,v_start,v_end);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_nations_squad_duty_v1
on public.national_team_squads;

create trigger trg_sync_nations_squad_duty_v1
after insert or update of status
on public.national_team_squads
for each row
execute function private.trg_sync_nations_squad_duty_v1();
