begin;

-- Developing Team / U23 is a Premium-only gameplay entitlement.
-- Existing Developing Team rows are preserved when Premium lapses, but access,
-- movement, race preparation, U23 coaching and seasonal renewal are disabled.
-- Premium members still pay the configured seasonal coin service cost.

create or replace function public.user_has_premium_access_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select
        coalesce(s.access_until > now(), false)
        and (
          coalesce(s.stripe_status, 'free') not in ('canceled', 'incomplete_expired')
          or lower(coalesce(s.metadata ->> 'manual_test_access', 'false')) in ('true', '1', 'yes')
        )
      from public.user_premium_subscriptions s
      where s.user_id = p_user_id
      limit 1
    ),
    false
  );
$$;

create or replace function public.current_user_has_premium_v1()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.user_has_premium_access_v1(auth.uid());
$$;

update public.developing_team_service_config
set activation_coin_cost = 100,
    renewal_coin_cost = 100,
    updated_at = now()
where config_key = 'default';

create or replace function public.developing_team_activation_coin_cost_v1()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select cfg.activation_coin_cost
      from public.developing_team_service_config cfg
      where cfg.config_key = 'default'
      limit 1
    ),
    100
  );
$$;

create or replace function public.developing_team_renewal_coin_cost_v1()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select cfg.renewal_coin_cost
      from public.developing_team_service_config cfg
      where cfg.config_key = 'default'
      limit 1
    ),
    100
  );
$$;

create or replace function public.get_developing_team_status()
returns table(
  main_club_id uuid,
  main_club_name text,
  developing_club_id uuid,
  developing_club_name text,
  team_exists boolean,
  access_status text,
  is_active boolean,
  is_read_only boolean,
  current_season integer,
  active_season integer,
  expires_after_season integer,
  next_renewal_season integer,
  auto_renew boolean,
  activation_coin_cost integer,
  renewal_coin_cost integer,
  coin_balance integer,
  coin_requirement_met boolean,
  activation_coin_requirement_met boolean,
  renewal_coin_requirement_met boolean,
  real_days_played integer,
  game_days_played integer,
  time_requirement_met boolean,
  can_activate boolean,
  can_reactivate boolean,
  can_change_auto_renew boolean,
  movement_window_open boolean,
  current_window_label text,
  next_window_label text,
  current_competition_name text,
  current_competition_place integer,
  current_competition_total_teams integer,
  is_purchased boolean,
  coin_cost integer,
  can_purchase boolean
)
language sql
stable
security definer
set search_path = public, auth, extensions, pg_temp
as $$
  with status_base as (
    select *
    from public.get_developing_team_status_base_v9()
  ),
  premium as (
    select public.current_user_has_premium_v1() as is_premium
  )
  select
    b.main_club_id,
    b.main_club_name,
    b.developing_club_id,
    b.developing_club_name,
    b.team_exists,
    case
      when p.is_premium then b.access_status
      when b.team_exists then 'expired'::text
      else 'not_activated'::text
    end,
    (b.is_active and p.is_premium),
    (b.is_read_only or (b.team_exists and not p.is_premium)),
    b.current_season,
    b.active_season,
    b.expires_after_season,
    b.next_renewal_season,
    (b.auto_renew and p.is_premium),
    b.activation_coin_cost,
    b.renewal_coin_cost,
    b.coin_balance,
    b.coin_requirement_met,
    b.activation_coin_requirement_met,
    b.renewal_coin_requirement_met,
    b.real_days_played,
    b.game_days_played,
    b.time_requirement_met,
    (b.can_activate and p.is_premium),
    (b.can_reactivate and p.is_premium),
    (b.can_change_auto_renew and p.is_premium),
    (b.movement_window_open and b.is_active and p.is_premium),
    b.current_window_label,
    b.next_window_label,
    b.current_competition_name,
    b.current_competition_place,
    b.current_competition_total_teams,
    (b.is_purchased and p.is_premium),
    b.coin_cost,
    (b.can_purchase and p.is_premium)
  from status_base b
  cross join premium p;
