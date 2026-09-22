-- Developing Team / U23 is an explicit Premium-only gameplay feature.
-- Data is preserved when Premium lapses; access and U23 automation are paused.

update public.developing_team_service_config
set
  activation_coin_cost = 100,
  renewal_coin_cost = 100,
  updated_at = now()
where config_key = 'default'
  and (
    activation_coin_cost is distinct from 100
    or renewal_coin_cost is distinct from 100
  );

-- Existing Developing Teams owned by non-Premium users remain stored, but their
-- seasonal access is disabled immediately and cannot auto-renew.
update public.developing_team_season_access access_row
set
  access_status = 'expired',
  auto_renew = false,
  updated_at = now()
from public.clubs main_club
where main_club.id = access_row.main_club_id
  and main_club.owner_user_id is not null
  and not public.user_has_premium_access_v1(main_club.owner_user_id)
  and (
    access_row.access_status is distinct from 'expired'
    or access_row.auto_renew is distinct from false
  );

-- Stop already-enabled U23 coach automation when Premium is not active.
update public.club_regular_training_automation automation
set
  is_enabled = false,
  metadata = coalesce(automation.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'premium_access_required', true,
      'disabled_reason', 'premium_required_for_developing_team',
      'disabled_at', now()
    ),
  updated_at = now()
from public.clubs developing_club
join public.clubs main_club
  on main_club.id = developing_club.parent_club_id
where automation.club_id = developing_club.id
  and developing_club.club_type = 'developing'
  and main_club.owner_user_id is not null
  and not public.user_has_premium_access_v1(main_club.owner_user_id)
  and automation.is_enabled = true;

update public.rider_regular_training_daily_plans plan
set
  status = 'superseded',
  decision_reason_json = coalesce(plan.decision_reason_json, '{}'::jsonb)
    || jsonb_build_object(
      'superseded_reason', 'premium_required_for_developing_team',
      'superseded_at', now()
    ),
  updated_at = now()
from public.clubs developing_club
join public.clubs main_club
  on main_club.id = developing_club.parent_club_id
where plan.club_id = developing_club.id
  and developing_club.club_type = 'developing'
  and main_club.owner_user_id is not null
  and not public.user_has_premium_access_v1(main_club.owner_user_id)
  and plan.source_type = 'u23_head_coach'
  and plan.status = 'planned'
  and plan.plan_date >= public.get_current_game_date_date();

-- Harden the generator itself so a Premium lapse cannot leave U23 automation
-- operational until the next seasonal renewal job.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'generate_coach_regular_training_plan_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'generate_coach_regular_training_plan_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_new := replace(
    v_def,
    $old$  v_expected_role :=
    case
      when v_club_type = 'developing'
        then 'u23_head_coach'
      else 'head_coach'
    end;

  if v_setting.manager_role <> v_expected_role then$old$,
    $new$  v_expected_role :=
    case
      when v_club_type = 'developing'
        then 'u23_head_coach'
      else 'head_coach'
    end;

  if v_expected_role = 'u23_head_coach'
     and not public.user_has_premium_access_v1(
       (
         select owner_club.owner_user_id
         from public.clubs owner_club
         where owner_club.id = coalesce(v_parent_club_id, p_club_id)
       )
     ) then
    update public.club_regular_training_automation
    set
      is_enabled = false,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object(
          'premium_access_required', true,
          'disabled_reason', 'premium_required_for_developing_team',
          'disabled_at', now()
        ),
      updated_at = now()
    where club_id = p_club_id;

    update public.rider_regular_training_daily_plans
    set
      status = 'superseded',
      decision_reason_json = coalesce(decision_reason_json, '{}'::jsonb)
        || jsonb_build_object(
          'superseded_reason', 'premium_required_for_developing_team',
          'superseded_at', now()
        ),
      updated_at = now()
    where club_id = p_club_id
      and plan_date >= v_anchor_date
      and source_type = 'u23_head_coach'
      and status = 'planned';

    return jsonb_build_object(
      'ok', false,
      'generated', false,
      'reason', 'premium_required',
      'club_id', p_club_id,
      'expected_role', v_expected_role
    );
  end if;

  if v_setting.manager_role <> v_expected_role then$new$
  );

  if v_new = v_def then
    raise exception 'generate_coach_regular_training_plan_v1 Premium patch point not found';
  end if;

  execute v_new;
end $$;
