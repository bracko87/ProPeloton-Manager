create or replace function private.youth_race_academy_qualified_v1(p_academy_id uuid,p_race_id uuid)
returns boolean language sql stable security definer set search_path to 'public','private','pg_temp'
as $function$
  select count(*) >= 4 from public.youth_riders r
  where r.academy_id=p_academy_id and r.status='academy'
    and private.youth_rider_available_for_race_v1(r.id,p_race_id);
$function$;

-- Verify actual U16 starters at the start of stage 1, without touching past races.
create or replace function private.cancel_underfilled_youth_races_v1(
 p_game_ts timestamp without time zone default null
) returns jsonb language plpgsql security definer set search_path to 'public','private','pg_temp'
as $function$
declare
  stamp timestamp:=coalesce(p_game_ts,public.get_current_game_timestamp()::timestamp);
  item record; entered integer; withdrawn integer:=0; cancelled integer:=0;
begin
  -- AI and delegated selections are already filled by fill_due_youth_lineups_v1.
  update public.youth_race_entries e set status='withdrawn',updated_at=now()
  from public.youth_races r
  where e.race_id=r.id and e.status='entered' and r.status='scheduled'
    and exists(select 1 from public.youth_race_stages s
      where s.race_id=r.id and s.stage_number=1 and s.status='scheduled'
        and s.stage_date::timestamp+make_interval(
          hours=>coalesce(s.planned_start_hour_number,12),
          mins=>coalesce(s.planned_start_minute,0))<=stamp)
    and not exists(select 1 from public.youth_race_stages s
      where s.race_id=r.id and s.status='completed')
    and not exists(select 1 from public.youth_race_processing_log l where l.race_id=r.id)
    and (
      (select count(distinct l.youth_rider_id) from public.youth_race_lineups l
       join public.youth_riders yr on yr.id=l.youth_rider_id
       where l.entry_id=e.id and yr.academy_id=e.academy_id
         and private.youth_rider_available_for_race_v1(yr.id,r.id))<4
      or (select count(*) from public.youth_race_lineups l where l.entry_id=e.id)>coalesce(r.lineup_size,5)
    );
  get diagnostics withdrawn=row_count;

  for item in
    select r.id, greatest(1,coalesce(r.min_teams,6)) required_teams
    from public.youth_races r where r.status='scheduled'
      and exists(select 1 from public.youth_race_stages s
        where s.race_id=r.id and s.stage_number=1 and s.status='scheduled'
          and s.stage_date::timestamp+make_interval(
            hours=>coalesce(s.planned_start_hour_number,12),
            mins=>coalesce(s.planned_start_minute,0))<=stamp)
      and not exists(select 1 from public.youth_race_stages s
        where s.race_id=r.id and s.status='completed')
      and not exists(select 1 from public.youth_race_processing_log l where l.race_id=r.id)
    for update of r
  loop
    select count(*)::int into entered from public.youth_race_entries e
      where e.race_id=item.id and e.status='entered';
    if entered<item.required_teams then
      update public.youth_races set status='cancelled',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'cancellation_reason','insufficient_eligible_starting_teams',
          'entered_teams',entered,'required_minimum_teams',item.required_teams,
          'minimum_riders_per_team',4,'cancelled_at_game',stamp,
          'automatic_cancellation',true
        ),updated_at=now()
        where id=item.id and status='scheduled';
      update public.youth_race_stages set status='cancelled',updated_at=now()
        where race_id=item.id and status='scheduled';
      update public.youth_race_invitations
        set status='expired',responded_on=coalesce(responded_on,stamp::date),updated_at=now()
        where race_id=item.id and status='pending';
      cancelled:=cancelled+1;
    end if;
  end loop;
  return jsonb_build_object('cancelled',cancelled,
    'teams_withdrawn_for_invalid_lineup',withdrawn,
    'minimum_riders_per_team',4,'game_timestamp',stamp);
end;
$function$;
