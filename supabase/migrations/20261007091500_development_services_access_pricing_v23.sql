-- Development service access/pricing rebalance.
-- Developing Team:
--   * available to all managers after the existing 30 real-day OR 60 game-day maturity gate
--   * 100 coins first activation
--   * 100 coins per-season renewal/reactivation
--   * Premium is NOT required for the team, rider movement, U23 staff hiring or manual U23 staff use
--   * Premium-only automation/advanced analytics remain Premium features
-- Youth Academy / U16:
--   * remains Premium-only
--   * 50 coins first activation
--   * 50 coins renewal for each later in-game season
--   * existing Academies are grandfathered through the current season

begin;

-- ---------------------------------------------------------------------------
-- Youth Academy seasonal coin renewal
-- ---------------------------------------------------------------------------

alter table public.youth_academy_service_config
  add column if not exists renewal_coin_cost integer;

update public.youth_academy_service_config
set renewal_coin_cost = 50
where config_key = 'default'
  and renewal_coin_cost is distinct from 50;

alter table public.youth_academy_service_config
  alter column renewal_coin_cost set default 50;

update public.youth_academy_service_config
set renewal_coin_cost = 50
where renewal_coin_cost is null;

alter table public.youth_academy_service_config
  alter column renewal_coin_cost set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.youth_academy_service_config'::regclass
      and conname = 'youth_academy_service_config_renewal_coin_cost_check'
  ) then
    alter table public.youth_academy_service_config
      add constraint youth_academy_service_config_renewal_coin_cost_check
      check (renewal_coin_cost >= 0);
  end if;
end $$;

insert into public.youth_academy_service_config (
  config_key,
  activation_coin_cost,
  renewal_coin_cost,
  real_days_required,
  game_days_required,
  updated_at
)
values ('default', 50, 50, 30, 60, now())
on conflict (config_key) do update
set activation_coin_cost = 50,
    renewal_coin_cost = 50,
    real_days_required = 30,
    game_days_required = 60,
    updated_at = now();

alter table public.youth_academies
  add column if not exists renewed_through_season integer;

-- Existing Academies keep access for the season that is active when this
-- migration is applied. The first 50-coin renewal is due only from the next
-- in-game season.
update public.youth_academies
set renewed_through_season = greatest(
  coalesce(renewed_through_season, 0),
  coalesce(public.get_current_season_number(), activated_season, 1)
)
where is_active = true;

create or replace function private.set_youth_academy_initial_service_season_v23()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
begin
  if new.renewed_through_season is null then
    new.renewed_through_season := coalesce(
      public.get_current_season_number(),
      new.activated_season,
      1
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_youth_academy_initial_service_season_v23
  on public.youth_academies;

create trigger trg_youth_academy_initial_service_season_v23
before insert on public.youth_academies
for each row
execute function private.set_youth_academy_initial_service_season_v23();

create or replace function public.youth_academy_renewal_coin_cost_v1()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select renewal_coin_cost
      from public.youth_academy_service_config
      where config_key = 'default'
      limit 1
    ),
    50
  )::integer;
$$;

create or replace function public.user_has_youth_academy_access_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_user_id is not null
    and public.user_has_premium_access_v1(p_user_id)
    and exists (
      select 1
      from public.clubs c
      join public.youth_academies a
        on a.club_id = c.id
       and a.is_active = true
      where c.owner_user_id = p_user_id
        and c.deleted_at is null
        and c.parent_club_id is null
        and coalesce(c.club_type, 'main') <> 'developing'
        and coalesce(a.renewed_through_season, a.activated_season, 0)
            >= coalesce(public.get_current_season_number(), 1)
    );
$$;

create or replace function public.current_user_has_youth_academy_access_v1()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select public.user_has_youth_academy_access_v1(auth.uid());
$$;

-- Preserve the comprehensive v22 payload builder and wrap it with the new
-- current-season service state. This avoids duplicating all rider/staff/budget
-- payload logic while making read_only authoritative for renewal as well as
-- Premium.
alter function public.get_my_youth_academy_v1()
  rename to get_my_youth_academy_base_v23;

