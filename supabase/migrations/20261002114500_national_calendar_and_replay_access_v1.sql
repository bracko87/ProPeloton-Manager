-- Calendar visibility for scheduled National Championship / World Nations events
-- plus nationality-aware, server-enforced replay access.

create or replace function public.get_special_national_calendar_events_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with national_championship_finals as (
  select
    ('national-championship-final:' || ed.id::text) as id,
    coalesce(c.name, ed.country_code) || ' National Road Championship' as name,
    ed.country_code,
    ed.final_date as start_date,
    ed.final_date as end_date,
    'National Championship'::text as category,
    'one_day'::text as race_type,
    false as is_stage_race,
    1::integer as stage_count,
    'scheduled'::text as status,
    'National Championship final'::text as description,
    jsonb_build_object(
      'calendar_placeholder', true,
      'special_kind', 'national_championship_final',
      'edition_id', ed.id,
      'country_code', ed.country_code,
      'national_championship', true,
      'target_url', '/dashboard/national-championships/' || ed.id::text || '/final'
    ) as metadata
  from public.national_championship_editions ed
  left join public.countries c on upper(c.code)=upper(ed.country_code)
  where ed.final_date is not null
    and ed.final_race_id is null
    and ed.route_status = 'ready'
    and ed.status not in ('cancelled','inactive','completed')
),
national_championship_qualifications as (
  select
    ('national-championship-qualification:' || h.id::text) as id,
    coalesce(c.name, ed.country_code) || ' National Qualification — Group ' || h.heat_number::text as name,
    ed.country_code,
    h.qualification_date as start_date,
    h.qualification_date as end_date,
    'National Championship'::text as category,
    'one_day'::text as race_type,
    false as is_stage_race,
    1::integer as stage_count,
    'scheduled'::text as status,
    'National Championship qualification'::text as description,
    jsonb_build_object(
      'calendar_placeholder', true,
      'special_kind', 'national_championship_qualification',
      'edition_id', ed.id,
      'heat_id', h.id,
      'heat_number', h.heat_number,
      'country_code', ed.country_code,
      'national_championship', true,
      'target_url', '/dashboard/national-championships/' || ed.id::text || '/qualification/' || h.heat_number::text
    ) as metadata
  from public.national_championship_heats h
  join public.national_championship_editions ed on ed.id=h.edition_id
  left join public.countries c on upper(c.code)=upper(ed.country_code)
  where h.qualification_date is not null
    and h.race_id is null
    and ed.route_status='ready'
    and ed.status not in ('cancelled','inactive','completed')
),
world_nations_events as (
  select
    ('world-nations-event:' || e.id::text) as id,
    r.round_label || ' · ' || g.group_label || ' · ' ||
      case e.race_type
        when 'team_time_trial' then 'Team Time Trial'
        when 'flat_road_race' then 'Flat Road Race'
        else 'Hilly / Mountain Road Race'
      end as name,
    coalesce(e.host_country_code,g.host_country_code) as country_code,
    e.event_date as start_date,
    e.event_date as end_date,
    'National Association'::text as category,
    'one_day'::text as race_type,
    false as is_stage_race,
    1::integer as stage_count,
    'scheduled'::text as status,
    'World Nations Championship race day'::text as description,
    jsonb_build_object(
      'calendar_placeholder', true,
      'special_kind', 'world_nations',
      'event_id', e.id,
      'group_id', e.group_id,
      'race_day', e.race_day,
      'world_nations_race_type', e.race_type,
      'nations_competition', true,
      'target_url', '/dashboard/national-association/world-nations/events/' || e.id::text
    ) as metadata
  from public.nations_group_events e
  join public.nations_competition_groups g on g.id=e.group_id
  join public.nations_competition_rounds r on r.id=g.round_id
  where e.event_date is not null
    and e.race_id is null
    and e.status <> 'cancelled'
),
all_events as (
  select * from national_championship_finals
  union all
  select * from national_championship_qualifications
  union all
  select * from world_nations_events
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'country_code', country_code,
      'host_city', null,
      'category', category,
      'race_type', race_type,
      'is_stage_race', is_stage_race,
      'stage_count', stage_count,
      'stored_stage_count', stage_count,
      'actual_stage_count', 0,
      'first_start_city', null,
      'final_finish_city', null,
      'start_date', start_date,
      'end_date', end_date,
      'status', status,
      'description', description,
      'applications_status', 'closed',
      'target_teams', null,
      'max_teams', null,
      'min_riders_per_team', null,
      'max_riders_per_team', null,
      'accepted_teams', 0,
      'existing_application_status', null,
      'metadata', metadata,
      'calendar_target_url', metadata->>'target_url',
      'calendar_placeholder', true
    )
    order by start_date,name
  ),
  '[]'::jsonb
)
from all_events;
$function$;

