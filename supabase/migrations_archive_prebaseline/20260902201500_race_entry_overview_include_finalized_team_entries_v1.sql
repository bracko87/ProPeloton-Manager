create or replace function public.get_race_entry_overview_v1(p_race_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with rules as (
    select
      rer.*,
      rcr.display_name,
      rcr.race_format,
      rcr.prize_fund_min_cash,
      rcr.prize_fund_max_cash
    from public.race_entry_rules rer
    join public.race_category_rules rcr
      on rcr.race_class_code = rer.race_class_code
    where rer.race_id = p_race_id
  ),
  participants as (
    select count(*)::integer as team_count
    from (
      select rpt.team_id
      from public.race_participant_teams rpt
      where rpt.race_id = p_race_id

      union

      select coalesce(rte.participating_club_id, rte.club_id) as team_id
      from public.race_team_entries rte
      where rte.race_id = p_race_id
        and rte.status in ('accepted', 'confirmed')
    ) participant_union
    where participant_union.team_id is not null
  ),
  accepted_applications as (
    select count(distinct rta.team_id)::integer as team_count
    from public.race_team_applications rta
    where rta.race_id = p_race_id
      and rta.application_status = 'accepted'
  ),
  submitted_applications as (
    select count(distinct rta.team_id)::integer as team_count
    from public.race_team_applications rta
    where rta.race_id = p_race_id
      and rta.application_status in ('submitted', 'accepted', 'waitlisted')
  ),
  accepted_union as (
    select rpt.team_id
    from public.race_participant_teams rpt
    where rpt.race_id = p_race_id

    union

    select rta.team_id
    from public.race_team_applications rta
    where rta.race_id = p_race_id
      and rta.application_status = 'accepted'

    union

    select coalesce(rte.participating_club_id, rte.club_id) as team_id
    from public.race_team_entries rte
    where rte.race_id = p_race_id
      and rte.status in ('accepted', 'confirmed')
  ),
  accepted_count as (
    select count(*)::integer as team_count
    from accepted_union
    where team_id is not null
  )
  select coalesce(
    (
      select jsonb_build_object(
        'race_id', rules.race_id,
        'race_class_code', rules.race_class_code,
        'display_name', rules.display_name,
        'race_format', rules.race_format,
        'target_teams', rules.target_teams,
        'min_teams', rules.min_teams,
        'max_teams', rules.max_teams,
        'min_riders_per_team', rules.min_riders_per_team,
        'max_riders_per_team', rules.max_riders_per_team,
        'applications_status', rules.applications_status,
        'application_window_policy', rules.application_window_policy,
        'race_season_number', rules.race_season_number,
        'race_start_month_number', rules.race_start_month_number,
        'race_start_day_number', rules.race_start_day_number,
        'race_start_display', public.format_season_mmdd_v1(
          rules.race_season_number,
          rules.race_start_month_number,
          rules.race_start_day_number
        ),
        'applications_open_season_number', rules.applications_open_season_number,
        'applications_open_month_number', rules.applications_open_month_number,
        'applications_open_day_number', rules.applications_open_day_number,
        'applications_open_display', public.format_season_mmdd_v1(
          rules.applications_open_season_number,
          rules.applications_open_month_number,
          rules.applications_open_day_number
        ),
        'applications_close_season_number', rules.applications_close_season_number,
        'applications_close_month_number', rules.applications_close_month_number,
        'applications_close_day_number', rules.applications_close_day_number,
        'applications_close_display', public.format_season_mmdd_v1(
          rules.applications_close_season_number,
          rules.applications_close_month_number,
          rules.applications_close_day_number
        ),
        'auto_close_when_full', rules.auto_close_when_full,
        'allow_waitlist', rules.allow_waitlist,
        'accepted_teams', coalesce(ac.team_count, 0),
        'participant_teams', coalesce(p.team_count, 0),
        'accepted_application_teams', coalesce(aa.team_count, 0),
        'submitted_application_teams', coalesce(sa.team_count, 0),
        'available_target_slots', greatest(0, rules.target_teams - coalesce(ac.team_count, 0)),
        'available_max_slots', greatest(0, rules.max_teams - coalesce(ac.team_count, 0)),
        'prize_fund_cash', rules.prize_fund_cash,
        'prize_fund_min_cash', rules.prize_fund_min_cash,
        'prize_fund_max_cash', rules.prize_fund_max_cash,
        'prize_fund_source', rules.prize_fund_source
      )
      from rules
      cross join accepted_count ac
      cross join participants p
      cross join accepted_applications aa
      cross join submitted_applications sa
    ),
    '{}'::jsonb
  );
$function$;