$$;

create or replace function public.is_developing_team_access_active_v1(p_club_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with resolved_main as (
    select
      main_club.id as main_club_id,
      main_club.owner_user_id
    from public.clubs requested_club
    join public.clubs main_club
      on main_club.id = case
        when requested_club.club_type = 'developing'
          then requested_club.parent_club_id
        else requested_club.id
      end
    where requested_club.id = p_club_id
    limit 1
  ),
  current_season as (
    select coalesce(
      public.get_current_season_number(),
      public.get_current_game_season_number_safe_v1(),
      1
    )::integer as season_number
  )
  select coalesce(
    exists (
      select 1
      from resolved_main main_ref
      cross join current_season season_ref
      join public.developing_team_season_access access_row
        on access_row.main_club_id = main_ref.main_club_id
      where public.user_has_premium_access_v1(main_ref.owner_user_id)
        and access_row.access_status = 'active'
        and access_row.active_season = season_ref.season_number
        and access_row.expires_after_season >= season_ref.season_number
    ),
    false
  );
$$;

-- Enforce Premium on activation, creation, renewal settings and season rollover.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='activate_developing_team_for_season_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'activate_developing_team_for_season_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  perform pg_advisory_xact_lock($old$,
    $new$  if not public.current_user_has_premium_v1() then
    raise exception 'Developing Team is a Premium-only feature. Activate Premium before creating or reactivating the U23 team.';
  end if;

  perform pg_advisory_xact_lock($new$
  );
  if v_new = v_def then raise exception 'activate Developing Team Premium patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_developing_team_and_charge_activation_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'create_developing_team_and_charge_activation_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  select
    c.id,$old$,
    $new$  if not public.current_user_has_premium_v1() then
    raise exception 'Developing Team is available only to Premium members.';
  end if;

  select
    c.id,$new$
  );
  if v_new = v_def then raise exception 'create Developing Team Premium patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='set_developing_team_auto_renew_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'set_developing_team_auto_renew_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  if p_enabled is null then$old$,
    $new$  if not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required to manage Developing Team renewal.';
  end if;

  if p_enabled is null then$new$
  );
  if v_new = v_def then raise exception 'Developing Team renewal Premium patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='process_developing_team_season_renewals_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'process_developing_team_season_renewals_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$    v_system_key := 'developing_team_renewal:'||v_row.main_club_id::text||':season:'||v_target_season::text;$old$,
    $new$    if not public.user_has_premium_access_v1(v_row.owner_user_id) then
      update public.developing_team_season_access
      set access_status='expired', auto_renew=false, updated_at=now()
      where main_club_id=v_row.main_club_id;
      v_expired_disabled:=v_expired_disabled+1;
      continue;
    end if;

    v_system_key := 'developing_team_renewal:'||v_row.main_club_id::text||':season:'||v_target_season::text;$new$
  );
  if v_new = v_def then raise exception 'Developing Team season renewal Premium patch point not found'; end if;
  execute v_new;
end $$;