revoke execute on function public.get_my_youth_academy_base_v23()
  from public, anon, authenticated;

create or replace function public.get_my_youth_academy_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_academy_id uuid;
  v_current_season integer := coalesce(public.get_current_season_number(), 1);
  v_renewed_through integer;
  v_renewal_cost integer := public.youth_academy_renewal_coin_cost_v1();
  v_balance integer := 0;
  v_premium boolean := false;
  v_season_access_active boolean := false;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  v_payload := public.get_my_youth_academy_base_v23();
  v_premium := coalesce((v_payload ->> 'premium')::boolean, false);
  v_balance := coalesce((v_payload ->> 'coin_balance')::integer, 0);

  if coalesce((v_payload ->> 'activated')::boolean, false) then
    v_academy_id := nullif(v_payload #>> '{academy,id}', '')::uuid;

    if v_academy_id is not null then
      select a.renewed_through_season
      into v_renewed_through
      from public.youth_academies a
      where a.id = v_academy_id;
    end if;

    v_renewed_through := coalesce(
      v_renewed_through,
      nullif(v_payload #>> '{academy,activated_season}', '')::integer,
      0
    );
    v_season_access_active := v_renewed_through >= v_current_season;

    return v_payload || jsonb_build_object(
      'renewal_coin_cost', v_renewal_cost,
      'current_season', v_current_season,
      'renewed_through_season', v_renewed_through,
      'season_access_active', v_season_access_active,
      'renewal_required', not v_season_access_active,
      'can_renew',
        v_premium
        and not v_season_access_active
        and v_balance >= v_renewal_cost,
      'read_only', (not v_premium) or (not v_season_access_active)
    );
  end if;

  return v_payload || jsonb_build_object(
    'renewal_coin_cost', v_renewal_cost,
    'current_season', v_current_season,
    'renewed_through_season', null,
    'season_access_active', false,
    'renewal_required', false,
    'can_renew', false
  );
end;
$function$;

create or replace function public.renew_my_youth_academy_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, private, auth, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_club_id uuid;
  v_academy_id uuid;
  v_current_season integer := coalesce(public.get_current_season_number(), 1);
  v_renewal_cost integer := public.youth_academy_renewal_coin_cost_v1();
  v_balance integer := 0;
  v_renewed_through integer := 0;
  v_debited boolean := false;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Youth Academy renewal requires an active Premium membership.';
  end if;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id = v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type, 'main') <> 'developing'
  order by c.created_at asc
  limit 1;

  if v_club_id is null then
    raise exception 'Main club not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('youth_academy_renew:' || v_club_id::text || ':' || v_current_season::text)
  );

  select a.id, coalesce(a.renewed_through_season, a.activated_season, 0)
  into v_academy_id, v_renewed_through
  from public.youth_academies a
  where a.club_id = v_club_id
    and a.is_active = true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated.';
  end if;

  if v_renewed_through >= v_current_season then
    return public.get_my_youth_academy_v1();
  end if;

  select coalesce(w.balance, 0)::integer
  into v_balance
  from public.user_wallets w
  where w.user_id = v_user;

  v_balance := coalesce(v_balance, 0);

  if v_balance < v_renewal_cost then
    raise exception
      'Not enough coins. % coins are required for Youth Academy renewal; current balance is %.',
      v_renewal_cost,
      v_balance;
  end if;

  v_debited := public.debit_user_coins_idempotent_v1(
    v_user,
    v_renewal_cost,
    'youth_academy_season_renewal',
    'youth_academy_renewal:' || v_academy_id::text || ':season:' || v_current_season::text,
    jsonb_build_object(
      'category', 'youth_academy',
      'academy_id', v_academy_id,
      'club_id', v_club_id,
      'coin_cost', v_renewal_cost,
      'season_number', v_current_season,
      'seasonal_renewal', true
    )
  );

  if not v_debited then
    raise exception 'Youth Academy renewal has already been processed for this season.';
  end if;

  update public.youth_academies
  set renewed_through_season = v_current_season
  where id = v_academy_id;

  return public.get_my_youth_academy_v1();
end;
$function$;

