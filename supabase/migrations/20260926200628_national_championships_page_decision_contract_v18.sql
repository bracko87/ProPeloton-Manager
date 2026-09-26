CREATE OR REPLACE FUNCTION public.get_national_ranking_page_v1(p_country_code text DEFAULT NULL::text, p_season_number integer DEFAULT NULL::integer, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_season integer;
  v_game_date date;
  v_country text;
  e public.national_championship_editions%rowtype;
  v_has_snapshot boolean := false;
begin
  v_user_id:=auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_season:=coalesce(p_season_number,v_season);

  v_country:=upper(nullif(trim(p_country_code),''));

  if v_country is null then
    select upper(c.country_code)
    into v_country
    from public.clubs c
    where c.owner_user_id=v_user_id
      and c.parent_club_id is null
    order by c.created_at
    limit 1;
  end if;

  if v_country is null then
    select country_code into v_country
    from public.national_championship_editions
    where season_number=v_season
    order by country_code
    limit 1;
  end if;

  select * into e
  from public.national_championship_editions
  where season_number=v_season
    and country_code=v_country
    and discipline='road'
  limit 1;

  if e.id is not null then
    select exists(
      select 1
      from public.national_championship_ranking_snapshots s
      where s.edition_id=e.id
    ) into v_has_snapshot;
  end if;

  return jsonb_build_object(
    'season_number',v_season,
    'current_game_date',v_game_date,
    'country_code',v_country,
    'countries',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',x.country_code,
          'name',coalesce(c.name,x.country_code),
          'status',x.status,
          'final_date',x.final_date
        )
        order by coalesce(c.name,x.country_code)
      )
      from public.national_championship_editions x
      left join public.countries c on c.code=x.country_code
      where x.season_number=v_season
        and x.discipline='road'
    ),'[]'::jsonb),
    'edition',case when e.id is null then null else to_jsonb(e) end,
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
    'preparation_mode',jsonb_build_object(
      'automatic_entry',true,
      'staff_locked',true,
      'assets_locked',true,
      'club_supplies_locked',true,
      'individual_only',true,
      'team_commands_enabled',false,
      'rider_equipment_editable',true,
      'individual_tactics_editable',true
    ),
    'ranking_is_frozen',v_has_snapshot,
    'ranking',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select
          s.national_rank,
          s.rider_id,
          s.club_id,
          s.rider_name_snapshot as rider_name,
          s.country_code_snapshot as country_code,
          s.raw_points,
          s.weighted_points,
          s.best_weighted_result,
          s.latest_result_date,
          s.overall_snapshot as overall
        from public.national_championship_ranking_snapshots s
        where v_has_snapshot
          and s.edition_id=e.id
        order by s.national_rank
        limit greatest(1,least(coalesce(p_limit,200),500))
      ) r
    ),case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select *
        from public.preview_national_ranking_v1(
          v_country,
          least(v_game_date,e.ranking_snapshot_date)
        )
        order by national_rank
        limit greatest(1,least(coalesce(p_limit,200),500))
      ) r
    ),'[]'::jsonb) end),
    'heats',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',h.id,
          'heat_number',h.heat_number,
          'qualification_date',h.qualification_date,
          'qualifying_places',h.qualifying_places,
          'assigned_count',h.assigned_count,
          'race_id',h.race_id,
          'status',h.status
        )
        order by h.heat_number
      )
      from public.national_championship_heats h
      where h.edition_id=e.id
    ),'[]'::jsonb) end,
    'my_entries',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'rider_id',en.rider_id,
          'rider_name',en.rider_name_snapshot,
          'national_rank',en.national_rank,
          'entry_path',en.entry_path,
          'entry_status',en.entry_status,
          'participation_decision',en.participation_decision,
          'participation_decision_at',en.participation_decision_at,
          'refusal_morale_delta',en.refusal_morale_delta,
          'participation_decision_deadline',e.participation_decision_deadline,
          'duty_window_start_date',e.duty_window_start_date,
          'duty_window_end_date',e.duty_window_end_date,
          'can_decide_participation',
            en.participation_decision='pending'
            and e.participation_decision_deadline is not null
            and v_game_date<=e.participation_decision_deadline,
          'heat_id',en.heat_id,
          'heat_number',en.heat_number,
          'qualification_race_id',h.race_id,
          'final_race_id',e.final_race_id,
          'qualification_plan',to_jsonb(qp),
          'final_plan',to_jsonb(fp),
          'club_id',en.club_id_snapshot,
          'club_name',rider_club.name
        )
        order by en.national_rank
      )
      from public.national_championship_entries en
      join public.clubs rider_club on rider_club.id=en.club_id_snapshot
      join public.clubs owner_club
        on owner_club.id=case
          when rider_club.club_type='developing'
               and rider_club.parent_club_id is not null
            then rider_club.parent_club_id
          else rider_club.id
        end
      left join public.national_championship_heats h on h.id=en.heat_id
      left join public.national_championship_rider_plans qp
        on qp.edition_id=en.edition_id
       and qp.rider_id=en.rider_id
       and qp.event_type='qualification'
      left join public.national_championship_rider_plans fp
        on fp.edition_id=en.edition_id
       and fp.rider_id=en.rider_id
       and fp.event_type='final'
      where en.edition_id=e.id
        and owner_club.owner_user_id=v_user_id
    ),'[]'::jsonb) end,
    'equipment_presets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'club_id',p.club_id,
          'setup_name',p.setup_name,
          'setup_slot',p.setup_slot
        )
        order by p.club_id,p.setup_slot
      )
      from public.club_equipment_setup_presets p
      join public.clubs c on c.id=p.club_id
      left join public.clubs parent on parent.id=c.parent_club_id
      where c.owner_user_id=v_user_id
         or parent.owner_user_id=v_user_id
    ),'[]'::jsonb),
    'results',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_type',rh.event_type,
          'heat_id',rh.heat_id,
          'rider_id',rh.rider_id,
          'rider_name',rh.rider_name_snapshot,
          'club_id',rh.club_id_snapshot,
          'club_name',rh.club_name_snapshot,
          'rank',rh.rank,
          'status',rh.status,
          'race_id',rh.race_id
        )
        order by
          case when rh.event_type='final' then 0 else 1 end,
          coalesce(h.heat_number,0),
          rh.rank
      )
      from public.national_championship_result_history rh
      left join public.national_championship_heats h on h.id=rh.heat_id
      where rh.edition_id=e.id
    ),'[]'::jsonb) end,
    'past_champions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.season_number desc)
      from (
        select
          pe.season_number,
          pe.country_code,
          pe.champion_rider_id,
          pe.champion_name_snapshot,
          pe.champion_club_id,
          pe.champion_club_name_snapshot,
          pe.final_race_id
        from public.national_championship_editions pe
        where pe.country_code=v_country
          and pe.discipline='road'
          and pe.status='completed'
          and pe.champion_rider_id is not null
        order by pe.season_number desc
        limit 10
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;
