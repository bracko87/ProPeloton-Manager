-- New rule: AI clubs never become retired/deleted by automated game logic.
-- When a new human club uses a competition slot, transfer the displaced AI
-- club to the active curated AI reserve pool, not deleted_at/is_active=false.

create or replace function public.prevent_unapproved_ai_club_retirement_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if TG_OP='DELETE' then
    if old.is_ai is true then
      raise exception 'AI club % (%) cannot be deleted without explicit owner authorization',old.name,old.id;
    end if;
    return old;
  end if;
  if old.is_ai is true and (
    new.is_ai is distinct from true
    or (old.deleted_at is null and new.deleted_at is not null)
    or (old.is_active is true and new.is_active is false)
  ) then
    raise exception 'AI club % (%) cannot be retired, disabled, or converted without explicit owner authorization',old.name,old.id;
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_unapproved_ai_club_retirement_v1() from public,anon,authenticated;
drop trigger if exists trg_prevent_unapproved_ai_club_retirement_v1 on public.clubs;
create trigger trg_prevent_unapproved_ai_club_retirement_v1
before delete or update of deleted_at,is_active,is_ai on public.clubs
for each row execute function public.prevent_unapproved_ai_club_retirement_v1();

create or replace function public.assign_new_club_to_ai_slot(p_club_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ai_club_id uuid;
  v_ai_world_tier smallint;
  v_ai_tier public.club_tier;
  v_ai_tier2_division text;
  v_ai_tier3_division text;
  v_ai_amateur_division text;
begin
  -- The AI team is retained: it remains active in the reserve pool instead
  -- of being retired/deleted from the persistent cycling world.
  select
    c.id,c.world_tier,c.club_tier,c.tier2_division,c.tier3_division,c.amateur_division
  into
    v_ai_club_id,v_ai_world_tier,v_ai_tier,v_ai_tier2_division,v_ai_tier3_division,v_ai_amateur_division
  from public.clubs c
  where c.deleted_at is null
    and c.is_active is true
    and c.is_ai is true
    and c.club_type='main'
    and not public.is_national_team_club_v1(c.id)
    and not (c.club_tier='continental' and c.tier3_division='ai_pool')
  order by
    case c.club_tier
      when 'worldteam' then 1
      when 'proteam' then 2
      when 'continental' then 3
      when 'amateur' then 4
      else 99 end asc,
    coalesce(c.season_points,0) asc,
    c.name asc,c.created_at asc
  limit 1 for update of c skip locked;

  if v_ai_club_id is null then
    raise exception 'No available active AI competition slot; no AI team may be retired as a fallback.';
  end if;

  update public.clubs
  set club_tier='continental'::public.club_tier,
      world_tier=3,
      tier2_division=null,
      tier3_division='ai_pool',
      amateur_division=null,
      season_points=0,
      is_active=true,
      deleted_at=null,
      updated_at=now()
  where id=v_ai_club_id
    and is_ai=true and deleted_at is null;

  update public.clubs
  set world_tier=v_ai_world_tier,
      club_tier=v_ai_tier,
      tier2_division=case when v_ai_tier='proteam' then v_ai_tier2_division else null end,
      tier3_division=case when v_ai_tier='continental' then v_ai_tier3_division else null end,
      amateur_division=case when v_ai_tier='amateur' then v_ai_amateur_division else null end,
      season_points=0,
      is_ai=false,
      is_active=true
  where id=p_club_id and is_ai=false and deleted_at is null;

  if not found then
    raise exception 'Expected active player club % while assigning competition slot',p_club_id;
  end if;
end;
$$;
revoke all on function public.assign_new_club_to_ai_slot(uuid) from public,anon,authenticated;
