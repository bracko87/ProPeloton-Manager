create or replace function public.get_nations_competition_overview_v1(
  p_season_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_current_season integer;
  v_season integer;
  v_today date;
  v_edition public.nations_competition_editions%rowtype;
  v_active_count integer := 0;
  v_my_association_id uuid;
  v_my_membership_id uuid;
  v_is_coach boolean := false;
  v_my_host_application jsonb := null;
  v_plan jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number, gs.month_number, gs.day_number)
  into v_current_season, v_today
  from public.game_state gs
  where gs.id = true;

  v_season := coalesce(p_season_number, v_current_season);

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status = 'active'
    and private.national_association_active_member_count_v1(a.id) >= (
      select minimum_active_members
      from public.national_association_config
      where id = true
    );

  select m.association_id, m.id
  into v_my_association_id, v_my_membership_id
  from public.national_association_memberships m
  join public.national_associations a on a.id = m.association_id
  where m.user_id = v_uid
    and m.status = 'active'
    and a.status = 'active'
    and private.national_association_member_is_eligible_v1(m.association_id, v_uid)
  order by m.created_at desc
  limit 1;

  select exists(
    select 1
    from public.national_coach_terms t
    where t.association_id = v_my_association_id
      and t.membership_id = v_my_membership_id
      and t.user_id = v_uid
      and t.status = 'active'
      and t.season_number = v_current_season
  )
  into v_is_coach;

  select *
  into v_edition
  from public.nations_competition_editions e
  where e.season_number = v_season
  limit 1;

  v_plan := public.nations_qualification_plan_v1(
    case
      when v_edition.id is not null then v_edition.active_association_count
      when v_season = v_current_season then v_active_count
      else 0
    end
  );

  if v_edition.id is not null
     and v_my_association_id is not null then
    select jsonb_build_object(
      'id', h.id,
      'status', h.status,
      'statement', h.statement,
      'submitted_on', h.submitted_on_game_date
    )
    into v_my_host_application
    from public.nations_host_applications h
    where h.edition_id = v_edition.id
      and h.association_id = v_my_association_id
    limit 1;
  end if;

  return jsonb_build_object(
    'season_number', v_season,
    'current_season_number', v_current_season,
    'current_game_date', v_today,
    'active_association_count', v_active_count,
    'qualification_plan', v_plan,
    'viewer', jsonb_build_object(
      'association_id', v_my_association_id,
      'is_member', v_my_association_id is not null,
      'is_national_coach', v_is_coach,
      'can_apply_to_host',
        v_is_coach
        and v_edition.id is not null
        and v_edition.season_number = v_current_season
        and v_edition.status in ('planned','qualification'),
      'host_application', v_my_host_application
    ),
    'edition',
      case
        when v_edition.id is null then null
        else jsonb_build_object(
          'id', v_edition.id,
          'competition_name', v_edition.competition_name,
          'status', v_edition.status,
          'active_association_count', v_edition.active_association_count,
          'finalist_target', v_edition.finalist_target,
          'points_curve_version', v_edition.points_curve_version,
          'host_association_id', v_edition.host_association_id,
          'host_country_code', v_edition.host_country_code,
          'champion_association_id', v_edition.champion_association_id,
          'champion_country_code', v_edition.champion_country_code,
          'created_on_game_date', v_edition.created_on_game_date,
          'completed_on_game_date', v_edition.completed_on_game_date
        )
      end,
    'rounds',
      case
        when v_edition.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', r.id,
              'round_index', r.round_index,
              'round_type', r.round_type,
              'round_label', r.round_label,
              'entrants_target', r.entrants_target,
              'advance_target', r.advance_target,
              'group_count', r.group_count,
              'group_size_min', r.group_size_min,
              'group_size_max', r.group_size_max,
              'status', r.status,
              'starts_on_game_date', r.starts_on_game_date,
              'ends_on_game_date', r.ends_on_game_date,
              'groups', coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'id', g.id,
                    'group_number', g.group_number,
                    'group_label', g.group_label,
                    'planned_entrant_count', g.planned_entrant_count,
                    'planned_advance_count', g.planned_advance_count,
                    'status', g.status,
                    'entries', coalesce((
                      select jsonb_agg(
                        jsonb_build_object(
                          'group_entry_id', nge.id,
                          'competition_entry_id', ce.id,
                          'association_id', ce.association_id,
                          'association_name', a.name,
                          'country_code', ce.country_code,
                          'seed_position', nge.seed_position,
                          'final_group_rank', nge.final_group_rank,
                          'total_points', nge.total_points,
                          'ttt_points', nge.ttt_points,
                          'flat_points', nge.flat_points,
                          'mountain_points', nge.mountain_points,
                          'race_wins', nge.race_wins,
                          'podium_finishes', nge.podium_finishes,
                          'ttt_rank', nge.ttt_rank,
                          'best_day3_rider_rank', nge.best_day3_rider_rank,
                          'status', nge.status
                        )
                        order by
                          nge.final_group_rank nulls last,
                          nge.total_points desc,
                          ce.country_code
                      )
                      from public.nations_group_entries nge
                      join public.nations_competition_entries ce
                        on ce.id = nge.competition_entry_id
                      join public.national_associations a
                        on a.id = ce.association_id
                      where nge.group_id = g.id
                    ), '[]'::jsonb)
                  )
                  order by g.group_number
                )
                from public.nations_competition_groups g
                where g.round_id = r.id
              ), '[]'::jsonb)
            )
            order by r.round_index
          )
          from public.nations_competition_rounds r
          where r.edition_id = v_edition.id
        ), '[]'::jsonb)
      end,
    'entries',
      case
        when v_edition.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'entry_id', e.id,
              'association_id', e.association_id,
              'association_name', a.name,
              'country_code', e.country_code,
              'seed_score', e.seed_score,
              'status', e.status
            )
            order by e.country_code
          )
          from public.nations_competition_entries e
          join public.national_associations a on a.id = e.association_id
          where e.edition_id = v_edition.id
        ), '[]'::jsonb)
      end,
    'points_curve', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'race_type', p.race_type,
          'finishing_position', p.finishing_position,
          'points', p.points,
          'version', p.version
        )
        order by p.race_type, p.finishing_position
      )
      from public.nations_points_curve p
      where p.is_active = true
        and p.version = coalesce(v_edition.points_curve_version, 1)
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'season_number', h.season_number,
          'association_id', h.association_id,
          'association_name', a.name,
          'country_code', h.country_code,
          'final_rank', h.final_rank,
          'total_points', h.total_points,
          'was_host', h.was_host
        )
        order by h.season_number desc, h.final_rank asc
      )
      from public.nations_competition_history h
      left join public.national_associations a on a.id = h.association_id
      where h.season_number <= v_season
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_nations_competition_overview_v1(integer) from public;
grant execute on function public.get_nations_competition_overview_v1(integer) to authenticated;
