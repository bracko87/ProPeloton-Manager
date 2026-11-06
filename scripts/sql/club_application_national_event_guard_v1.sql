-- Race club applications may only target ordinary club/team events.
-- NC/NCQ are individual championships and qualifiers. WNQ/WRC are
-- representative competitions. Never modify existing historical entries.
create or replace function public.club_race_application_allowed_v1(p_race_id uuid)
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $club_guard$
  select coalesce((
    select
      upper(trim(coalesce(r.category::text,''))) not in
        ('NC','NCQ','WNQ','WRC','NATIONAL ASSOCIATION')
      and not (
        lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes')
        or lower(coalesce(r.metadata->>'national_championship','false')) in ('true','1','yes')
        or lower(coalesce(r.metadata->>'world_road_championship','false')) in ('true','1','yes')
        or lower(coalesce(r.metadata->>'nations_competition','false')) in ('true','1','yes')
        or nullif(trim(coalesce(r.metadata->>'world_road_championship_edition_id','')), '') is not null
      )
    from public.races r where r.id = p_race_id
  ), false);
$club_guard$;
revoke all on function public.club_race_application_allowed_v1(uuid) from public;

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

CREATE OR REPLACE FUNCTION public.submit_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid := p_club_id;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  if v_club_id is null then
    select public.get_my_primary_club_id() into v_club_id;
  end if;

  if v_club_id is null then
    return jsonb_build_object('success',false,'error','club_not_found');
  end if;

  if exists (select 1 from public.races where id=p_race_id)
     and not public.club_race_application_allowed_v1(p_race_id) then
    return jsonb_build_object('success',false,'error','club_applications_not_allowed','can_apply',false,'race_id',p_race_id,'message','Club applications are unavailable for national qualifications, national championships and national-team competitions.');
  end if;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT')
     and not (
       v_club_tier='worldteam'
       or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
     ) then
    return jsonb_build_object(
      'success',false,
      'error','uwt_team_tier_not_eligible',
      'race_id',p_race_id,
      'club_id',v_club_id,
      'club_tier',v_club_tier,
      'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.'
    );
  end if;

  return public.submit_race_application_pre_uwt_policy_v1(p_race_id,v_club_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_race_application_pre_uwt_policy_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid;
  v_race record;
  v_rule record;
  v_current record;
  v_today_ordinal integer;
  v_open_ordinal integer;
  v_close_ordinal integer;
  v_score integer;
  v_existing record;
  v_entry_id uuid;
begin
  v_club_id := p_club_id;
  if v_club_id is null then
    select public.get_my_primary_club_id() into v_club_id;
  end if;
  if v_club_id is null then
    return jsonb_build_object('success',false,'error','club_not_found');
  end if;

  select * into v_race from public.races where id=p_race_id;
  if not found then return jsonb_build_object('success',false,'error','race_not_found'); end if;

  if not public.club_race_application_allowed_v1(p_race_id) then
    return jsonb_build_object('success',false,'error','club_applications_not_allowed','can_apply',false,'race_id',p_race_id,'message','Club applications are unavailable for national qualifications, national championships and national-team competitions.');
  end if;

  perform * from public.recalculate_race_entry_deadlines_v1(p_race_id);
  select * into v_rule from public.race_entry_rules where race_id=p_race_id limit 1;
  if not found then return jsonb_build_object('success',false,'error','race_entry_rules_not_found'); end if;

  select * into v_current from public.get_current_game_date_parts() limit 1;
  v_today_ordinal := public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);
  v_open_ordinal := public.game_date_ordinal_v1(v_rule.applications_open_season_number,v_rule.applications_open_month_number,v_rule.applications_open_day_number);
  v_close_ordinal := public.game_date_ordinal_v1(v_rule.applications_close_season_number,v_rule.applications_close_month_number,v_rule.applications_close_day_number);

  if v_today_ordinal < v_open_ordinal then
    return jsonb_build_object(
      'success',false,'error','applications_not_open_yet',
      'applications_open',public.game_date_display_v1(
        v_rule.applications_open_season_number,v_rule.applications_open_month_number,v_rule.applications_open_day_number
      )
    );
  end if;

  if v_today_ordinal >= v_close_ordinal then
    return jsonb_build_object(
      'success',false,'error','applications_closed',
      'applications_close',public.game_date_display_v1(
        v_rule.applications_close_season_number,v_rule.applications_close_month_number,v_rule.applications_close_day_number
      )
    );
  end if;

  select * into v_existing
  from public.race_team_entries
  where race_id=p_race_id and club_id=v_club_id
  limit 1;
  if found then
    return jsonb_build_object('success',false,'error','application_already_exists','status',v_existing.status);
  end if;

  v_score := public.get_or_create_club_race_commitment_score_v1(v_club_id);

  insert into public.race_team_entries(
    race_id,club_id,status,commitment_score_snapshot,decision_reason,created_at,updated_at
  ) values (
    p_race_id,v_club_id,'under_review',v_score,
    case
      when lower(coalesce(v_race.metadata->>'application_preselection_completed','false')) in ('true','1','yes')
        then 'Application received after the 30-day preliminary review. This team is in the late waitlist pool and cannot displace protected provisional teams.'
      else 'Application received. Final decision will be made by the race application review process.'
    end,
    now(),now()
  ) returning id into v_entry_id;

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'club_id',v_club_id,
    'race_team_entry_id',v_entry_id,
    'status','under_review',
    'race_commitment_score',v_score,
    'preselection_already_completed',lower(coalesce(v_race.metadata->>'application_preselection_completed','false')) in ('true','1','yes'),
    'message','Race application submitted.'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.quote_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_club_id uuid;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  if exists (select 1 from public.races where id=p_race_id)
     and not public.club_race_application_allowed_v1(p_race_id) then
    return jsonb_build_object('success',false,'error','club_applications_not_allowed','can_apply',false,'race_id',p_race_id,'message','Club applications are unavailable for national qualifications, national championships and national-team competitions.');
  end if;

  v_payload := public.quote_race_application_pre_uwt_policy_v1(p_race_id,p_club_id);

  if coalesce((v_payload->>'success')::boolean,false) is not true then
    return v_payload;
  end if;

  begin
    v_club_id := (v_payload->>'club_id')::uuid;
  exception when others then
    v_club_id := p_club_id;
  end;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    v_payload := v_payload || jsonb_build_object(
      'uwt_field_policy','80% WorldTeams / 20% regional ProTeams',
      'uwt_continental_amateur_allowed',false,
      'uwt_proteam_geography','host country or same region only'
    );

    if not (
      v_club_tier='worldteam'
      or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
    ) then
      v_payload := v_payload || jsonb_build_object(
        'can_apply',false,
        'estimated_acceptance_chance_pct',0,
        'chance_label','Not eligible',
        'chance_summary','This team tier is not eligible for UWT races.',
        'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.',
        'eligibility_error','uwt_team_tier_not_eligible'
      );
    end if;
  end if;

  return v_payload;
end;
$function$;

