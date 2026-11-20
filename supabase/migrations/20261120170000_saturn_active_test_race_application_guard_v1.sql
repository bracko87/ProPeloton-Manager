-- Saturn 14-day authenticated test-account writer authorization.
-- This helper is for reviewed SERVER RPCs only; it is not a general RLS grant.
-- Canonical Auth user, active term and exact official club ownership required.
create or replace function public.saturn_test_account_can_mutate_v1(p_club_id uuid)
returns boolean language sql stable security definer set search_path to ''
as $saturn$
  select auth.uid() is not null and p_club_id is not null and exists (
    select 1
      from auth.users u
      join public.saturn_test_accounts_v1 t on t.user_id=u.id
      join public.clubs c on c.id=t.club_id
     where u.id=auth.uid()
       and u.is_anonymous is true
       and t.club_id=p_club_id
       and c.owner_user_id=u.id
       and c.is_ai is false
       and c.is_active is true
       and c.club_type='main'
       and t.started_at <= now()
       and t.expires_at > now()
       and t.converted_at is null
  );
$saturn$;
revoke all on function public.saturn_test_account_can_mutate_v1(uuid)
  from public, anon, authenticated;

-- Retain original permanent-user behavior. Only the anonymous guest guard
-- is replaced by a canonical active-test-team/owner/expiry check.
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

  -- Saturn: a temporary manager can apply to official races only while the
  -- test account is active AND the supplied club belongs to this same UUID.
  -- Permanent registered players continue through the existing procedure.
  if exists(select 1 from auth.users au where au.id=v_user_id and au.is_anonymous=true) then
    if not public.saturn_test_account_can_mutate_v1(
      coalesce(p_club_id,public.get_my_primary_club_id())
    ) then
      return jsonb_build_object('success',false,'error','test_account_ineligible_or_expired');
    end if;
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
$function$


-- Also protect cancel/withdraw after trial expiry or cross-club access.
CREATE OR REPLACE FUNCTION public.cancel_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_club_id uuid;
  v_race record;
  v_existing record;
  v_deleted_riders integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'auth_required'
    );
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

  -- A temporary test manager may withdraw only an application for the
  -- precise club attached to its own ACTIVE 14-day lifecycle. This rejects
  -- expired test users and cross-club references. Permanent-user behavior
  -- remains untouched for compatibility with existing game workflows.
  if exists(
    select 1 from auth.users au
    where au.id=v_user_id and au.is_anonymous is true
  ) and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    return jsonb_build_object(
      'success',false,'error','test_account_ineligible_or_expired'
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

  if coalesce(v_race.status::text, 'scheduled') in ('active', 'completed', 'archived', 'cancelled') then
    return jsonb_build_object(
      'success', false,
      'error', 'race_locked',
      'race_status', v_race.status
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_race_id::text),
    hashtext(v_club_id::text)
  );

  select *
  into v_existing
  from public.race_team_entries
  where race_id = p_race_id
    and club_id = v_club_id
  order by created_at desc nulls last, id desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'race_id', p_race_id,
      'club_id', v_club_id,
      'entry_status', null,
      'message', 'No application found.'
    );
  end if;

  if v_existing.status not in ('applied', 'accepted') then
    return jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'race_id', p_race_id,
      'club_id', v_club_id,
      'entry_id', v_existing.id,
      'entry_status', v_existing.status,
      'message', 'Application is already not active.'
    );
  end if;

  update public.race_team_entries
  set
    status = 'withdrawn',
    decision_reason = 'Application cancelled by user',
    withdrawn_at = now(),
    updated_at = now()
  where id = v_existing.id;

  if to_regclass('public.race_participant_riders') is not null then
    delete from public.race_participant_riders
    where race_id = p_race_id
      and team_id = v_club_id;

    get diagnostics v_deleted_riders = row_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'race_id', p_race_id,
    'club_id', v_club_id,
    'entry_id', v_existing.id,
    'entry_status', 'withdrawn',
    'deleted_riders', v_deleted_riders,
    'message', 'Application cancelled.'
  );
end;
$function$

