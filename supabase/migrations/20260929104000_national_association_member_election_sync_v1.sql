-- Safe member-facing election lifecycle sync.
-- This wrapper can only operate on the authenticated user's own active Association.

create or replace function public.sync_my_national_association_election_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_association_id uuid;
  v_season integer;
  v_election_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select m.association_id
  into v_association_id
  from public.national_association_memberships m
  join public.national_associations a
    on a.id=m.association_id
   and a.status='active'
  where m.user_id=v_uid
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,v_uid)
  order by m.created_at desc
  limit 1;

  if v_association_id is null then
    return jsonb_build_object('status','no_active_association');
  end if;

  select season_number
  into v_season
  from public.game_state
  where id=true;

  v_election_id:=public.ensure_national_coach_election_v1(
    v_association_id,
    v_season
  );

  if v_election_id is null then
    return jsonb_build_object(
      'status','no_election',
      'association_id',v_association_id,
      'season_number',v_season
    );
  end if;

  return public.process_national_coach_election_v1(v_election_id)
    || jsonb_build_object(
      'association_id',v_association_id,
      'election_id',v_election_id,
      'season_number',v_season
    );
end;
$$;

revoke all on function public.sync_my_national_association_election_v1()
from public,anon,authenticated;

grant execute on function public.sync_my_national_association_election_v1()
to authenticated;
