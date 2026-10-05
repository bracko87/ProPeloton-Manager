create or replace function public.club_jersey_url_v1(p_club_id uuid)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select v.kit_config->>'image_url'
  from public.club_profile_popup_view v
  where v.club_id=p_club_id
  limit 1;
$function$;

create or replace function private.youth_race_academy_qualified_v1(
  p_academy_id uuid,
  p_race_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select coalesce((
    select count(*)>=3
    from public.youth_riders r
    where r.academy_id=p_academy_id
      and private.youth_rider_available_for_race_v1(r.id,p_race_id)
  ),false);
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_rankings_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  v_region_code text;
  s integer:=coalesce(public.get_current_season_number(),1);
  membership public.youth_academy_competition_memberships%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select a.id,private.youth_regional_division_for_country_v1(c.country_code)
  into aid,v_region_code
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=uid and c.deleted_at is null and a.is_active
  limit 1;

  if aid is null then return jsonb_build_object('activated',false); end if;

  perform public.ensure_youth_competition_memberships_v1(s);

  select * into membership
  from public.youth_academy_competition_memberships
  where season_number=s and academy_id=aid;

  return jsonb_build_object(
    'activated',true,
    'season_number',s,
    'region_code',v_region_code,
    'my_membership',jsonb_build_object(
      'competition_class',membership.competition_class,
      'division_code',membership.division_code
    ),
    'rules',jsonb_build_object(
      'world_size',16,
      'world_relegated',4,
      'continental_size_each',20,
      'continental_direct_promotion','Winner of Continental West and winner of Continental East',
      'continental_playoff','2nd, 3rd and 4th from each Continental group form a six-team playoff table; top two are promoted to World Class.',
      'regional_promotion','Winner of each of the six Regional divisions is promoted to its mapped Continental group.',
      'regional_feed_west',jsonb_build_array('YOUTH_EUROPE_WEST','YOUTH_AMERICAS','YOUTH_AFRICA','YOUTH_OCEANIA'),
      'regional_feed_east',jsonb_build_array('YOUTH_EUROPE_EAST','YOUTH_ASIA'),
      'continental_balance','Continental West and East are rebalanced to exactly 20 teams at season transition. Relegated teams return to their proper Regional geography.'
    ),
    'academy_divisions',(
      with race_points as (
        select
          p.academy_id,
          sum(private.youth_team_ranking_points_v1(r.competition_class,p.team_position))::bigint points,
          count(*)::integer starts,
          count(*) filter(where p.team_position=1)::integer wins,
          count(*) filter(where p.team_position<=3)::integer podiums
        from public.youth_race_team_prizes p
        join public.youth_races r on r.id=p.race_id
        where r.season_number=s
        group by p.academy_id
      ),
      standing_rows as (
        select
          m.competition_class,m.division_code,m.academy_id,
          c.id club_id,c.name academy_name,c.logo_path,c.country_code,
          coalesce(p.points,0)::bigint points,
          coalesce(p.starts,0)::integer starts,
          coalesce(p.wins,0)::integer wins,
          coalesce(p.podiums,0)::integer podiums,
          row_number() over(
            partition by m.competition_class,m.division_code
            order by coalesce(p.points,0) desc,
                     private.youth_academy_strength_v1(m.academy_id) desc,
                     lower(c.name),m.academy_id
          )::integer rank_no,
          count(*) over(partition by m.competition_class,m.division_code)::integer total_teams
        from public.youth_academy_competition_memberships m
        join public.youth_academies a on a.id=m.academy_id and a.is_active
        join public.clubs c on c.id=a.club_id
        left join race_points p on p.academy_id=m.academy_id
        where m.season_number=s
      ),
      divisions as (
        select
          x.competition_class,x.division_code,
          min(case
            when x.competition_class='world' then 1
            when x.competition_class='continental' and x.division_code='CONTINENTAL_WEST' then 2
            when x.competition_class='continental' then 3
            else 10
          end) sort_order,
          jsonb_agg(jsonb_build_object(
            'rank',x.rank_no,
            'academy_id',x.academy_id,
            'club_id',x.club_id,
            'academy_name',x.academy_name,
            'logo_path',x.logo_path,
            'country_code',x.country_code,
            'points',x.points,
            'starts',x.starts,
            'wins',x.wins,
            'podiums',x.podiums,
            'total_teams',x.total_teams,
            'is_mine',x.academy_id=aid,
            'promotion_zone',case
              when x.competition_class='continental' and x.rank_no=1 then true
              when x.competition_class='regional' and x.rank_no=1 then true
              else false
            end,
            'playoff_zone',x.competition_class='continental' and x.rank_no between 2 and 4,
            'relegation_zone',case
              when x.competition_class='world' and x.rank_no>x.total_teams-4 then true
              when x.competition_class='continental' and x.division_code='CONTINENTAL_WEST'
                and x.rank_no>x.total_teams-4 then true
              when x.competition_class='continental' and x.division_code='CONTINENTAL_EAST'
                and x.rank_no>x.total_teams-2 then true
              else false
            end
          ) order by x.rank_no) teams
        from standing_rows x
        group by x.competition_class,x.division_code
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'competition_class',d.competition_class,
        'division_code',d.division_code,
        'teams',d.teams
      ) order by d.sort_order,d.division_code),'[]'::jsonb)
      from divisions d
    ),
    'continental_playoff',(
      with race_points as (
        select p.academy_id,
          sum(private.youth_team_ranking_points_v1(r.competition_class,p.team_position))::bigint points,
          count(*)::integer starts,
          count(*) filter(where p.team_position=1)::integer wins,
          count(*) filter(where p.team_position<=3)::integer podiums
        from public.youth_race_team_prizes p
        join public.youth_races r on r.id=p.race_id
        where r.season_number=s
        group by p.academy_id
      ),
      base as (
        select m.division_code,m.academy_id,c.id club_id,c.name academy_name,c.logo_path,c.country_code,
          coalesce(p.points,0)::bigint points,coalesce(p.starts,0)::integer starts,
          coalesce(p.wins,0)::integer wins,coalesce(p.podiums,0)::integer podiums,
          row_number() over(partition by m.division_code
            order by coalesce(p.points,0) desc,private.youth_academy_strength_v1(m.academy_id) desc,m.academy_id
          )::integer division_rank
        from public.youth_academy_competition_memberships m
        join public.youth_academies a on a.id=m.academy_id
        join public.clubs c on c.id=a.club_id
        left join race_points p on p.academy_id=m.academy_id
        where m.season_number=s and m.competition_class='continental'
      ),
      playoff as (
        select b.*,
          row_number() over(order by b.points desc,b.wins desc,b.podiums desc,
            private.youth_academy_strength_v1(b.academy_id) desc,b.academy_id)::integer playoff_rank
        from base b where b.division_rank between 2 and 4
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',p.playoff_rank,'division_rank',p.division_rank,'division_code',p.division_code,
        'academy_id',p.academy_id,'club_id',p.club_id,'academy_name',p.academy_name,
        'logo_path',p.logo_path,'country_code',p.country_code,'points',p.points,
        'starts',p.starts,'wins',p.wins,'podiums',p.podiums,
        'promotion_zone',p.playoff_rank<=2,'is_mine',p.academy_id=aid
      ) order by p.playoff_rank),'[]'::jsonb)
      from playoff p
    ),
    'regional',(
      with totals as (
        select yr.id,yr.display_name,yr.country_code,yr.academy_id,
          sum(rr.regional_points)::bigint points,
          count(*) filter(where rr.result_status='finished')::integer starts
        from public.youth_riders yr
        join public.youth_race_results rr on rr.youth_rider_id=yr.id
        join public.youth_races r on r.id=rr.race_id
        join public.youth_academies ya on ya.id=yr.academy_id
        join public.clubs yc on yc.id=ya.club_id
        where r.season_number=s
          and private.youth_regional_division_for_country_v1(yc.country_code)=v_region_code
        group by yr.id,yr.display_name,yr.country_code,yr.academy_id
      ), ranked as (
        select t.*,dense_rank() over(order by points desc,id)::integer rank_no from totals t
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',x.rank_no,'rider_id',x.id,'rider_name',x.display_name,
        'country_code',x.country_code,'academy_id',x.academy_id,
        'academy_name',c.name,'points',x.points,'starts',x.starts,'is_mine',x.academy_id=aid
      ) order by x.rank_no),'[]'::jsonb)
      from (select * from ranked order by rank_no limit 100) x
      join public.youth_academies a on a.id=x.academy_id
      join public.clubs c on c.id=a.club_id
    ),
    'world',(
      with totals as (
        select yr.id,yr.display_name,yr.country_code,yr.academy_id,
          sum(rr.ranking_points)::bigint points,
          count(*) filter(where rr.result_status='finished')::integer starts
        from public.youth_riders yr
        join public.youth_race_results rr on rr.youth_rider_id=yr.id
        join public.youth_races r on r.id=rr.race_id
        where r.season_number=s
        group by yr.id,yr.display_name,yr.country_code,yr.academy_id
      ), ranked as (
        select t.*,dense_rank() over(order by points desc,id)::integer rank_no from totals t
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',x.rank_no,'rider_id',x.id,'rider_name',x.display_name,
        'country_code',x.country_code,'academy_id',x.academy_id,
        'academy_name',c.name,'points',x.points,'starts',x.starts,'is_mine',x.academy_id=aid
      ) order by x.rank_no),'[]'::jsonb)
      from (select * from ranked order by rank_no limit 100) x
      join public.youth_academies a on a.id=x.academy_id
      join public.clubs c on c.id=a.club_id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_race_detail_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_squad_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id,coalesce(s.race_squad_decider,'u16_head_coach')
  into v_academy_id,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  select * into v_entry
  from public.youth_race_entries e
  where e.race_id=p_race_id and e.academy_id=v_academy_id and e.status in ('entered','completed')
  limit 1;

  if v_entry.id is null then
    raise exception 'This Youth race page is available only for races your Academy participates in.';
  end if;

  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then raise exception 'Youth race not found'; end if;

  return jsonb_build_object(
    'game_date',v_game_date,
    'race',jsonb_build_object(
      'id',v_race.id,'season_number',v_race.season_number,'race_name',v_race.race_name,
      'race_date',v_race.race_date,'race_end_date',coalesce(v_race.race_end_date,v_race.race_date),
      'race_days',v_race.race_days,'competition_class',v_race.competition_class,
      'division_code',v_race.division_code,'host_city',v_race.host_city,
      'host_country_code',v_race.host_country_code,'terrain_type',v_race.terrain_type,
      'distance_km',v_race.distance_km,
      'entry_cost',v_race.entry_cost,
      'entry_fee',greatest(coalesce(v_race.entry_cost,500),500),
      'prize_fund_cash',v_race.prize_fund_cash,'lineup_size',v_race.lineup_size,
      'team_limit',v_race.team_limit,
      'entries_count',(select count(*) from public.youth_race_entries e where e.race_id=v_race.id and e.status in ('entered','completed')),
      'status',v_race.status,'results_published_at',v_race.results_published_at,
      'start_time_region_code',v_race.start_time_region_code,
      'planned_start_time_label',v_race.planned_start_time_label
    ),
    'my_entry',jsonb_build_object(
      'id',v_entry.id,'status',v_entry.status,'entered_on',v_entry.entered_on,
      'entered_by',v_entry.entered_by,'strategy',v_entry.strategy,'race_squad_decider',v_squad_decider,
      'entry_fee',v_entry.entry_fee,
      'travel_cost_total',v_entry.travel_cost_total,
      'accommodation_cost_total',v_entry.accommodation_cost_total,
      'logistics_cost_total',v_entry.logistics_cost_total,
      'staff_accommodation_cost_total',v_entry.staff_accommodation_cost_total,
      'equipment_support_cost_total',v_entry.equipment_support_cost_total,
      'total_participation_cost',case when v_entry.total_participation_cost>0 then v_entry.total_participation_cost else v_entry.entry_cost end
    ),
    'stages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'stage_number',s.stage_number,'stage_date',s.stage_date,
        'stage_type',s.stage_type,'distance_km',s.distance_km,
        'start_city',s.start_city,'finish_city',s.finish_city,
        'planned_start_time_label',s.planned_start_time_label,
        'start_time_region_code',s.start_time_region_code,
        'sprint_points_total',s.sprint_points_total,
        'mountain_points_total',s.mountain_points_total,
        'time_trial_points_total',s.time_trial_points_total,
        'status',s.status,
        'results',case when s.status='completed' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'position',sr.finish_position,'rider_id',yr.id,'rider_name',yr.display_name,
            'country_code',yr.country_code,'academy_id',sr.academy_id,'academy_name',c.name,
            'jersey_url',public.club_jersey_url_v1(c.id),
            'result_status',sr.result_status,'gap_seconds',sr.gap_seconds,'time_seconds',sr.time_seconds,
            'sprint_points',sr.sprint_points,'mountain_points',sr.mountain_points,'time_trial_points',sr.time_trial_points
          ) order by sr.finish_position nulls last,yr.display_name)
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id and sr.stage_number=s.stage_number
        ),'[]'::jsonb) else '[]'::jsonb end
      ) order by s.stage_number)
      from public.youth_race_stages s where s.race_id=v_race.id
    ),'[]'::jsonb),
    'teams',coalesce((
      select jsonb_agg(jsonb_build_object(
        'academy_id',e.academy_id,'club_name',c.name,'country_code',c.country_code,
        'logo_path',c.logo_path,
        'jersey_url',public.club_jersey_url_v1(c.id),
        'is_ai',coalesce(c.is_ai,false),'entry_status',e.status,
        'lineup_count',(select count(*) from public.youth_race_lineups l where l.entry_id=e.id),
        'is_mine',e.academy_id=v_academy_id,'team_position',p.team_position,'prize_cash',coalesce(p.prize_cash,0)
      ) order by coalesce(p.team_position,9999),c.name)
      from public.youth_race_entries e
      join public.youth_academies a on a.id=e.academy_id
      join public.clubs c on c.id=a.club_id
      left join public.youth_race_team_prizes p on p.race_id=e.race_id and p.academy_id=e.academy_id
      where e.race_id=v_race.id and e.status in ('entered','completed')
    ),'[]'::jsonb),
    'my_lineup',coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id',yr.id,'name',yr.display_name,'country_code',yr.country_code,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue
      ) order by l.slot_no)
      from public.youth_race_lineups l
      join public.youth_riders yr on yr.id=l.youth_rider_id
      where l.entry_id=v_entry.id
    ),'[]'::jsonb),
    'eligible_riders',case when v_entry.status='entered' and v_race.status='scheduled' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id',yr.id,'name',yr.display_name,'country_code',yr.country_code,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
        'eligible',private.youth_rider_available_for_race_v1(yr.id,v_race.id)
      ) order by yr.display_name)
      from public.youth_riders yr
      where yr.academy_id=v_academy_id and yr.status='academy'
    ),'[]'::jsonb) else '[]'::jsonb end,
    'rider_results',case
      when v_race.status='completed' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'position',rr.finish_position,'rider_id',yr.id,'rider_name',yr.display_name,
          'country_code',yr.country_code,'academy_id',rr.academy_id,'academy_name',c.name,
          'jersey_url',public.club_jersey_url_v1(c.id),
          'result_status',rr.result_status,'gap_seconds',rr.gap_seconds,
          'general_points',rr.general_points,'sprint_points',rr.sprint_points,
          'mountain_points',rr.mountain_points,'time_trial_points',rr.time_trial_points,
          'ranking_points',rr.ranking_points
        ) order by rr.finish_position nulls last,yr.display_name)
        from public.youth_race_results rr
        join public.youth_riders yr on yr.id=rr.youth_rider_id
        join public.youth_academies a on a.id=rr.academy_id
        join public.clubs c on c.id=a.club_id
        where rr.race_id=v_race.id
      ),'[]'::jsonb)
      else coalesce((
        with totals as (
          select
            sr.youth_rider_id,
            sr.academy_id,
            sum(sr.time_seconds) filter(where sr.result_status='finished')::bigint total_time,
            bool_or(sr.result_status<>'finished') not_classified,
            sum(sr.sprint_points)::integer sprint_points,
            sum(sr.mountain_points)::integer mountain_points,
            sum(sr.time_trial_points)::integer time_trial_points
          from public.youth_race_stage_results sr
          where sr.race_id=v_race.id
          group by sr.youth_rider_id,sr.academy_id
        ), ranked as (
          select t.*,
            case when not t.not_classified
              then row_number() over(
                order by case when t.not_classified then 1 else 0 end,t.total_time,t.youth_rider_id
              )::integer
              else null end position,
            min(t.total_time) filter(where not t.not_classified) over() leader_time
          from totals t
        )
        select jsonb_agg(jsonb_build_object(
          'position',x.position,'rider_id',yr.id,'rider_name',yr.display_name,
          'country_code',yr.country_code,'academy_id',x.academy_id,'academy_name',c.name,
          'jersey_url',public.club_jersey_url_v1(c.id),
          'result_status',case when x.not_classified then 'dnf' else 'finished' end,
          'gap_seconds',case when x.not_classified then null else greatest(0,x.total_time-x.leader_time)::integer end,
          'general_points',0,'sprint_points',x.sprint_points,
          'mountain_points',x.mountain_points,'time_trial_points',x.time_trial_points,
          'ranking_points',0
        ) order by x.position nulls last,yr.display_name)
        from ranked x
        join public.youth_riders yr on yr.id=x.youth_rider_id
        join public.youth_academies a on a.id=x.academy_id
        join public.clubs c on c.id=a.club_id
      ),'[]'::jsonb)
    end,
    'classifications',jsonb_build_object(
      'sprint',coalesce((
        select jsonb_agg(z.item order by z.points desc,z.rider_name)
        from (
          select yr.display_name rider_name,sum(sr.sprint_points) points,
            jsonb_build_object('rider_id',yr.id,'rider_name',yr.display_name,'country_code',yr.country_code,
              'academy_name',c.name,
              'jersey_url',public.club_jersey_url_v1(c.id),
              'points',sum(sr.sprint_points)) item
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id
          group by yr.id,yr.display_name,yr.country_code,c.id,c.name
          having sum(sr.sprint_points)>0
        ) z
      ),'[]'::jsonb),
      'mountain',coalesce((
        select jsonb_agg(z.item order by z.points desc,z.rider_name)
        from (
          select yr.display_name rider_name,sum(sr.mountain_points) points,
            jsonb_build_object('rider_id',yr.id,'rider_name',yr.display_name,'country_code',yr.country_code,
              'academy_name',c.name,
              'jersey_url',public.club_jersey_url_v1(c.id),
              'points',sum(sr.mountain_points)) item
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id
          group by yr.id,yr.display_name,yr.country_code,c.id,c.name
          having sum(sr.mountain_points)>0
        ) z
      ),'[]'::jsonb),
      'time_trial',coalesce((
        select jsonb_agg(z.item order by z.points desc,z.rider_name)
        from (
          select yr.display_name rider_name,sum(sr.time_trial_points) points,
            jsonb_build_object('rider_id',yr.id,'rider_name',yr.display_name,'country_code',yr.country_code,
              'academy_name',c.name,
              'jersey_url',public.club_jersey_url_v1(c.id),
              'points',sum(sr.time_trial_points)) item
          from public.youth_race_stage_results sr
          join public.youth_riders yr on yr.id=sr.youth_rider_id
          join public.youth_academies a on a.id=sr.academy_id
          join public.clubs c on c.id=a.club_id
          where sr.race_id=v_race.id
          group by yr.id,yr.display_name,yr.country_code,c.id,c.name
          having sum(sr.time_trial_points)>0
        ) z
      ),'[]'::jsonb)
    ),
    'team_results',case when v_race.status='completed' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'team_position',p.team_position,'academy_id',p.academy_id,'academy_name',c.name,
        'country_code',c.country_code,'logo_path',c.logo_path,
        'jersey_url',public.club_jersey_url_v1(c.id),
        'prize_cash',p.prize_cash,
        'is_mine',p.academy_id=v_academy_id
      ) order by p.team_position)
      from public.youth_race_team_prizes p
      join public.youth_academies a on a.id=p.academy_id
      join public.clubs c on c.id=a.club_id
      where p.race_id=v_race.id
    ),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.enter_youth_race_v1(p_academy_id uuid, p_race_id uuid, p_entered_by text, p_strategy text DEFAULT 'balanced'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_plan public.youth_monthly_race_plans%rowtype;
  v_invitation public.youth_race_invitations%rowtype;
  v_entry_id uuid;
  v_lineup integer;
  v_game_date date:=public.get_current_game_date_date();
  v_month integer;
  v_class_count integer:=0;
  v_class_limit integer:=0;
  v_month_cost bigint:=0;
  v_team_count integer:=0;
  v_squad_decider text;
  v_cost jsonb;
  v_total_cost bigint:=0;
  v_entry_fee bigint:=0;
  v_travel bigint:=0;
  v_accommodation bigint:=0;
  v_logistics bigint:=0;
  v_staff_accommodation bigint:=0;
  v_equipment bigint:=0;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  select * into v_academy from public.youth_academies where id=p_academy_id;

  if v_race.id is null or v_academy.id is null then
    raise exception 'Race or Academy not found';
  end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'Youth race entry is closed';
  end if;

  select * into v_invitation
  from public.youth_race_invitations
  where race_id=p_race_id and academy_id=p_academy_id
  for update;

  if v_invitation.race_id is null
     or v_invitation.status not in ('pending','accepted') then
    raise exception 'This Academy is not eligible to apply for this Youth race';
  end if;

  if not private.youth_race_academy_qualified_v1(p_academy_id,p_race_id) then
    raise exception 'Academy does not currently have enough eligible Youth Riders';
  end if;

  v_month:=extract(month from v_race.race_date)::integer;
  perform private.ensure_youth_monthly_race_plan_v1(
    p_academy_id,v_race.season_number,v_month
  );

  select * into v_plan
  from public.youth_monthly_race_plans
  where academy_id=p_academy_id
    and season_number=v_race.season_number
    and month_number=v_month
  for update;

  if not v_academy.is_ai and not coalesce(v_plan.approved,false) then
    raise exception 'Approve the monthly Youth race plan before applying for races';
  end if;

  v_class_limit:=case v_race.competition_class
    when 'world' then v_plan.world_race_limit
    when 'continental' then v_plan.continental_race_limit
    else v_plan.regional_race_limit
  end;

  select count(*)::integer into v_class_count
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.academy_id=p_academy_id
    and e.status in ('entered','completed')
    and r.season_number=v_race.season_number
    and extract(month from r.race_date)::integer=v_month
    and r.competition_class=v_race.competition_class
    and r.id<>p_race_id;

  if p_entered_by<>'manager' and v_class_count>=coalesce(v_class_limit,0) then
    raise exception 'Monthly % Youth race limit has been reached',
      v_race.competition_class;
  end if;

  v_cost:=private.youth_race_cost_breakdown_v1(p_academy_id,p_race_id);
  if not coalesce((v_cost->>'available')::boolean,false) then
    raise exception 'Youth race participation cost could not be calculated';
  end if;

  v_entry_fee:=coalesce((v_cost->>'entry_fee')::bigint,500);
  v_travel:=coalesce((v_cost->>'travel_cost_total')::bigint,0);
  v_accommodation:=coalesce((v_cost->>'accommodation_cost_total')::bigint,0);
  v_logistics:=coalesce((v_cost->>'logistics_cost_total')::bigint,0);
  v_staff_accommodation:=coalesce((v_cost->>'staff_accommodation_cost_total')::bigint,0);
  v_equipment:=coalesce((v_cost->>'equipment_support_cost_total')::bigint,0);
  v_total_cost:=coalesce((v_cost->>'total_cost')::bigint,0);

  select coalesce(sum(
    case
      when e.total_participation_cost>0 then e.total_participation_cost
      else e.entry_cost
    end
  ),0)::bigint
  into v_month_cost
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.academy_id=p_academy_id
    and e.status in ('entered','completed')
    and r.season_number=v_race.season_number
    and extract(month from r.race_date)::integer=v_month
    and r.id<>p_race_id;

  if v_month_cost+v_total_cost>coalesce(v_plan.max_monthly_cost,0) then
    raise exception 'Monthly Youth racing budget limit would be exceeded ($% + $% > $%)',
      v_month_cost,v_total_cost,v_plan.max_monthly_cost;
  end if;

  select count(*)::integer into v_team_count
  from public.youth_race_entries e
  where e.race_id=p_race_id and e.status in ('entered','completed');

  if v_team_count>=v_race.team_limit then
    raise exception 'Youth race team limit is already full';
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_race.season_number
  for update;

  if v_budget.academy_id is null then
    raise exception 'Youth Academy season budget not found';
  end if;

  if v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_total_cost then
    raise exception 'Youth Academy budget is insufficient for this race ($% required)',
      v_total_cost;
  end if;

  insert into public.youth_race_entries(
    race_id,academy_id,entered_on,entered_by,strategy,entry_cost,status,
    entry_fee,travel_cost_total,accommodation_cost_total,logistics_cost_total,
    staff_accommodation_cost_total,equipment_support_cost_total,total_participation_cost
  )
  values(
    p_race_id,p_academy_id,v_game_date,p_entered_by,
    case when p_strategy in ('conservative','balanced','aggressive')
      then p_strategy else 'balanced' end,
    v_total_cost,'entered',
    v_entry_fee,v_travel,v_accommodation,v_logistics,
    v_staff_accommodation,v_equipment,v_total_cost
  )
  on conflict(race_id,academy_id) do update
  set status='entered',
      strategy=excluded.strategy,
      entry_cost=excluded.entry_cost,
      entry_fee=excluded.entry_fee,
      travel_cost_total=excluded.travel_cost_total,
      accommodation_cost_total=excluded.accommodation_cost_total,
      logistics_cost_total=excluded.logistics_cost_total,
      staff_accommodation_cost_total=excluded.staff_accommodation_cost_total,
      equipment_support_cost_total=excluded.equipment_support_cost_total,
      total_participation_cost=excluded.total_participation_cost,
      updated_at=now()
  returning id into v_entry_id;

  update public.youth_race_invitations
  set status='accepted',responded_on=coalesce(responded_on,v_game_date),updated_at=now()
  where race_id=p_race_id and academy_id=p_academy_id;

  if not exists(
    select 1 from public.youth_academy_ledger l
    where l.academy_id=p_academy_id
      and l.category='race_travel'
      and l.metadata->>'race_id'=p_race_id::text
  ) then
    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_total_cost,updated_at=now()
    where academy_id=p_academy_id and season_number=v_race.season_number;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      p_academy_id,v_race.season_number,v_game_date,'race_travel',
      'Youth race participation: '||v_race.race_name,
      -v_total_cost,
      jsonb_build_object(
        'race_id',p_race_id,
        'competition_class',v_race.competition_class,
        'host_city',v_race.host_city,
        'host_country_code',v_race.host_country_code,
        'entry_fee',v_entry_fee,
        'travel_cost_total',v_travel,
        'accommodation_cost_total',v_accommodation,
        'logistics_cost_total',v_logistics,
        'staff_accommodation_cost_total',v_staff_accommodation,
        'equipment_support_cost_total',v_equipment,
        'total_cost',v_total_cost,
        'rider_count',coalesce((v_cost->>'rider_count')::integer,v_race.lineup_size),
        'staff_count',2
      )
    );
  end if;

  select coalesce(s.race_squad_decider,'u16_head_coach')
  into v_squad_decider
  from private.youth_effective_settings_v1 s
  where s.academy_id=p_academy_id;

  if coalesce(v_squad_decider,'u16_head_coach')='u16_head_coach'
     or v_academy.is_ai then
    v_lineup:=private.select_youth_race_lineup_v1(
      v_entry_id,
      case when v_academy.is_ai then 'ai_head_coach' else 'u16_head_coach' end
    );
    if v_lineup<3 then
      raise exception 'Not enough eligible Youth Riders for this race';
    end if;
  end if;

  return v_entry_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enter_my_youth_race_v1(p_race_id uuid, p_strategy text DEFAULT 'balanced'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry_decider text;
  v_game_date date:=public.get_current_game_date_date();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_entry_decider
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if coalesce(v_entry_decider,'u16_head_coach')<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach';
  end if;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,priority_score,metadata
  )
  select
    r.id,v_academy_id,'wildcard',
    case when i.status='accepted' then 'accepted' else 'pending' end,
    v_game_date,greatest(v_game_date,r.race_date-7),9999,
    coalesce(i.metadata,'{}'::jsonb)||jsonb_build_object(
      'source','manual_manager_application_v4',
      'manual_manager_application',true
    )
  from public.youth_races r
  left join public.youth_race_invitations i
    on i.race_id=r.id and i.academy_id=v_academy_id
  where r.id=p_race_id
    and r.status='scheduled'
    and r.race_date>v_game_date
  on conflict(race_id,academy_id) do update
  set status=case
        when public.youth_race_invitations.status='accepted' then 'accepted'
        else 'pending'
      end,
      invited_on=v_game_date,
      response_deadline=greatest(v_game_date,(select rr.race_date-7 from public.youth_races rr where rr.id=p_race_id)),
      priority_score=9999,
      metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)
        ||jsonb_build_object('source','manual_manager_application_v4','manual_manager_application',true),
      updated_at=now();

  perform private.enter_youth_race_v1(v_academy_id,p_race_id,'manager',p_strategy);
  return public.get_my_youth_race_calendar_v1();