grant execute on function public.get_special_national_calendar_events_v1() to authenticated;

create or replace function private.current_user_race_replay_access_v1(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_primary_club_id uuid;
  v_country_code text;
  v_race public.races%rowtype;
  v_is_premium boolean := false;
  v_has_coin_unlock boolean := false;
  v_has_owned_team_participation boolean := false;
  v_has_national_access boolean := false;
  v_is_national_championship boolean := false;
  v_is_nations_competition boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','not_authenticated',
      'national_access',false,
      'team_access',false,
      'coin_access',false,
      'premium_access',false
    );
  end if;

  select * into v_race from public.races where id=p_race_id;
  if v_race.id is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','race_not_found',
      'national_access',false,
      'team_access',false,
      'coin_access',false,
      'premium_access',false
    );
  end if;

  v_primary_club_id := public.get_my_primary_club_id();

  if v_primary_club_id is not null then
    select upper(c.country_code)
      into v_country_code
    from public.clubs c
    where c.id=v_primary_club_id;
  end if;

  v_is_premium := public.current_user_has_premium_v1();

  select exists(
    select 1
    from public.race_replay_coin_unlocks u
    where u.user_id=v_uid and u.race_id=p_race_id
  ) into v_has_coin_unlock;

  select exists(
    select 1
    from public.race_team_entries rte
    join public.clubs c
      on c.id in (rte.club_id,rte.participating_club_id)
    where rte.race_id=p_race_id
      and rte.status='accepted'
      and c.owner_user_id=v_uid
  ) into v_has_owned_team_participation;

  v_is_national_championship :=
    coalesce((v_race.metadata->>'national_championship')::boolean,false)
    or upper(coalesce(v_race.category,'')) in ('NC','NCQ');

  v_is_nations_competition :=
    coalesce((v_race.metadata->>'nations_competition')::boolean,false)
    or upper(coalesce(v_race.category,'')) in ('WNQ','WNF');

  if v_country_code is not null and v_is_national_championship then
    v_has_national_access :=
      upper(coalesce(v_race.metadata->>'country_code',v_race.country_code,'')) = v_country_code;
  end if;

  if v_country_code is not null and v_is_nations_competition and not v_has_national_access then
    select exists(
      select 1
      from public.nations_group_events e
      join public.nations_group_entries nge on nge.group_id=e.group_id
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      where e.race_id=p_race_id
        and nge.status<>'withdrawn'
        and upper(ce.country_code)=v_country_code
    ) into v_has_national_access;
  end if;

  return jsonb_build_object(
    'allowed',
      v_has_owned_team_participation
      or v_has_national_access
      or v_has_coin_unlock
      or v_is_premium,
    'reason',
      case
        when v_has_owned_team_participation then 'participating_team'
        when v_has_national_access and v_is_national_championship then 'own_nation_national_championship'
        when v_has_national_access and v_is_nations_competition then 'national_team_participating'
        when v_has_coin_unlock then 'coin_unlock'
        when v_is_premium then 'premium'
        else 'coin_unlock_required'
      end,
    'national_access',v_has_national_access,
    'team_access',v_has_owned_team_participation,
    'coin_access',v_has_coin_unlock,
    'premium_access',v_is_premium,
    'is_national_championship',v_is_national_championship,
    'is_nations_competition',v_is_nations_competition,
    'viewer_country_code',v_country_code
  );
end;
$function$;

