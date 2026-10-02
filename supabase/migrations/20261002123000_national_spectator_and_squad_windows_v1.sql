-- Spectator-safe National Championship pages, richer National Team call-ups,
-- and fresh squad-selection cycle when a nation advances to a later World Nations round.

do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='get_national_championship_event_page_v1'
  limit 1;

  if v_definition is null then
    raise exception 'get_national_championship_event_page_v1 not found';
  end if;

  v_definition := replace(
    v_definition,
    E'  select upper(c.country_code)\n  into v_user_country\n  from public.clubs c\n  where c.owner_user_id=v_user\n    and c.parent_club_id is null\n  order by c.created_at,c.id\n  limit 1;\n\n  select * into e\n  from public.national_championship_editions\n  where id=p_edition_id\n    and country_code=v_user_country\n    and discipline=\'road\'\n  limit 1;\n\n  if e.id is null then\n    raise exception \'National Championship event is not available for your club country\';\n  end if;',
    E'  select upper(c.country_code)\n  into v_user_country\n  from public.clubs c\n  where c.owner_user_id=v_user\n    and c.parent_club_id is null\n  order by c.created_at,c.id\n  limit 1;\n\n  -- Event information is spectator-visible for every country. Replay access is\n  -- authorized separately by the nationality/team/Coin replay gate.\n  select * into e\n  from public.national_championship_editions\n  where id=p_edition_id\n    and discipline=\'road\'\n  limit 1;\n\n  if e.id is null then\n    raise exception \'National Championship event not found\';\n  end if;'
  );

  execute v_definition;
end
$migration$;

create or replace function public.get_my_national_team_callups_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'callup_id',c.id,
        'association_id',c.association_id,
        'association_name',a.name,
        'country_code',a.country_code,
        'season_number',c.season_number,
        'cycle_key',c.cycle_key,
        'rider_id',c.rider_id,
        'rider_name',coalesce(
          nullif(concat_ws(' ',nullif(btrim(r.first_name),''),nullif(btrim(r.last_name),'')),''),
          nullif(r.display_name,''),
          c.rider_name_snapshot
        ),
        'rider_country_code',coalesce(r.country_code,a.country_code),
        'rider_role',r.role::text,
        'club_id',c.club_id_snapshot,
        'club_name',coalesce(club.name,c.club_name_snapshot),
        'club_country_code',club.country_code,
        'status',
          case
            when c.status='pending'
             and c.response_deadline is not null
             and c.response_deadline<v_today
              then 'auto_accepted'
            else c.status
          end,
        'sent_on',c.sent_on_game_date,
        'response_deadline',c.response_deadline,
        'responded_on',c.responded_on_game_date,
        'can_respond',
          c.status='pending'
          and (c.response_deadline is null or v_today<=c.response_deadline)
      )
      order by c.sent_on_game_date desc,c.created_at desc
    )
    from public.national_team_callups c
    join public.national_associations a on a.id=c.association_id
    left join public.riders r on r.id=c.rider_id
    left join public.clubs club on club.id=c.club_id_snapshot
    where c.club_owner_user_id_snapshot=v_uid
  ),'[]'::jsonb);
end;
$function$;

create or replace function private.open_nations_next_round_squad_cycle_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_round public.nations_competition_rounds%rowtype;
  v_group public.nations_competition_groups%rowtype;
  v_entry public.nations_competition_entries%rowtype;
  v_season integer;
  v_target date;
  v_deadline date;
  v_coach_user_id uuid;
  v_cycle_key text;
  v_selection_id uuid;
begin
  select * into v_group
  from public.nations_competition_groups
  where id=new.group_id;

  if v_group.id is null then return new; end if;

  select * into v_round
  from public.nations_competition_rounds
  where id=v_group.round_id;

  -- The initial qualification cycle already exists through the normal selection
  -- workspace. This hook is for a newly reached later round, especially World Final.
  if v_round.id is null or coalesce(v_round.round_index,1)<=1 then
    return new;
  end if;

  select * into v_entry
  from public.nations_competition_entries
  where id=new.competition_entry_id;

  if v_entry.id is null then return new; end if;

  select season_number into v_season
  from public.nations_competition_editions
  where id=v_round.edition_id;

  select min(e.event_date)
  into v_target
  from public.nations_group_events e
  where e.group_id=v_group.id
    and e.status<>'cancelled';

  v_deadline:=case when v_target is null then null else v_target-3 end;
  v_cycle_key:='nations:'||v_group.id::text;

  select t.user_id
  into v_coach_user_id
  from public.national_coach_terms t
  where t.association_id=v_entry.association_id
    and t.season_number=v_season
    and t.status='active'
  order by t.term_start_game_date desc,t.created_at desc
  limit 1;

  insert into public.national_team_selection_cycles(
    association_id,season_number,cycle_key,status,selected_rider_ids,
    target_event_date,final_squad_deadline,created_by_user_id,updated_by_user_id
  )
  values(
    v_entry.association_id,v_season,v_cycle_key,'draft','{}'::uuid[],
    v_target,v_deadline,v_coach_user_id,v_coach_user_id
  )
  on conflict(association_id,season_number,cycle_key) do update
  set target_event_date=excluded.target_event_date,
      final_squad_deadline=excluded.final_squad_deadline,
      updated_at=now()
  returning id into v_selection_id;

  if v_coach_user_id is not null then
    perform public.ppm_create_user_notification_direct_v1(
      v_coach_user_id,
      'NATIONAL_TEAM_NEW_SELECTION_WINDOW',
      case when v_round.round_type='world_final'
        then 'World Nations Final squad selection is open'
        else 'New National Team squad selection is open'
      end,
      case when v_round.round_type='world_final'
        then 'Your nation advanced to the World Nations Final. Select a fresh 10-rider squad for the Final window. You may keep the previous riders or choose different eligible riders.'
        else 'Your nation advanced to the next World Nations round. Select the 10-rider squad for the new competition window.'
      end,
      '/dashboard/national-association/squad?cycle='||v_cycle_key,
      jsonb_build_object(
        'association_id',v_entry.association_id,
        'season_number',v_season,
        'cycle_key',v_cycle_key,
        'selection_id',v_selection_id,
        'round_id',v_round.id,
        'round_type',v_round.round_type,
        'round_label',v_round.round_label,
        'group_id',v_group.id,
        'group_label',v_group.group_label,
        'target_event_date',v_target,
        'final_squad_deadline',v_deadline
      ),
      'national-team-selection-window:'||v_entry.association_id::text||':'||v_cycle_key
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists open_nations_next_round_squad_cycle_v1
on public.nations_group_entries;

create trigger open_nations_next_round_squad_cycle_v1
after insert on public.nations_group_entries
for each row execute function private.open_nations_next_round_squad_cycle_v1();