grant execute on function public.get_my_youth_academy_v1() to authenticated;
grant execute on function public.renew_my_youth_academy_v1() to authenticated;
grant execute on function public.youth_academy_renewal_coin_cost_v1() to authenticated;
grant execute on function public.current_user_has_youth_academy_access_v1() to authenticated;

-- Upgrade Youth write guards from "Premium exists" to
-- "Premium exists AND this Academy is renewed for the current season".
-- Read/status functions are intentionally untouched.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.proname not in (
        'get_my_youth_academy_v1',
        'get_my_youth_academy_base_v23',
        'activate_my_youth_academy_v1',
        'renew_my_youth_academy_v1',
        'user_has_youth_academy_access_v1',
        'current_user_has_youth_academy_access_v1'
      )
      and (
        position('Premium membership is required to manage Youth Academy.' in pg_get_functiondef(p.oid)) > 0
        or position('Premium membership is required to run Youth scouting.' in pg_get_functiondef(p.oid)) > 0
        or position('Premium membership is required to recruit Youth riders.' in pg_get_functiondef(p.oid)) > 0
      )
  loop
    v_def := replace(pg_get_functiondef(r.oid), E'\r\n', E'\n');
    v_new := replace(
      v_def,
      'public.user_has_premium_access_v1(v_user)',
      'public.user_has_youth_academy_access_v1(v_user)'
    );

    if v_new = v_def then
      raise exception
        'Could not apply Youth current-season access guard to %.%',
        r.nspname,
        r.proname;
    end if;

    execute v_new;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Developing Team: remove Premium entitlement from the service itself.
-- ---------------------------------------------------------------------------

update public.developing_team_service_config
set activation_coin_cost = 100,
    renewal_coin_cost = 100,
    updated_at = now()
where config_key = 'default';

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
  select
    b.main_club_id,
    b.main_club_name,
    b.developing_club_id,
    b.developing_club_name,
    b.team_exists,
    b.access_status,
    b.is_active,
    b.is_read_only,
    b.current_season,
    b.active_season,
    b.expires_after_season,
    b.next_renewal_season,
    b.auto_renew,
    b.activation_coin_cost,
    b.renewal_coin_cost,
    b.coin_balance,
    b.coin_requirement_met,
    b.activation_coin_requirement_met,
    b.renewal_coin_requirement_met,
    b.real_days_played,
    b.game_days_played,
    b.time_requirement_met,
    b.can_activate,
    b.can_reactivate,
    b.can_change_auto_renew,
    b.movement_window_open,
    b.current_window_label,
    b.next_window_label,
    b.current_competition_name,
    b.current_competition_place,
    b.current_competition_total_teams,
    b.is_purchased,
    b.coin_cost,
    b.can_purchase
  from public.get_developing_team_status_base_v9() b;
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
      main_club.id as main_club_id
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
      where access_row.access_status = 'active'
        and access_row.active_season = season_ref.season_number
        and access_row.expires_after_season >= season_ref.season_number
    ),
    false
  );
$$;

-- Remove Premium checks that were injected into Developing Team activation,
-- creation, renewal preferences and the season-renewal processor.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'activate_developing_team_for_season_v1'
  order by p.oid desc limit 1;

  if v_oid is null then
    raise exception 'activate_developing_team_for_season_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    E'  if not public.current_user_has_premium_v1() then\n    raise exception ''Developing Team is a Premium-only feature. Activate Premium before creating or reactivating the U23 team.'';\n  end if;\n\n',
    ''
  );

  if position('Developing Team is a Premium-only feature' in v_new) > 0 then
    raise exception 'Developing Team activation Premium guard could not be removed';
  end if;

  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_developing_team_and_charge_activation_v1'
  order by p.oid desc limit 1;

  if v_oid is null then
    raise exception 'create_developing_team_and_charge_activation_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    E'  if not public.current_user_has_premium_v1() then\n    raise exception ''Developing Team is available only to Premium members.'';\n  end if;\n\n',
    ''
  );

  if position('Developing Team is available only to Premium members' in v_new) > 0 then
    raise exception 'Developing Team creation Premium guard could not be removed';
  end if;

  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'set_developing_team_auto_renew_v1'
  order by p.oid desc limit 1;

  if v_oid is null then
    raise exception 'set_developing_team_auto_renew_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    E'  if not public.current_user_has_premium_v1() then\n    raise exception ''Premium membership is required to manage Developing Team renewal.'';\n  end if;\n\n',
    ''
  );

  if position('Premium membership is required to manage Developing Team renewal' in v_new) > 0 then
    raise exception 'Developing Team auto-renew Premium guard could not be removed';
  end if;

  execute v_new;