-- U23 Head Coach capacity and hiring are Premium-only.
create or replace function public.get_staff_role_capacity_overview_for_club(p_club_id uuid)
returns table(
  role_type text,
  limit_count integer,
  active_count integer,
  open_slots integer,
  can_hire boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with infra as (
  select
    coalesce(ci.hq_level, 1) as hq_level,
    coalesce(ci.training_center_level, 0) as training_center_level,
    coalesce(ci.medical_center_level, 0) as medical_center_level,
    coalesce(ci.scouting_level, 0) as scouting_level,
    coalesce(ci.youth_academy_level, 0) as youth_academy_level,
    coalesce(ci.mechanics_workshop_level, 0) as mechanics_workshop_level
  from public.club_infrastructure ci
  where ci.club_id = p_club_id
),
safe_infra as (
  select * from infra
  union all
  select 1,0,0,0,0,0
  where not exists (select 1 from infra)
),
club_access as (
  select
    public.user_has_premium_access_v1(c.owner_user_id) as is_premium,
    exists (
      select 1
      from public.clubs d
      where d.parent_club_id = c.id
        and d.club_type = 'developing'
        and d.deleted_at is null
        and public.is_developing_team_access_active_v1(d.id)
    ) as has_active_developing_team
  from public.clubs c
  where c.id = p_club_id
),
safe_access as (
  select * from club_access
  union all
  select false, false
  where not exists (select 1 from club_access)
),
limits as (
  select v.role_type, v.limit_count
  from safe_infra i
  cross join safe_access access
  cross join lateral (
    values
      ('head_coach'::text, 1::integer),
      ('trainer'::text, case when i.training_center_level >= 3 then 2 else 1 end),
      ('team_doctor'::text, case when i.medical_center_level >= 3 then 2 else 1 end),
      ('physio'::text, case when i.medical_center_level >= 5 then 5 when i.medical_center_level >= 4 then 4 when i.medical_center_level >= 3 then 3 when i.medical_center_level >= 1 then 2 else 1 end),
      ('nutritionist'::text, case when i.medical_center_level >= 2 then 1 else 0 end),
      ('mechanic'::text, case when i.mechanics_workshop_level >= 4 then 5 when i.mechanics_workshop_level >= 3 then 4 when i.mechanics_workshop_level >= 2 then 3 when i.mechanics_workshop_level >= 1 then 2 else 1 end),
      ('sport_director'::text, case when i.hq_level >= 4 then 2 when i.hq_level >= 2 then 1 else 0 end),
      ('scout_analyst'::text, case when i.scouting_level >= 4 then 5 when i.scouting_level >= 3 then 4 when i.scouting_level >= 2 then 3 when i.scouting_level >= 1 then 2 else 1 end),
      ('u23_head_coach'::text, case when access.is_premium and access.has_active_developing_team and i.youth_academy_level >= 1 then 1 else 0 end)
  ) as v(role_type, limit_count)
),
active_counts as (
  select cs.role_type::text as role_type, count(*)::integer as active_count
  from public.club_staff cs
  where cs.club_id = p_club_id
    and cs.is_active = true
  group by cs.role_type::text
)
select
  l.role_type,
  l.limit_count,
  coalesce(a.active_count,0)::integer,
  greatest(l.limit_count-coalesce(a.active_count,0),0)::integer,
  (l.limit_count > coalesce(a.active_count,0))::boolean
from limits l
left join active_counts a on a.role_type=l.role_type
order by case l.role_type
  when 'head_coach' then 1 when 'trainer' then 2 when 'team_doctor' then 3
  when 'physio' then 4 when 'nutritionist' then 5 when 'mechanic' then 6
  when 'sport_director' then 7 when 'scout_analyst' then 8 when 'u23_head_coach' then 9
  else 99 end;
$$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_club_staff_role_capacity'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'get_club_staff_role_capacity not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$when rr.role_type = 'u23_head_coach' then
          case
            when ds.has_developing_team = true and i.youth_academy_level >= 1 then 1
            else 0
          end$old$,
    $new$when rr.role_type = 'u23_head_coach' then
          case
            when ds.has_developing_team = true
              and i.youth_academy_level >= 1
              and public.user_has_premium_access_v1(
                (select owner.owner_user_id from public.clubs owner where owner.id = p_club_id)
              )
              and exists (
                select 1
                from public.clubs dev
                where dev.parent_club_id = p_club_id
                  and dev.club_type = 'developing'
                  and dev.deleted_at is null
                  and public.is_developing_team_access_active_v1(dev.id)
              )
            then 1
            else 0
          end$new$
  );
  if v_new = v_def then raise exception 'U23 capacity Premium patch point not found'; end if;
  v_def := v_new;
  v_new := replace(
    v_def,
    $old$      when cc.requires_developing_team = true and cc.has_developing_team = false
        then 'Developing Team is not unlocked.'$old$,
    $new$      when cc.role_type = 'u23_head_coach'
        and not public.user_has_premium_access_v1(
          (select owner.owner_user_id from public.clubs owner where owner.id = p_club_id)
        )
        then 'Premium membership is required for the U23 Head Coach.'
      when cc.requires_developing_team = true and cc.has_developing_team = false
        then 'Developing Team is not unlocked.'$new$
  );
  if v_new = v_def then raise exception 'U23 locked reason Premium patch point not found'; end if;
  execute v_new;