end;
$function$;

create or replace function private.trim_youth_calendar_density_v1(
  p_season integer default null,
  p_from_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_season integer:=coalesce(p_season,public.get_current_season_number(),1);
  v_from date:=coalesce(p_from_date,public.get_current_game_date_date());
  x record;
  e record;
  v_cancelled integer:=0;
  v_refunded bigint:=0;
begin
  for x in
    with base as (
      select
        r.id,r.race_date,r.competition_class,r.division_code,
        extract(month from r.race_date)::integer month_no,
        case r.competition_class
          when 'world' then 3
          when 'continental' then 3
          else 8
        end target_count,
        row_number() over(
          partition by extract(month from r.race_date),r.competition_class,coalesce(r.division_code,'')
          order by r.race_date,r.race_name,r.id
        )::integer rn,
        count(*) over(
          partition by extract(month from r.race_date),r.competition_class,coalesce(r.division_code,'')
        )::integer n
      from public.youth_races r
      where r.season_number=v_season
        and r.status='scheduled'
        and r.race_date>v_from
    ), keep_rows as (
      select b.*,
        case
          when b.n<=b.target_count then true
          when exists(
            select 1
            from public.youth_race_entries ue
            join public.youth_academies ua on ua.id=ue.academy_id
            where ue.race_id=b.id
              and ue.status in ('entered','completed')
              and not ua.is_ai
          ) then true
          when exists(
            select 1
            from generate_series(1,b.target_count) g(k)
            where b.rn=round(
              1 + ((g.k-1)::numeric * (b.n-1)::numeric / greatest(b.target_count-1,1))
            )::integer
          ) then true
          else false
        end keep_it
      from base b
    )
    select * from keep_rows where not keep_it
  loop
    for e in
      select re.id,re.academy_id,re.entry_cost,r.season_number
      from public.youth_race_entries re
      join public.youth_races r on r.id=re.race_id
      where re.race_id=x.id and re.status='entered'
    loop
      update public.youth_academy_season_budgets
      set spent_amount=greatest(0,spent_amount-coalesce(e.entry_cost,0)),
          updated_at=now()
      where academy_id=e.academy_id and season_number=e.season_number;

      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      )
      values(
        e.academy_id,e.season_number,v_from,'race_refund',
        'Youth race calendar density reduction refund',
        coalesce(e.entry_cost,0),
        jsonb_build_object('race_id',x.id,'reason','calendar_density_reduction_v4')
      );

      v_refunded:=v_refunded+coalesce(e.entry_cost,0);
    end loop;

    update public.youth_race_entries
    set status='withdrawn',updated_at=now()
    where race_id=x.id and status='entered';

    update public.youth_race_invitations
    set status='declined',
        responded_on=coalesce(responded_on,v_from),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'decline_reason','calendar_density_reduction_v4'
        ),
        updated_at=now()
    where race_id=x.id and status in ('pending','accepted','waitlist');

    update public.youth_races
    set status='cancelled',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'hidden_from_calendar',true,
          'density_reduction_v4',true,
          'cancelled_on_game_date',v_from
        ),
        updated_at=now()
    where id=x.id and status='scheduled';

    if found then v_cancelled:=v_cancelled+1; end if;
  end loop;

  return jsonb_build_object(
    'season_number',v_season,
    'from_date',v_from,
    'cancelled_races',v_cancelled,
    'refunded_total',v_refunded,
    'monthly_targets',jsonb_build_object(
      'world',3,
      'continental_per_division',3,
      'regional_per_division',8
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_youth_team_allocations_v2(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  gd date:=coalesce(p_game_date,public.get_current_game_date_date());
  x record;
  n integer:=0;
  f integer:=0;
  auto_entries integer:=0;
begin
  perform private.trim_youth_calendar_density_v1(public.get_current_season_number(),gd);
  perform public.sync_youth_scheduled_race_invitations_v2(public.get_current_season_number());
  auto_entries:=private.auto_enter_youth_races_v1(gd);

  for x in
    select id,race_date
    from public.youth_races
    where status='scheduled' and race_date>gd and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    perform private.fill_youth_race_field_v2(x.id,gd,x.race_date<=gd+7);
    n:=n+1;
    if x.race_date<=gd+7 then f:=f+1; end if;
  end loop;

  return jsonb_build_object(
    'game_date',gd,
    'allocation_window_days',14,
    'final_fill_days',7,
    'minimum_teams_per_race',6,
    'auto_staff_entries',auto_entries,
    'races_processed',n,
    'final_fill_races',f
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_race_month_v1(p_month_number integer, p_competition_class text DEFAULT 'all'::text, p_scope text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_regional_division text;
  v_market_division text;
  v_class text:=lower(coalesce(trim(p_competition_class),'all'));
  v_scope text:=lower(coalesce(trim(p_scope),'all'));
  v_plan public.youth_monthly_race_plans%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_month_number not between 1 and 12 then raise exception 'Invalid Youth race month'; end if;
  if v_class not in ('all','world','continental','regional') then
    raise exception 'Invalid Youth race competition filter';
  end if;
  if v_scope not in ('all','my_opportunities') then
    raise exception 'Invalid Youth race scope';
  end if;

  select a.id,
         private.youth_regional_division_for_country_v1(c.country_code),
         coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER')
  into v_academy_id,v_regional_division,v_market_division
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  order by c.created_at
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false,'races','[]'::jsonb);
  end if;

  perform public.ensure_youth_competition_memberships_v1(v_season);
  perform private.ensure_youth_monthly_race_plan_v1(
    v_academy_id,v_season,p_month_number
  );

  select * into v_plan
  from public.youth_monthly_race_plans p
  where p.academy_id=v_academy_id
    and p.season_number=v_season
    and p.month_number=p_month_number;

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'month_number',p_month_number,
    'competition_filter',v_class,
    'scope',v_scope,
    'regional_division',v_regional_division,
    'market_division',v_market_division,
    'monthly_plan',jsonb_build_object(
      'month_number',v_plan.month_number,
      'world_race_limit',v_plan.world_race_limit,
      'continental_race_limit',v_plan.continental_race_limit,
      'regional_race_limit',v_plan.regional_race_limit,
      'max_monthly_cost',v_plan.max_monthly_cost,
      'approved',v_plan.approved,
      'available_world',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='world'
          and r.status<>'cancelled'
      ),
      'available_continental',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='continental'
          and r.status<>'cancelled'
      ),
      'available_regional',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='regional'
          and r.division_code=v_regional_division
          and r.status<>'cancelled'
      ),
      'entered_cost',(
        select coalesce(sum(e.entry_cost),0)
        from public.youth_race_entries e
        join public.youth_races r on r.id=e.race_id
        where e.academy_id=v_academy_id
          and r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
      )
    ),
    'class_counts',jsonb_build_object(
      'world',(select count(*) from public.youth_races r where r.season_number=v_season and extract(month from r.race_date)::integer=p_month_number and r.competition_class='world'),
      'continental',(select count(*) from public.youth_races r where r.season_number=v_season and extract(month from r.race_date)::integer=p_month_number and r.competition_class='continental'),
      'regional',(select count(*) from public.youth_races r where r.season_number=v_season and extract(month from r.race_date)::integer=p_month_number and r.competition_class='regional')
    ),
    'races',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'race_date',r.race_date,
        'race_end_date',coalesce(r.race_end_date,r.race_date),
        'race_days',r.race_days,
        'race_name',r.race_name,
        'race_level',r.race_level,
        'competition_class',r.competition_class,
        'division_code',r.division_code,
        'region_code',r.region_code,
        'host_city',r.host_city,
        'host_country_code',r.host_country_code,
        'terrain_type',r.terrain_type,
        'distance_km',r.distance_km,
        'entry_cost',r.entry_cost,
        'entry_fee',greatest(coalesce(r.entry_cost,500),500),
        'cost_preview',case
          when r.status='scheduled' and i.race_id is not null
          then private.youth_race_cost_breakdown_v1(v_academy_id,r.id)
          else null
        end,
        'is_local_market',private.youth_race_local_market_v1(v_academy_id,r.id),
        'prize_fund_cash',r.prize_fund_cash,
        'start_time_region_code',r.start_time_region_code,
        'planned_start_time_label',r.planned_start_time_label,
        'lineup_size',r.lineup_size,
        'team_limit',r.team_limit,
        'entries_count',(
          select count(*) from public.youth_race_entries xe
          where xe.race_id=r.id and xe.status in ('entered','completed')
        ),
        'status',r.status,
        'prelaunch_past',coalesce((r.metadata->>'prelaunch_cancelled')::boolean,false),
        'is_home_regional',r.competition_class='regional' and r.division_code=v_regional_division,
        'qualified',case when r.status='scheduled'
          then private.youth_race_academy_qualified_v1(v_academy_id,r.id)
          else false end,
        'invitation_status',i.status,
        'invitation_type',i.invitation_type,
        'invitation_response_deadline',i.response_deadline,
        'entry_id',e.id,
        'entry_status',e.status,
        'strategy',e.strategy,
        'entered_by',e.entered_by,
        'eligible_rider_ids',case when r.status='scheduled' then coalesce((
          select jsonb_agg(yr.id order by yr.display_name)
          from public.youth_riders yr
          where yr.academy_id=v_academy_id
            and private.youth_rider_available_for_race_v1(yr.id,r.id)
        ),'[]'::jsonb) else '[]'::jsonb end,
        'lineup',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,
            'age',extract(year from age(r.race_date,yr.birth_date))::integer,
            'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
            'eligible',case when r.status='scheduled'
              then private.youth_rider_available_for_race_v1(yr.id,r.id)
              else false end
          ) order by l.slot_no)
          from public.youth_race_lineups l
          join public.youth_riders yr on yr.id=l.youth_rider_id
          where l.entry_id=e.id
        ),'[]'::jsonb),
        'my_results',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,
            'status',rr.result_status,'position',rr.finish_position,
            'gap_seconds',rr.gap_seconds,'regional_points',rr.regional_points,
            'world_points',rr.world_points
          ) order by rr.finish_position nulls last,yr.display_name)
          from public.youth_race_results rr
          join public.youth_riders yr on yr.id=rr.youth_rider_id
          where rr.race_id=r.id and rr.academy_id=v_academy_id
        ),'[]'::jsonb),
        'top_results',case when r.status='completed' then coalesce((
          select jsonb_agg(x.item order by x.position)
          from (
            select rr.finish_position position,jsonb_build_object(
              'position',rr.finish_position,'rider_name',yr.display_name,
              'country_code',yr.country_code,'academy_name',c.name,
              'gap_seconds',rr.gap_seconds
            ) item
            from public.youth_race_results rr
            join public.youth_riders yr on yr.id=rr.youth_rider_id
            join public.youth_academies a on a.id=rr.academy_id
            join public.clubs c on c.id=a.club_id
            where rr.race_id=r.id and rr.result_status='finished'
            order by rr.finish_position
            limit 10
          ) x
        ),'[]'::jsonb) else '[]'::jsonb end
      ) order by r.race_date,r.competition_class,r.race_name),'[]'::jsonb)
      from public.youth_races r
      left join public.youth_race_invitations i
        on i.race_id=r.id and i.academy_id=v_academy_id
      left join public.youth_race_entries e
        on e.race_id=r.id and e.academy_id=v_academy_id
      where r.season_number=v_season
        and extract(month from r.race_date)::integer=p_month_number
        and (v_class='all' or r.competition_class=v_class)
        and not (r.status='cancelled' and coalesce((r.metadata->>'hidden_from_calendar')::boolean,false))
        and (
          v_scope='all'
          or i.race_id is not null
          or (r.competition_class='regional' and r.division_code=v_regional_division)
        )
    )
  );
end;
$function$;

select private.trim_youth_calendar_density_v1(public.get_current_season_number(),public.get_current_game_date_date());