create or replace function public.get_race_replay_coin_access_v1(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public','auth','pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_balance integer := 0;
  v_access jsonb;
  v_coin_unlocked boolean := false;
  v_is_premium boolean := false;
  v_national_access boolean := false;
  v_team_access boolean := false;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;
  if p_race_id is null then
    raise exception 'Race id is required.';
  end if;

  select coalesce(w.balance,0)
    into v_balance
  from public.user_wallets w
  where w.user_id=v_user_id;

  v_access := private.current_user_race_replay_access_v1(p_race_id);
  v_coin_unlocked := coalesce((v_access->>'coin_access')::boolean,false);
  v_is_premium := coalesce((v_access->>'premium_access')::boolean,false);
  v_national_access := coalesce((v_access->>'national_access')::boolean,false);
  v_team_access := coalesce((v_access->>'team_access')::boolean,false);

  return jsonb_build_object(
    'race_id',p_race_id,
    'coin_cost',case when v_is_premium or v_national_access or v_team_access then 0 else 2 end,
    'coin_balance',coalesce(v_balance,0),
    'has_coin_unlock',v_coin_unlocked,
    'has_premium_access',v_is_premium,
    'has_national_access',v_national_access,
    'has_team_access',v_team_access,
    'access_reason',v_access->>'reason',
    'has_replay_access',coalesce((v_access->>'allowed')::boolean,false)
  );
end;
$function$;

create or replace function public.purchase_race_replay_access_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public','auth','pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_balance integer := 0;
  v_system_key text;
  v_access jsonb;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;
  if p_race_id is null then
    raise exception 'Race id is required.';
  end if;

  v_access := private.current_user_race_replay_access_v1(p_race_id);

  -- Never charge a viewer who already has free team/national/Premium access
  -- or a previous permanent Coin unlock.
  if coalesce((v_access->>'allowed')::boolean,false) then
    return public.get_race_replay_coin_access_v1(p_race_id);
  end if;

  insert into public.user_wallets(user_id,balance)
  values(v_user_id,0)
  on conflict(user_id) do nothing;

  select w.balance into v_balance
  from public.user_wallets w
  where w.user_id=v_user_id
  for update;

  if coalesce(v_balance,0)<2 then
    raise exception
      'You need 2 coins to unlock this race replay. Current balance: %.',
      coalesce(v_balance,0);
  end if;

  v_system_key:=format('race_replay_unlock_%s_%s',v_user_id::text,p_race_id::text);

  if not exists(
    select 1 from public.user_coin_ledger l
    where l.user_id=v_user_id
      and l.payload_json->>'system_key'=v_system_key
  ) then
    insert into public.user_coin_ledger(user_id,delta,reason,payload_json)
    values(
      v_user_id,-2,'race_replay_unlock',
      jsonb_build_object(
        'system_key',v_system_key,
        'category','race_replay',
        'race_id',p_race_id,
        'coin_cost',2,
        'permanent_unlock',true
      )
    );

    update public.user_wallets
    set balance=balance-2
    where user_id=v_user_id;
  end if;

  insert into public.race_replay_coin_unlocks(user_id,race_id,coin_cost)
  values(v_user_id,p_race_id,2)
  on conflict(user_id,race_id) do nothing;

  return public.get_race_replay_coin_access_v1(p_race_id);
end;
$function$;

create or replace function public.get_authorized_race_stage_replay_payload_v1(p_stage_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_race_id uuid;
  v_payload jsonb;
  v_access jsonb;
begin
  select rs.race_id into v_race_id
  from public.race_stages rs
  where rs.id=p_stage_id;

  if v_race_id is null then
    return jsonb_build_object(
      'status','not_available',
      'reason','stage_not_found_or_unscheduled',
      'stage_id',p_stage_id
    );
  end if;

  v_payload:=public.get_universal_race_stage_replay_payload_v1(p_stage_id);

  -- Availability/timing remains public to authenticated game users so the UI can
  -- show when a replay opens. The actual replay snapshots stay protected.
  if coalesce(v_payload->>'status','') <> 'available' then
    return v_payload;
  end if;

  v_access:=private.current_user_race_replay_access_v1(v_race_id);

  if coalesce((v_access->>'allowed')::boolean,false) then
    return v_payload || jsonb_build_object(
      'access_required',false,
      'access_reason',v_access->>'reason'
    );
  end if;

  return (v_payload - 'input_snapshot' - 'output_snapshot')
    || jsonb_build_object(
      'access_required',true,
      'access_reason','coin_unlock_required'
    );
end;
$function$;

grant execute on function public.get_authorized_race_stage_replay_payload_v1(uuid) to authenticated;