end $$;

create or replace function public.get_staff_market_candidates_for_club(
  p_club_id uuid,
  p_page integer default 1,
  p_page_size integer default 500
)
returns table(
  id uuid, role_type text, specialization text, first_name text, last_name text,
  staff_name text, country_code text, birth_date date, expertise smallint,
  experience smallint, potential smallint, leadership smallint, efficiency smallint,
  loyalty smallint, salary_weekly integer, is_available boolean,
  listed_at_game_ts timestamp without time zone,
  expires_at_game_ts timestamp without time zone, notes jsonb, market_region text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_region text;
  v_offset integer;
  v_is_premium boolean := false;
begin
  v_region := public.staff_market_region_for_club(p_club_id);
  v_offset := greatest(0,(greatest(p_page,1)-1)*greatest(p_page_size,1));

  select public.user_has_premium_access_v1(c.owner_user_id)
  into v_is_premium
  from public.clubs c
  where c.id=p_club_id;

  return query
  select
    sc.id, sc.role_type, sc.specialization, sc.first_name, sc.last_name,
    sc.staff_name, sc.country_code, sc.birth_date, sc.expertise, sc.experience,
    sc.potential, sc.leadership, sc.efficiency, sc.loyalty, sc.salary_weekly,
    sc.is_available, sc.listed_at_game_ts, sc.expires_at_game_ts, sc.notes,
    public.staff_market_region_from_country(sc.country_code)
  from public.staff_candidates sc
  where sc.is_available=true
    and (sc.role_type <> 'u23_head_coach' or coalesce(v_is_premium,false))
    and public.staff_market_candidate_visible_to_club(p_club_id,sc.country_code)
    and (
      v_region is null
      or public.staff_market_region_from_country(sc.country_code)=v_region
    )
  order by sc.expires_at_game_ts asc nulls last, sc.role_type asc,
           sc.salary_weekly desc, sc.staff_name asc
  limit greatest(p_page_size,1)
  offset v_offset;
end;
$$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='hire_staff_candidate'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'hire_staff_candidate not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  perform pg_advisory_xact_lock(
    hashtext('hire_staff:' || v_club_id::text || ':' || v_candidate.role_type)
  );$old$,
    $new$  if v_candidate.role_type = 'u23_head_coach'
     and not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required to hire a U23 Head Coach.';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('hire_staff:' || v_club_id::text || ':' || v_candidate.role_type)
  );$new$
  );
  if v_new = v_def then raise exception 'U23 hire Premium patch point not found'; end if;
  execute v_new;
end $$;

create or replace function public.get_eligible_u23_head_coaches_for_race_v1(
  p_race_preparation_id uuid
)
returns table(
  staff_id uuid,
  staff_name text,
  staff_club_id uuid,
  team_scope text,
  specialization text,
  expertise smallint,
  efficiency smallint,
  potential smallint,
  experience smallint,
  leadership smallint,
  loyalty smallint,
  current_availability_factor numeric,
  contract_expires_at date
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    cs.id,
    cs.staff_name,
    cs.club_id,
    cs.team_scope,
    cs.specialization,
    cs.expertise,
    cs.efficiency,
    cs.potential,
    cs.experience,
    cs.leadership,
    cs.loyalty,
    public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()),
    cs.contract_expires_at
  from public.race_preparations rp
  join public.clubs owner_club on owner_club.id=rp.club_id
  join public.clubs participating_club on participating_club.id=rp.participating_club_id
  join public.club_staff cs on cs.club_id in (rp.club_id,rp.participating_club_id)
  where rp.id=p_race_preparation_id
    and public.user_has_premium_access_v1(owner_club.owner_user_id)
    and public.is_developing_team_access_active_v1(participating_club.id)
    and participating_club.club_type='developing'
    and participating_club.parent_club_id=rp.club_id
    and exists (
      select 1
      from public.get_youth_academy_effects(rp.participating_club_id) academy
      where academy.is_developing_team=true
        and academy.youth_academy_level>=1
    )
    and cs.role_type='u23_head_coach'
    and cs.is_active=true
    and cs.team_scope in ('u23','all')
    and (cs.contract_expires_at is null or cs.contract_expires_at>=public.get_current_game_date_date())
  order by
    public.get_staff_assignment_availability_factor(cs.id,public.get_current_game_date_date()) desc,
    cs.expertise desc, cs.experience desc, cs.id;
