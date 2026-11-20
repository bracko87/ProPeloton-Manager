-- SAT-08: review-only shared equipment access protection.
-- Supersedes only this existing resolver after lifecycle + race guard migrations.
-- Do NOT deploy until isolated staging tests prove registered, developing,
-- AI/scheduler and anonymous trial behavior. Live production unchanged.
-- This covers equipment RPCs that use equipment_assert_club_access and
-- does NOT imply the full gameplay mutation surface is secure.

create or replace function public.equipment_assert_club_access(p_club_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $saturn$
declare
  v_uid uuid;
  v_claim_sub text;
  v_claims jsonb;
  v_resolved_club_id uuid;
begin
  -- Preserve original canonical Auth + legacy verified JWT fallback.
  v_uid := auth.uid();
  if v_uid is null then
    v_claim_sub := nullif(current_setting('request.jwt.claim.sub',true),'');
    if v_claim_sub is not null then
      v_uid := v_claim_sub::uuid;
    end if;
  end if;
  if v_uid is null then
    v_claims := nullif(current_setting('request.jwt.claims',true),'')::jsonb;
    if v_claims ? 'sub' then
      v_uid := (v_claims->>'sub')::uuid;
    end if;
  end if;
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (
    select 1 from public.clubs c
    where c.id=p_club_id and c.owner_user_id=v_uid and c.deleted_at is null
  ) then
    raise exception 'Club access denied';
  end if;

  -- Preserve original developing-team -> owned parent club resolution.
  select coalesce((
    select p.id
    from public.clubs d join public.clubs p on p.id=d.parent_club_id
    where d.id=p_club_id and d.club_type='developing'
      and d.deleted_at is null and p.deleted_at is null
      and d.owner_user_id=v_uid and p.owner_user_id=v_uid
  ),p_club_id) into v_resolved_club_id;

  -- NEW: a linked email/Google Auth identity remains an unconverted Saturn
  -- player until converted_at is actually set. Evaluate the trial by its
  -- original owner and original active 14-day clock, irrespective of
  -- the current is_anonymous flag. Normal registered owners and fully
  -- converted original accounts follow all their original rules.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(v_resolved_club_id)
  then
    raise exception 'Test account expired or not authorized for equipment'
      using errcode='42501';
  end if;
  return v_resolved_club_id;
end;
$saturn$;

-- Internal ownership resolver; cannot be called directly from browser roles.
-- Permission tightening requires verified normal equipment UI regression.
revoke all on function public.equipment_assert_club_access(uuid)
from public, anon, authenticated;
