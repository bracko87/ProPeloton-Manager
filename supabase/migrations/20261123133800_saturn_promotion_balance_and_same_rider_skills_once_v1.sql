-- Applies the destination tier's official starter skills/capital exactly once.
-- Preserve the original riders, contracts, sponsors, kit, policies, infrastructure
-- and equipment. Do not modify game clock, Coins or Premium.
create table private.saturn_converted_promotion_alignment_v1(
 club_id uuid primary key references public.clubs(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 destination_tier text not null,
 riders_updated integer not null,
 skill_gain integer not null,
 overall_before numeric,
 overall_after numeric,
 cash_before numeric not null,
 cash_target numeric not null,
 cash_delta numeric not null,
 cash_after numeric not null,
 applied_at timestamptz not null default clock_timestamp()
);
alter table private.saturn_converted_promotion_alignment_v1 enable row level security;
revoke all on private.saturn_converted_promotion_alignment_v1 from public,anon,authenticated;

create or replace function private.saturn_align_converted_team_v1(p_club_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $f$
declare
  v_place record;
  v_club record;
  v_profile public.team_tier_balance_profiles%rowtype;
  v_n int;
  v_gain int;
  v_before numeric;
  v_after numeric;
  v_target numeric;
  v_delta numeric;
  v_cash_after numeric;
  v_reserved int;
begin
  if p_club_id is null then raise exception 'Club ID required';end if;
  perform pg_advisory_xact_lock(hashtextextended('saturn-align:'||p_club_id::text,81));
  if exists(select 1 from private.saturn_converted_promotion_alignment_v1 a where a.club_id=p_club_id) then
    return jsonb_build_object('status','already_applied','club_id',p_club_id);
  end if;
  select p.user_id,p.from_club_tier,p.to_club_tier,p.to_world_tier into v_place
  from private.saturn_converted_team_placements_v1 p where p.club_id=p_club_id;
  if not found or v_place.from_club_tier::text <> 'amateur'
     or v_place.to_club_tier::text not in ('continental','proteam','worldteam') then
    raise exception 'Not an approved converted team placement';
  end if;
  select c.id,c.owner_user_id,c.club_tier,c.world_tier,c.cash_balance into v_club
  from public.clubs c where c.id=p_club_id and c.owner_user_id=v_place.user_id
    and c.club_tier=v_place.to_club_tier and c.world_tier=v_place.to_world_tier
    and c.club_type='main' and c.is_active and not c.is_ai and c.deleted_at is null
    for update;
  if not found or
    not exists(select 1 from public.saturn_test_accounts_v1 s join auth.users u on u.id=s.user_id
      where s.club_id=p_club_id and s.user_id=v_place.user_id and s.converted_at is not null
        and u.is_anonymous is false and u.deleted_at is null) or
    not exists(select 1 from public.club_memberships m where m.club_id=p_club_id
      and m.user_id=v_place.user_id and m.role='owner') then
    raise exception 'Permanent owner, placement or club is not verified';
  end if;
  if public.season_transition_guard_active_v1() then
    raise exception 'Cannot align skills during season transition';
  end if;
  if exists(select 1 from public.club_riders cr join public.club_riders other
    on other.rider_id=cr.rider_id where cr.club_id=p_club_id and other.club_id<>p_club_id) then
    raise exception 'Cannot align shared riders';
  end if;
  if exists(select 1 from public.race_team_entries e left join public.races r on r.id=e.race_id
    where (e.club_id=p_club_id or e.participating_club_id=p_club_id)
      and coalesce(r.status,'unknown') not in ('completed','finished','cancelled'))
   or exists(select 1 from public.race_team_applications a left join public.races r on r.id=a.race_id
    where a.team_id=p_club_id and coalesce(r.status,'unknown') not in ('completed','finished','cancelled')) then
    raise exception 'Race commitments prevent alignment';
  end if;
  select * into v_profile from public.team_tier_balance_profiles
  where tier_key=public._get_club_balance_tier_key(p_club_id);
  if not found or v_profile.starting_cash_user<=0 or v_profile.avg_overall_target<=0 then
    raise exception 'Missing official destination tier profile';
  end if;
  select count(*),avg(r.overall)::numeric into v_n,v_before
    from public.club_riders cr join public.riders r on r.id=cr.rider_id
    where cr.club_id=p_club_id and r.availability_status is distinct from 'retired';
  if v_n<8 or v_before is null then raise exception 'Incomplete starter rider roster';end if;
  v_gain:=greatest(0,least(30,round(v_profile.avg_overall_target-v_before)::int));
  v_target:=v_profile.starting_cash_user;
  v_delta:=greatest(0,v_target-floor(v_club.cash_balance));
  insert into private.saturn_converted_promotion_alignment_v1
    (club_id,user_id,destination_tier,riders_updated,skill_gain,overall_before,overall_after,
     cash_before,cash_target,cash_delta,cash_after)
  values(p_club_id,v_place.user_id,v_place.to_club_tier::text,v_n,v_gain,v_before,v_before,
         v_club.cash_balance,v_target,v_delta,v_club.cash_balance)
  on conflict(club_id) do nothing returning 1 into v_reserved;
  if v_reserved is null then return jsonb_build_object('status','already_applied');end if;

  if v_gain>0 then
    update public.riders r set
      sprint=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.sprint+v_gain)),
      climbing=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.climbing+v_gain)),
      time_trial=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.time_trial+v_gain)),
      endurance=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.endurance+v_gain)),
      flat=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.flat+v_gain)),
      recovery=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.recovery+v_gain)),
      resistance=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.resistance+v_gain)),
      race_iq=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.race_iq+v_gain)),
      teamwork=least((case when r.role::text='Leader' then v_profile.rare_cap_overall else v_profile.rider_max_overall end),greatest(v_profile.rider_min_overall,r.teamwork+v_gain)),
      potential=least(v_profile.potential_max,greatest(v_profile.potential_min,r.potential+v_gain))
    where r.id in(select cr.rider_id from public.club_riders cr where cr.club_id=p_club_id)
      and r.availability_status is distinct from 'retired';
  end if;
  -- Existing auditable double-entry treasury helper computes only the gap.
  -- DO NOT call apply_new_club_creation_balance_v1: it can reset infrastructure,
  -- policies and rider roster, all of which must be preserved.
  if v_delta>0 then perform public._apply_new_club_starting_cash_v1(p_club_id);end if;
  select avg(r.overall)::numeric into v_after from public.club_riders cr
    join public.riders r on r.id=cr.rider_id
    where cr.club_id=p_club_id and r.availability_status is distinct from 'retired';
  select c.cash_balance into v_cash_after from public.clubs c where c.id=p_club_id;
  update private.saturn_converted_promotion_alignment_v1 set
    overall_after=v_after,cash_after=v_cash_after,cash_delta=v_cash_after-v_club.cash_balance
  where club_id=p_club_id;
  return jsonb_build_object('status','applied','club_id',p_club_id,'rider_count',v_n,
   'overall_before',round(v_before,1),'overall_after',round(v_after,1),
   'cash_before',v_club.cash_balance,'cash_after',v_cash_after,
   'credited',v_cash_after-v_club.cash_balance);
end;
$f$;
revoke all on function private.saturn_align_converted_team_v1(uuid) from public,anon,authenticated;

create or replace function private.saturn_align_on_placement_v1()
returns trigger language plpgsql security definer set search_path to '' as $f$
begin
  perform private.saturn_align_converted_team_v1(new.club_id);
  return new;
end;
$f$;
revoke all on function private.saturn_align_on_placement_v1() from public,anon,authenticated;
create trigger saturn_align_on_converted_placement_v1 after insert
  on private.saturn_converted_team_placements_v1
  for each row execute function private.saturn_align_on_placement_v1();

-- Repair the exact existing approved placements, once, with no action on
-- guests who have not converted.
do $backfill$
declare v_id uuid;
begin
  for v_id in
    select p.club_id from private.saturn_converted_team_placements_v1 p
    join public.saturn_test_accounts_v1 s on s.club_id=p.club_id
    where s.converted_at is not null order by p.placed_at,p.club_id
  loop
    perform private.saturn_align_converted_team_v1(v_id);
  end loop;
end;
$backfill$;