$$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='set_u23_stage_plan_automation_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'set_u23_stage_plan_automation_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  v_current_game_date :=
    public.get_current_game_date_date();$old$,
    $new$  if v_enabled and not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required for U23 Head Coach Stage Plan automation.';
  end if;

  v_current_game_date :=
    public.get_current_game_date_date();$new$
  );
  if v_new = v_def then raise exception 'U23 automation setter Premium patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='apply_u23_stage_plan_automation_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'apply_u23_stage_plan_automation_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  if v_prep.status not in ($old$,
    $new$  if not public.user_has_premium_access_v1(
    (select owner.owner_user_id from public.clubs owner where owner.id=v_prep.owner_club_id)
  ) then
    return jsonb_build_object(
      'status','skipped',
      'code','premium_required',
      'message','Premium membership is required for U23 Head Coach automation.',
      'applied',false
    );
  end if;

  if v_prep.status not in ($new$
  );
  if v_new = v_def then raise exception 'U23 automation apply Premium patch point not found'; end if;
  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='set_regular_training_coach_automation_v1'
  order by p.oid desc limit 1;
  if v_oid is null then raise exception 'set_regular_training_coach_automation_v1 not found'; end if;
  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    $old$  if v_club_type = 'developing' then
    select coalesce(e.youth_academy_level, 0)$old$,
    $new$  if coalesce(p_enabled,false)
     and v_expected_role='u23_head_coach'
     and not public.user_has_premium_access_v1(
       (select club.owner_user_id from public.clubs club where club.id=p_club_id)
     ) then
    raise exception 'Premium membership is required for U23 Head Coach training automation.';
  end if;

  if v_club_type = 'developing' then
    select coalesce(e.youth_academy_level, 0)$new$
  );
  if v_new = v_def then raise exception 'U23 regular training Premium patch point not found'; end if;
  execute v_new;
end $$;

-- Any previously scheduled U23 automation is disabled when the owner currently
-- has no Premium entitlement. Data and staff contracts are intentionally kept.
update public.race_preparation_stage_plan_automation automation
set
  is_enabled=false,
  last_generation_status='premium_required',
  last_generation_summary=jsonb_build_object(
    'status','disabled',
    'code','premium_required',
    'message','Premium membership is required for U23 Head Coach automation.'
  ),
  updated_at=now()
where automation.planner_role='u23_head_coach'
  and automation.is_enabled=true
  and exists (
    select 1
    from public.clubs owner_club
    where owner_club.id=automation.owner_club_id
      and not public.user_has_premium_access_v1(owner_club.owner_user_id)
  );

update public.club_regular_training_automation training
set
  is_enabled=false,
  metadata=coalesce(training.metadata,'{}'::jsonb)
    || jsonb_build_object(
      'disabled_reason','premium_required',
      'disabled_at',now()
    ),
  updated_at=now()
where training.manager_role='u23_head_coach'
  and training.is_enabled=true
  and exists (
    select 1
    from public.clubs club
    where club.id=training.club_id
      and not public.user_has_premium_access_v1(club.owner_user_id)
  );

commit;
