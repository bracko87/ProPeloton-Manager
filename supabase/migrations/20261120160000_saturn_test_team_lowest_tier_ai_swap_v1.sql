-- Saturn full-game test-account placement: review-only additive migration.
-- Depends on the lifecycle and fail-closed test-club creation migrations.
-- Do NOT deploy until full 14-day gameplay/RPC security audit is completed.
--
-- Authorized test-club creation places a private transaction-scoped ticket
-- before insertion. Only this ticket can activate the guest exceptions.
-- Normal permanent-account team assignment is unchanged.

create table if not exists private.saturn_test_club_insert_tickets_v1 (
  transaction_id bigint not null,
  user_id uuid not null,
  club_id uuid not null unique,
  world_tier smallint not null,
  amateur_division text not null,
  primary key(transaction_id, user_id)
);
alter table private.saturn_test_club_insert_tickets_v1 enable row level security;
revoke all on table private.saturn_test_club_insert_tickets_v1 from public, anon, authenticated;

-- Exact replacement of the guest owner guard with one narrow exception.
-- The client cannot write the private ticket or select its contents.
create or replace function public.ppm_reject_guest_owned_clubs_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.owner_user_id is not null and exists (
    select 1 from auth.users u
    where u.id = new.owner_user_id and u.is_anonymous is true
  ) then
    if tg_op = 'INSERT'
      and new.owner_user_id = auth.uid()
      and new.club_tier = 'amateur'::public.club_tier
      and new.is_ai is false
      and new.club_type = 'main'
      and exists (
        select 1 from private.saturn_test_club_insert_tickets_v1 t
        where t.transaction_id = txid_current()
          and t.user_id = new.owner_user_id
          and t.club_id = new.id
          and t.world_tier = new.world_tier
          and t.amateur_division = new.amateur_division
      )
      and exists (
        select 1 from private.ppm_guest_auth_gate_v1 g
        where g.id and g.enabled and g.verified_at is not null
      )
      and exists (
        select 1 from private.saturn_test_club_rollout_v1 g
        where g.id and g.enabled and g.verified_at is not null
      )
    then
      return new;
    end if;
    raise exception using errcode='P0001',
      message='Guest accounts cannot own official multiplayer clubs unless their approved test-team creation transaction is active.';
  end if;
  return new;
end;
$$;
revoke all on function public.ppm_reject_guest_owned_clubs_v1() from public, anon, authenticated;

-- Existing registered-team trigger takes its original path unchanged.
-- Only a ticketed, canonical anonymous owner may select an eligible
-- same-region, same-tier AI team that has NO historical race applications
-- or recorded race participation.
create or replace function public.trg_assign_new_real_club_to_ai_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket record;
  v_ai uuid;
begin
  if new.is_ai is not false or coalesce(new.club_type,'main') <> 'main' then
    return new;
  end if;

  select t.user_id,t.world_tier,t.amateur_division
    into v_ticket
  from private.saturn_test_club_insert_tickets_v1 t
  where t.transaction_id = txid_current()
    and t.user_id = auth.uid()
    and t.club_id = new.id;

  if not found then
    -- Existing permanent-player allocation behavior remains exactly as is.
    perform public.assign_new_club_to_ai_slot(new.id);
    return new;
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = v_ticket.user_id and u.is_anonymous is true
  ) or new.owner_user_id is distinct from v_ticket.user_id
    or new.world_tier is distinct from v_ticket.world_tier
    or new.amateur_division is distinct from v_ticket.amateur_division
    or new.club_tier <> 'amateur'::public.club_tier
  then
    raise exception 'Test team ownership or lowest-tier placement mismatch';
  end if;

  select c.id into v_ai
  from public.clubs c
  where c.is_ai is true and c.is_active is true and c.deleted_at is null
    and c.club_type='main'
    and c.club_tier='amateur'::public.club_tier
    and c.world_tier = v_ticket.world_tier
    and c.amateur_division = v_ticket.amateur_division
    and not public.is_national_team_club_v1(c.id)
    and not exists (
      select 1 from public.race_team_applications a where a.team_id=c.id
    )
    and not exists (
      select 1 from public.race_participant_teams p where p.team_id=c.id
    )
  order by coalesce(c.season_points,0),c.name,c.created_at
  limit 1 for update of c skip locked;

  if v_ai is null then
    raise exception 'No competition-safe AI slot available in the requested lowest amateur division';
  end if;

  -- Keep AI identity in the reserve pool; never delete a former team or
  -- rewrite its historical race records.
  update public.clubs
  set club_tier = 'continental'::public.club_tier,
      world_tier=3,
      tier2_division=null,
      tier3_division='ai_pool',
      amateur_division=null,
      season_points=0,
      is_active=true,
      deleted_at=null,
      updated_at=now()
  where id=v_ai and is_ai is true and deleted_at is null;
  if not found then
    raise exception 'Could not safely move the designated AI team to reserve';
  end if;

  -- new club already has the intended lowest-tier region from INSERT.
  -- The caller validates its final state after ALL triggers have executed.
  return new;
end;
$$;
revoke all on function public.trg_assign_new_real_club_to_ai_slot() from public, anon, authenticated;

-- Ticket reservation is added in a separate update to the team-creation SQL
-- (same transaction) before the clubs INSERT. It is deleted after the INSERT.
