-- National Association election safety patch v1
-- Tightens trusted lifecycle execution and guarantees first activation gets
-- a full Tennis-style 10-day registration + 10-day voting window.

create or replace function public.ensure_national_coach_election_v1(
  p_association_id uuid,
  p_season_number integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assoc public.national_associations%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_current_season integer;
  v_season integer;
  v_today date:=public.get_current_game_date_date();
  v_existing uuid;
  v_any_previous boolean:=false;
  v_kind text;
  v_reason text;
  v_registration_open date;
  v_registration_close date;
  v_round1_open date;
  v_round1_close date;
  v_id uuid;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return null;
  end if;

  select season_number into v_current_season
  from public.game_state
  where id=true;

  if v_current_season is null then
    raise exception 'Game season is unavailable.';
  end if;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season<>v_current_season then
    raise exception 'National Coach elections can only be created for the current season.';
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  select id into v_existing
  from public.national_coach_elections
  where association_id=p_association_id
    and season_number=v_season
    and status in ('candidate_registration','voting','runoff','completed')
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select exists(
    select 1
    from public.national_coach_elections
    where association_id=p_association_id
  )
  into v_any_previous;

  perform public.carry_forward_national_coach_v1(p_association_id,v_season);

  if not v_any_previous then
    -- First activation follows the Tennis rule even if activation happens in January:
    -- everyone receives the full registration and voting windows.
    v_kind:='activation';
    v_reason:='association_activated';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  else
    -- Established Associations use the fixed annual January calendar.
    v_kind:='annual';
    v_reason:='annual_january_election';
    v_registration_open:=public.game_date_from_parts(
      v_season,v_cfg.annual_registration_start_month,v_cfg.annual_registration_start_day
    );
    v_registration_close:=public.game_date_from_parts(
      v_season,v_cfg.annual_registration_close_month,v_cfg.annual_registration_close_day
    );
    v_round1_open:=v_registration_close;
    v_round1_close:=public.game_date_from_parts(
      v_season,v_cfg.annual_round1_close_month,v_cfg.annual_round1_close_day
    );

    if v_today>=v_round1_close then
      -- Recovery case: if the annual process was missed, never create an
      -- already-expired election. Open a fresh replacement election instead.
      v_kind:='replacement';
      v_reason:='missing_coach_recovery';
      v_registration_open:=v_today;
      v_registration_close:=v_today+v_cfg.activation_registration_days;
      v_round1_open:=v_registration_close;
      v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
    end if;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,
    registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,
    current_round,current_round_open_date,current_round_close_date,
    runoff_registration_open
  )
  values(
    p_association_id,v_season,v_kind,v_reason,'candidate_registration',
    v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,
    1,v_round1_open,v_round1_close,false
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.join_my_national_association_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_country_name text;
  v_membership_id uuid;
  v_member_count integer;
  v_minimum integer;
  v_today date:=public.get_current_game_date_date();
  v_activated boolean:=false;
  v_status text;
  v_election_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    raise exception 'Your active human main club is not eligible for a National Association.';
  end if;

  select c.name into v_country_name
  from public.countries c
  where upper(c.code)=v_club.country_code
  limit 1;

  insert into public.national_associations(
    country_code,name,status,created_by_user_id,created_on_game_date,last_status_change_on_game_date
  )
  values(
    v_club.country_code,
    coalesce(v_country_name,v_club.country_code)||' National Association',
    'forming',
    v_uid,
    v_today,
    v_today
  )
  on conflict(country_code) do update
    set updated_at=now()
  returning * into v_assoc;

  update public.national_association_memberships
  set status='left',
      left_on_game_date=v_today,
      updated_at=now()
  where user_id=v_uid
    and status='active'
    and association_id<>v_assoc.id;

  insert into public.national_association_memberships(
    association_id,user_id,club_id,status,coach_eligible,joined_on_game_date,left_on_game_date
  )
  values(
    v_assoc.id,v_uid,v_club.club_id,'active',true,v_today,null
  )
  on conflict(association_id,user_id) do update
    set club_id=excluded.club_id,
        status='active',
        coach_eligible=true,
        joined_on_game_date=
          case
            when public.national_association_memberships.status='active'
              then public.national_association_memberships.joined_on_game_date
            else excluded.joined_on_game_date
          end,
        left_on_game_date=null,
        updated_at=now()
  returning id into v_membership_id;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  if v_member_count>=coalesce(v_minimum,5)
     and v_assoc.status<>'active' then
    update public.national_associations
    set status='active',
        activated_on_game_date=coalesce(activated_on_game_date,v_today),
        inactive_on_game_date=null,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where id=v_assoc.id;

    v_activated:=true;
  end if;

  select status into v_status
  from public.national_associations
  where id=v_assoc.id;

  if v_status='active' then
    v_election_id:=public.ensure_national_coach_election_v1(v_assoc.id,null);
  end if;

  return jsonb_build_object(
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'country_code',v_assoc.country_code,
    'membership_id',v_membership_id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'association_status',v_status,
    'activated_now',v_activated,
    'election_id',v_election_id,
    'has_treasury',false
  );
end;
$$;

-- Lifecycle creation/resolution is trusted-server work, not a user-callable API.
revoke all on function public.ensure_national_coach_election_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.ensure_national_coach_election_v1(uuid,integer) to service_role;

revoke all on function public.carry_forward_national_coach_v1(uuid,integer) from public,anon,authenticated;
grant execute on function public.carry_forward_national_coach_v1(uuid,integer) to service_role;

revoke all on function public.resolve_national_coach_election_v1(uuid) from public,anon,authenticated;
grant execute on function public.resolve_national_coach_election_v1(uuid) to service_role;

revoke all on function public.process_national_coach_election_v1(uuid) from public,anon,authenticated;
grant execute on function public.process_national_coach_election_v1(uuid) to service_role;

revoke all on function public.process_national_coach_elections_v1() from public,anon,authenticated;
grant execute on function public.process_national_coach_elections_v1() to service_role;
