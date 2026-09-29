-- National Coach dashboard v1
-- The elected/caretaker National Coach may see all riders of the Association
-- nationality, but never exact hidden rider skills or potential.
-- Overall is returned only as a stable season-specific range.

create or replace function public.get_national_coach_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_term public.national_coach_terms%rowtype;
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_game_date date;
  v_country_name text;
  v_edition public.national_championship_editions%rowtype;
  v_has_snapshot boolean:=false;
  v_rank_date date;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  select t.*
  into v_term
  from public.national_coach_terms t
  join public.national_associations a
    on a.id=t.association_id
   and a.status='active'
  join public.national_association_memberships m
    on m.id=t.membership_id
   and m.status='active'
  where t.user_id=v_uid
    and t.status='active'
    and t.season_number=v_season
    and private.national_association_member_is_eligible_v1(t.association_id,v_uid)
  order by
    case t.term_kind when 'elected' then 0 when 'replacement' then 1 else 2 end,
    t.created_at desc
  limit 1;

  if v_term.id is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','not_active_national_coach',
      'season_number',v_season,
      'current_game_date',v_game_date
    );
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_term.association_id;

  select coalesce(c.name,v_assoc.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=v_assoc.country_code
  limit 1;

  v_country_name:=coalesce(v_country_name,v_assoc.country_code);

  select * into v_edition
  from public.national_championship_editions e
  where e.season_number=v_season
    and e.country_code=v_assoc.country_code
    and e.discipline='road'
  limit 1;

  if v_edition.id is not null then
    select exists(
      select 1
      from public.national_championship_ranking_snapshots s
      where s.edition_id=v_edition.id
    )
    into v_has_snapshot;
  end if;

  v_rank_date:=
    case
      when v_edition.id is null then v_game_date
      else least(v_game_date,v_edition.ranking_snapshot_date)
    end;

  return jsonb_build_object(
    'allowed',true,
    'season_number',v_season,
    'current_game_date',v_game_date,
    'association',jsonb_build_object(
      'id',v_assoc.id,
      'name',v_assoc.name,
      'country_code',v_assoc.country_code,
      'country_name',v_country_name
    ),
    'coach',jsonb_build_object(
      'term_id',v_term.id,
      'term_kind',v_term.term_kind,
      'club_id',v_term.club_id,
      'club_name',(select name from public.clubs where id=v_term.club_id),
      'starts_on',v_term.term_start_game_date,
      'ends_on',v_term.term_end_game_date
    ),
    'national_championship',case
      when v_edition.id is null then null
      else jsonb_build_object(
        'edition_id',v_edition.id,
        'status',v_edition.status,
        'qualification_date',v_edition.qualification_date,
        'final_date',v_edition.final_date,
        'champion_rider_id',v_edition.champion_rider_id,
        'champion_name',v_edition.champion_name_snapshot,
        'ranking_frozen',v_has_snapshot
      )
    end,
    'standard_package',public.get_national_team_standard_package_v1(),
    'riders',coalesce((
      with ranking as (
        select
          s.rider_id,
          s.national_rank,
          s.raw_points,
          s.weighted_points,
          s.latest_result_date
        from public.national_championship_ranking_snapshots s
        where v_has_snapshot
          and s.edition_id=v_edition.id

        union all

        select
          p.rider_id,
          p.national_rank,
          p.raw_points,
          p.weighted_points,
          p.latest_result_date
        from public.preview_national_ranking_v1(
          v_assoc.country_code,
          v_rank_date
        ) p
        where not v_has_snapshot
      )
      select jsonb_agg(
        jsonb_build_object(
          'rider_id',r.id,
          'rider_name',r.display_name,
          'image_url',r.image_url,
          'country_code',r.country_code,
          'role',r.role::text,
          'birth_date',r.birth_date,
          'age_years',
            extract(year from age(v_game_date,r.birth_date))::integer,
          'club_id',r.club_id,
          'club_name',r.club_name,
          'club_is_ai',r.club_is_ai,
          'availability_status',r.availability_status,
          'fatigue',r.fatigue,
          'race_sharpness',rc.race_sharpness,
          'last_raced_on',rc.last_raced_on,
          'race_days_last_14',rc.race_days_last_14,
          'season_points',r.season_points_overall,
          'national_rank',rk.national_rank,
          'national_raw_points',rk.raw_points,
          'national_weighted_points',rk.weighted_points,
          'latest_ranked_result_date',rk.latest_result_date,
          'overall_range',jsonb_build_object(
            'min',lower(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_season
            )),
            'max',upper(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_season
            ))-1
          ),
          'national_championship',jsonb_build_object(
            'is_current_champion',
              v_edition.champion_rider_id is not null
              and v_edition.champion_rider_id=r.id,
            'final_rank',ncr.final_rank,
            'qualification_rank',ncr.qualification_rank,
            'final_status',ncr.final_status,
            'qualification_status',ncr.qualification_status
          )
        )
        order by
          rk.national_rank nulls last,
          r.season_points_overall desc nulls last,
          r.display_name
      )
      from public.rider_statistics_page_view r
      left join ranking rk on rk.rider_id=r.id
      left join public.rider_race_condition rc on rc.rider_id=r.id
      left join lateral (
        select
          min(h.rank) filter (where h.event_type='final') as final_rank,
          min(h.rank) filter (where h.event_type='qualification') as qualification_rank,
          max(h.status) filter (where h.event_type='final') as final_status,
          max(h.status) filter (where h.event_type='qualification') as qualification_status
        from public.national_championship_result_history h
        where v_edition.id is not null
          and h.edition_id=v_edition.id
          and h.rider_id=r.id
      ) ncr on true
      where upper(r.country_code)=v_assoc.country_code
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_national_coach_dashboard_v1()
from public,anon,authenticated;
grant execute on function public.get_national_coach_dashboard_v1()
to authenticated,service_role;