end $$;

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'process_developing_team_season_renewals_v1'
  order by p.oid desc limit 1;

  if v_oid is null then
    raise exception 'process_developing_team_season_renewals_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');
  v_new := replace(
    v_def,
    E'    if not public.user_has_premium_access_v1(v_row.owner_user_id) then\n      update public.developing_team_season_access\n      set access_status=''expired'', auto_renew=false, updated_at=now()\n      where main_club_id=v_row.main_club_id;\n      v_expired_disabled:=v_expired_disabled+1;\n      continue;\n    end if;\n\n',
    ''
  );

  if position('not public.user_has_premium_access_v1(v_row.owner_user_id)' in v_new) > 0 then
    raise exception 'Developing Team season-renewal Premium guard could not be removed';
  end if;

  execute v_new;
end $$;

-- ---------------------------------------------------------------------------
-- Staff access: the U23 Head Coach belongs to the paid Developing Team service,
-- not to Premium. Youth Academy staff continue to require Premium AND a paid
-- current-season Youth Academy renewal.
-- ---------------------------------------------------------------------------

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
    public.user_has_youth_academy_access_v1(c.owner_user_id) as has_youth_access,
    exists (
      select 1
      from public.clubs d
      where d.parent_club_id = c.id
        and d.club_type = 'developing'
        and d.deleted_at is null
        and public.is_developing_team_access_active_v1(d.id)
    ) as has_active_developing_team,
    exists (
      select 1
      from public.youth_academies a
      where a.club_id = c.id
        and a.is_active = true
    ) as has_youth_academy
  from public.clubs c
  where c.id = p_club_id
),
safe_access as (
  select * from club_access
  union all
  select false,false,false,false
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
      ('u23_head_coach'::text, case when access.has_active_developing_team and i.youth_academy_level >= 1 then 1 else 0 end),
      ('youth_academy_director'::text, case when access.has_youth_access and access.has_youth_academy then 1 else 0 end),
      ('u16_head_coach'::text, case when access.has_youth_access and access.has_youth_academy then 1 else 0 end),
      ('youth_scout'::text, case when access.has_youth_access and access.has_youth_academy then 1 else 0 end)
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
left join active_counts a on a.role_type = l.role_type
order by case l.role_type
  when 'head_coach' then 1 when 'trainer' then 2 when 'team_doctor' then 3
  when 'physio' then 4 when 'nutritionist' then 5 when 'mechanic' then 6
  when 'sport_director' then 7 when 'scout_analyst' then 8 when 'u23_head_coach' then 9
  when 'youth_academy_director' then 10 when 'u16_head_coach' then 11
  when 'youth_scout' then 12 else 99 end;
$$;

create or replace function public.get_club_staff_role_capacity(p_club_id uuid)
returns table(
  role_type text,display_name text,role_group text,assigned_count integer,
  max_absolute integer,current_capacity integer,open_slots integer,
  is_unlocked boolean,locked_reason text,facility_key text,gameplay_status text
)
language sql
stable security definer
set search_path = public, pg_temp
as $$
with role_rows as (
  select rc.role_type,rc.display_name,rc.role_group,rc.max_absolute,
         rc.facility_key,rc.requires_developing_team,rc.gameplay_status
  from public.staff_role_catalog rc
  where rc.is_market_role=true
),
infra as (
  select coalesce(max(ci.hq_level),0)::integer as hq_level,
         coalesce(max(ci.training_center_level),0)::integer as training_center_level,
         coalesce(max(ci.medical_center_level),0)::integer as medical_center_level,
         coalesce(max(ci.youth_academy_level),0)::integer as youth_academy_level,
         coalesce(max(ci.scouting_level),0)::integer as scouting_level,
         coalesce(max(ci.mechanics_workshop_level),0)::integer as mechanics_workshop_level
  from public.club_infrastructure ci where ci.club_id=p_club_id
),
assigned as (
  select cs.role_type,count(*)::integer as assigned_count
  from public.club_staff cs
  where cs.club_id=p_club_id and coalesce(cs.is_active,true)=true
  group by cs.role_type
),
club_status as (
  select
    exists(
      select 1
      from public.clubs dc
      where dc.parent_club_id=p_club_id
        and coalesce(dc.club_type,'')='developing'
        and dc.deleted_at is null
        and public.is_developing_team_access_active_v1(dc.id)
    ) as has_developing_team,
    public.user_has_premium_access_v1(c.owner_user_id) as is_premium,
    public.user_has_youth_academy_access_v1(c.owner_user_id) as has_youth_access,
    exists(
      select 1
      from public.youth_academies a
      where a.club_id=p_club_id
        and a.is_active=true
    ) as has_youth_academy
  from public.clubs c
  where c.id=p_club_id
),
capacity_calc as (
  select rr.*,coalesce(a.assigned_count,0)::integer as assigned_count,
         cs.has_developing_team,cs.is_premium,cs.has_youth_access,cs.has_youth_academy,
         i.hq_level,i.training_center_level,i.medical_center_level,
         i.youth_academy_level,i.scouting_level,i.mechanics_workshop_level,
    case
      when rr.role_type='trainer' then case when i.hq_level<1 then 0 when i.training_center_level>=5 then 3 when i.training_center_level>=3 then 2 else 1 end
      when rr.role_type='team_doctor' then case when i.hq_level<1 then 0 when i.medical_center_level>=3 then 2 else 1 end
      when rr.role_type='physio' then case when i.hq_level<1 then 0 when i.medical_center_level>=5 then 5 when i.medical_center_level>=4 then 4 when i.medical_center_level>=3 then 3 when i.medical_center_level>=1 then 2 else 1 end
      when rr.role_type='nutritionist' then case when i.hq_level<1 then 0 when i.medical_center_level>=2 then 1 else 0 end
      when rr.role_type='head_coach' then case when i.hq_level>=1 then 1 else 0 end
      when rr.role_type='scout_analyst' then case when i.hq_level<1 then 0 when i.scouting_level>=4 then 5 when i.scouting_level>=3 then 4 when i.scouting_level>=2 then 3 when i.scouting_level>=1 then 2 else 1 end
      when rr.role_type='mechanic' then case when i.hq_level<1 then 0 when i.mechanics_workshop_level>=4 then 5 when i.mechanics_workshop_level>=3 then 4 when i.mechanics_workshop_level>=2 then 3 when i.mechanics_workshop_level>=1 then 2 else 1 end
      when rr.role_type='u23_head_coach' then case when cs.has_developing_team and i.youth_academy_level>=1 then 1 else 0 end
      when rr.role_type='sport_director' then case when i.hq_level>=4 then 2 when i.hq_level>=2 then 1 else 0 end
      when rr.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
        then case when cs.has_youth_access and cs.has_youth_academy then 1 else 0 end
      else 0
    end::integer as raw_current_capacity
  from role_rows rr cross join infra i cross join club_status cs
  left join assigned a on a.role_type=rr.role_type
)
select
  cc.role_type,cc.display_name,cc.role_group,cc.assigned_count,cc.max_absolute,
  least(cc.max_absolute,cc.raw_current_capacity)::integer,
  greatest(least(cc.max_absolute,cc.raw_current_capacity)-cc.assigned_count,0)::integer,
  case
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
      then cc.has_youth_access and cc.has_youth_academy
    when cc.requires_developing_team and not cc.has_developing_team then false
    else least(cc.max_absolute,cc.raw_current_capacity)>0
  end,
  case
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
         and not cc.has_youth_academy
      then 'Activate Youth Academy first.'
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
         and not cc.is_premium
      then 'Premium membership is required for Youth Academy staff.'
    when cc.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
         and not cc.has_youth_access
      then 'Youth Academy seasonal renewal is required.'
    when cc.requires_developing_team and not cc.has_developing_team
      then 'Developing Team is not unlocked or its seasonal access has expired.'
    when cc.role_type='u23_head_coach' and cc.youth_academy_level<1
      then 'Youth Academy Lv 1 is required.'
    when cc.role_type='sport_director' and cc.hq_level<2
      then 'Club House Lv 2 is required.'
    when cc.role_type='trainer' and cc.hq_level<1
      then 'Club House Lv 1 is required.'
    when cc.role_type='nutritionist' and cc.hq_level>=1 and cc.medical_center_level<2
      then 'Medical Center Lv 2 is required.'
    when cc.hq_level<1 and cc.role_type not in ('u23_head_coach','youth_academy_director','u16_head_coach','youth_scout')
      then 'Club House Lv 1 is required.'
    else null
  end,
  cc.facility_key,cc.gameplay_status
from capacity_calc cc
order by case cc.role_group
  when 'coaching' then 1 when 'developing_team' then 2 when 'youth_academy' then 3
  when 'medical' then 4 when 'technical' then 5 when 'race' then 6
  when 'scouting' then 7 else 99 end,cc.display_name;
$$;

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
begin
  v_region := public.staff_market_region_for_club(p_club_id);
  v_offset := greatest(0,(greatest(p_page,1)-1)*greatest(p_page_size,1));

  return query
  select
    sc.id, sc.role_type, sc.specialization, sc.first_name, sc.last_name,
    sc.staff_name, sc.country_code, sc.birth_date, sc.expertise, sc.experience,
    sc.potential, sc.leadership, sc.efficiency, sc.loyalty, sc.salary_weekly,
    sc.is_available, sc.listed_at_game_ts, sc.expires_at_game_ts, sc.notes,
    public.staff_market_region_from_country(sc.country_code)
  from public.staff_candidates sc
  where sc.is_available=true
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

  if v_oid is null then
    raise exception 'hire_staff_candidate not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  -- remove every copy of the old U23 Premium-only guard
  v_new := replace(
    v_def,
    E'  if v_candidate.role_type = ''u23_head_coach''\n     and not public.current_user_has_premium_v1() then\n    raise exception ''Premium membership is required to hire a U23 Head Coach.'';\n  end if;\n\n',
    ''
  );

  -- Youth staff remain tied to Premium, now also to the 50-coin seasonal
  -- Academy renewal.
  v_new := replace(
    v_new,
    E'    if not public.current_user_has_premium_v1() then\n      raise exception ''Premium membership is required to hire Youth Academy staff.'';\n    end if;',
    E'    if not public.current_user_has_youth_academy_access_v1() then\n      raise exception ''Active Premium membership and current-season Youth Academy renewal are required to hire Youth Academy staff.'';\n    end if;'
  );

  if position('Premium membership is required to hire a U23 Head Coach.' in v_new) > 0 then
    raise exception 'U23 Head Coach hiring Premium guard could not be removed';
  end if;

  if position('Premium membership is required to hire Youth Academy staff.' in v_new) > 0 then
    raise exception 'Youth Academy staff renewal guard could not be applied';
  end if;

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
    public.get_staff_assignment_availability_factor(
      cs.id,
      public.get_current_game_date_date()
    ),
    cs.contract_expires_at
  from public.race_preparations rp
  join public.clubs participating_club
    on participating_club.id=rp.participating_club_id
  join public.club_staff cs
    on cs.club_id in (rp.club_id,rp.participating_club_id)
  where rp.id=p_race_preparation_id
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
    and (
      cs.contract_expires_at is null
      or cs.contract_expires_at>=public.get_current_game_date_date()
    )
  order by
    public.get_staff_assignment_availability_factor(
      cs.id,
      public.get_current_game_date_date()
    ) desc,
    cs.expertise desc,
    cs.experience desc,
    cs.id;
$$;

grant execute on function public.get_developing_team_status() to authenticated;
grant execute on function public.is_developing_team_access_active_v1(uuid) to authenticated;

commit;
