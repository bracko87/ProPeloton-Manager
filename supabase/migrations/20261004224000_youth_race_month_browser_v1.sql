
create or replace function public.get_my_youth_race_month_v1(
  p_month_number integer,
  p_competition_class text default 'all',
  p_scope text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_regional_division text;
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

  select a.id,coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER')
  into v_academy_id,v_regional_division
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
      ),
      'available_continental',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='continental'
      ),
      'available_regional',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='regional'
          and r.division_code=v_regional_division
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
        and (
          v_scope='all'
          or i.race_id is not null
          or (r.competition_class='regional' and r.division_code=v_regional_division)
        )
    )
  );
end;
$function$;

revoke all on function public.get_my_youth_race_month_v1(integer,text,text)
from public,anon;
grant execute on function public.get_my_youth_race_month_v1(integer,text,text)
to authenticated;
