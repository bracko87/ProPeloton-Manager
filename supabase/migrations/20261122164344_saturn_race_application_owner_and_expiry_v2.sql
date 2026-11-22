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

  -- Authenticated callers may submit only for an owned live club.
  if auth.uid() is null then
    return jsonb_build_object('success',false,'error','auth_required');
  end if;
  if public.saturn_test_account_requires_guard_v1()
      and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    return jsonb_build_object('success',false,'error','test_account_ineligible_or_expired');
  end if;
  if not exists(select 1 from public.clubs c where c.id=v_club_id
      and c.owner_user_id=auth.uid() and c.deleted_at is null and c.is_active is true
      and c.is_ai is false) then
    return jsonb_build_object('success',false,'error','club_access_denied');
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
$function$
;
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

  -- Authenticated callers may submit only for an owned live club.
  if auth.uid() is null then
    return jsonb_build_object('success',false,'error','auth_required');
  end if;
  if public.saturn_test_account_requires_guard_v1()
      and not public.saturn_test_account_can_mutate_v1(v_club_id) then
    return jsonb_build_object('success',false,'error','test_account_ineligible_or_expired');
  end if;
  if not exists(select 1 from public.clubs c where c.id=v_club_id
      and c.owner_user_id=auth.uid() and c.deleted_at is null and c.is_active is true
      and c.is_ai is false) then
    return jsonb_build_object('success',false,'error','club_access_denied');
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
$function$
;
-- The pre-UWT helper must not bypass the public wrapper's eligibility checks.
revoke all on function public.submit_race_application_pre_uwt_policy_v1(uuid,uuid) from public,anon,authenticated;
revoke all on function public.submit_race_application_v1(uuid,uuid) from public,anon;
grant execute on function public.submit_race_application_v1(uuid,uuid) to authenticated;
