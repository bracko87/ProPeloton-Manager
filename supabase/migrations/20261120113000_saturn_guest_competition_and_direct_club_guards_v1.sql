-- Project Saturn SAT-08: ProPeloton Manager only, 20 Nov 2026.
-- Supplement the fail-closed auth gate / rewards migration:
-- * prevent Supabase anonymous users (who carry the authenticated role)
--   from bypassing the create_club RPC by inserting/updating public.clubs.
-- * prevent guest race applications through any team's permission path.
-- Ordinary registered managers, AI pool, existing teams, accounting,
-- Premium, and the 10 Dec launch schedule are unaffected.
-- Guest Mode remains DISABLED.

CREATE OR REPLACE FUNCTION public.ppm_reject_guest_owned_clubs_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.owner_user_id is not null and exists(
    select 1 from auth.users u
    where u.id=new.owner_user_id and u.is_anonymous=true
  ) then
    raise exception using errcode='P0001',
      message='Guest accounts cannot own official multiplayer clubs until verified.';
  end if;
  return new;
end;
$function$;

revoke all on function public.ppm_reject_guest_owned_clubs_v1() from PUBLIC,anon,authenticated;
drop trigger if exists ppm_reject_guest_owned_clubs_v1 on public.clubs;
create trigger ppm_reject_guest_owned_clubs_v1
  before insert or update of owner_user_id on public.clubs
  for each row execute function public.ppm_reject_guest_owned_clubs_v1();

CREATE OR REPLACE FUNCTION public.apply_for_race_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_club_id uuid;
  v_race record;
  v_rule record;
  v_existing record;
  v_entry_id uuid;
  v_commitment_score integer := 50;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'auth_required'
    );
  end if;

  -- Guest accounts may preview cycling strategy but may not submit
  -- a real multiplayer application, including through another club.
  if exists(select 1 from auth.users au where au.id=v_user_id and au.is_anonymous=true) then
    return jsonb_build_object('success',false,'error','guest_not_eligible');
  end if;

  v_club_id := p_club_id;

  if v_club_id is null then
    select public.get_my_primary_club_id()
    into v_club_id;
  end if;

  if v_club_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'club_not_found'
    );
  end if;

  select *
  into v_race
  from public.races
  where id = p_race_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'race_not_found'
    );
  end if;

  if not public.club_race_application_allowed_v1(p_race_id) then
    return jsonb_build_object('success',false,'error','club_applications_not_allowed','can_apply',false,'race_id',p_race_id,'message','Club applications are unavailable for national qualifications, national championships and national-team competitions.');
  end if;

  if coalesce(v_race.status::text, 'scheduled') in ('active', 'completed', 'archived', 'cancelled') then
    return jsonb_build_object(
      'success', false,
      'error', 'race_locked',
      'race_status', v_race.status
    );
  end if;

  select *
  into v_rule
  from public.race_entry_rules
  where race_id = p_race_id
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'race_entry_rules_not_found'
    );
  end if;

  if coalesce(v_rule.applications_status::text, 'closed') <> 'open' then
    return jsonb_build_object(
      'success', false,
      'error', 'applications_not_open',
      'applications_status', v_rule.applications_status
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_race_id::text),
    hashtext(v_club_id::text)
  );

  select coalesce(score, 50)
  into v_commitment_score
  from public.club_race_commitment_scores
  where club_id = v_club_id;

  v_commitment_score := coalesce(v_commitment_score, 50);

  select *
  into v_existing
  from public.race_team_entries
  where race_id = p_race_id
    and club_id = v_club_id
  order by created_at desc nulls last, id desc
  limit 1
  for update;

  if found then
    if v_existing.status in ('applied', 'accepted') then
      return jsonb_build_object(
        'success', true,
        'already_exists', true,
        'race_id', p_race_id,
        'club_id', v_club_id,
        'entry_id', v_existing.id,
        'entry_status', v_existing.status,
        'message', case
          when v_existing.status = 'accepted' then 'Already accepted.'
          else 'Application already submitted.'
        end
      );
    end if;

    if v_existing.status in ('withdrawn', 'cancelled') then
      update public.race_team_entries
      set
        status = 'applied',
        commitment_score_snapshot = v_commitment_score,
        acceptance_score = null,
        review_round = null,
        decision_reason = 'Application resubmitted by user',
        reviewed_at = null,
        final_decision_at = null,
        withdrawn_at = null,
        missed_startlist_at = null,
        updated_at = now()
      where id = v_existing.id
      returning id into v_entry_id;

      return jsonb_build_object(
        'success', true,
        'race_id', p_race_id,
        'club_id', v_club_id,
        'entry_id', v_entry_id,
        'entry_status', 'applied',
        'message', 'Application submitted.'
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'error', 'cannot_apply_from_current_status',
      'entry_status', v_existing.status
    );
  end if;

  insert into public.race_team_entries (
    id,
    race_id,
    club_id,
    status,
    commitment_score_snapshot,
    acceptance_score,
    review_round,
    decision_reason,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    p_race_id,
    v_club_id,
    'applied',
    v_commitment_score,
    null,
    null,
    'Application submitted by user',
    now(),
    now()
  )
  returning id into v_entry_id;

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'club_id', v_club_id,
    'entry_id', v_entry_id,
    'entry_status', 'applied',
    'message', 'Application submitted.'
  );
end;
$function$;

