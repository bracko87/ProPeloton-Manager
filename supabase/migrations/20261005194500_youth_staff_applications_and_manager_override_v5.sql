
create or replace function private.submit_due_youth_staff_applications_v1(p_game_date date)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  x record;
  n integer:=0;
begin
  for x in
    select i.race_id,i.academy_id
    from public.youth_race_invitations i
    join public.youth_races r on r.id=i.race_id
    join public.youth_academies a on a.id=i.academy_id
    left join private.youth_effective_settings_v1 s on s.academy_id=a.id
    where not a.is_ai
      and a.is_active
      and r.status='scheduled'
      and r.race_date>p_game_date+7
      and r.race_date<=p_game_date+14
      and i.status='pending'
      and coalesce(s.race_entry_decider,'u16_head_coach')='u16_head_coach'
      and private.youth_race_selected_by_plan_v1(a.id,r.id)
      and not coalesce((i.metadata->>'staff_application')::boolean,false)
  loop
    update public.youth_race_invitations
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'staff_application',true,
          'application_submitted_on',p_game_date,
          'application_source','u16_head_coach'
        ),
        updated_at=now()
    where race_id=x.race_id and academy_id=x.academy_id;
    n:=n+1;
  end loop;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION public.decline_my_youth_race_invitation_v1(p_race_id uuid)
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
  v_race public.youth_races%rowtype;
  v_entry public.youth_race_entries%rowtype;
  v_refund bigint:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,coalesce(s.race_entry_decider,'u16_head_coach')
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  -- The club owner can always override a delegated race-participation decision.
  select * into v_race from public.youth_races where id=p_race_id for update;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'This Youth race can no longer be withdrawn';
  end if;

  select * into v_entry
  from public.youth_race_entries
  where race_id=p_race_id and academy_id=v_academy_id
    and status='entered'
  for update;

  if v_entry.id is not null then
    v_refund:=case when v_entry.total_participation_cost>0
      then v_entry.total_participation_cost else v_entry.entry_cost end;

    delete from public.youth_race_lineups where entry_id=v_entry.id;

    update public.youth_race_entries
    set status='withdrawn',updated_at=now()
    where id=v_entry.id;

    if v_refund>0 and not exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=v_academy_id
        and l.category='race_withdrawal_refund'
        and l.metadata->>'race_id'=p_race_id::text
    ) then
      update public.youth_academy_season_budgets
      set spent_amount=greatest(0,spent_amount-v_refund),updated_at=now()
      where academy_id=v_academy_id and season_number=v_race.season_number;

      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      ) values(
        v_academy_id,v_race.season_number,v_game_date,
        'race_withdrawal_refund',
        'Youth race withdrawal refund: '||v_race.race_name,
        v_refund,
        jsonb_build_object('race_id',p_race_id,'reason','manager_withdrawal')
      );
    end if;
  end if;

  update public.youth_race_invitations
  set status='declined',responded_on=v_game_date,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'withdrawn_by_manager',true,'withdrawn_on',v_game_date
      ),
      updated_at=now()
  where race_id=p_race_id and academy_id=v_academy_id
    and status in ('pending','accepted','waitlist');

  if v_entry.id is null and not found then
    raise exception 'No pending application or entered Youth race found';
  end if;

  return public.get_my_youth_race_calendar_v1();
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
          when r.status='scheduled'
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
        'application_pending',
          i.status='pending' and (
            coalesce((i.metadata->>'manual_manager_application')::boolean,false)
            or coalesce((i.metadata->>'staff_application')::boolean,false)
          ),
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

CREATE OR REPLACE FUNCTION public.get_my_youth_race_calendar_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_broad_region text;
  v_regional_division text;
  v_market_division text;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_month integer:=extract(month from public.get_current_game_date_date())::integer;
  v_entry_decider text;
  v_squad_decider text;
  v_membership public.youth_academy_competition_memberships%rowtype;
  v_plan public.youth_monthly_race_plans%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select
    a.id,
    private.youth_region_for_country_v1(c.country_code),
    private.youth_regional_division_for_country_v1(c.country_code),
    coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER'),
    s.race_entry_decider,s.race_squad_decider
  into
    v_academy_id,v_broad_region,v_regional_division,v_market_division,
    v_entry_decider,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false,'races','[]'::jsonb);
  end if;

  perform public.ensure_youth_competition_memberships_v1(v_season);
  perform private.ensure_youth_monthly_race_plan_v1(v_academy_id,v_season,v_month);

  select * into v_membership
  from public.youth_academy_competition_memberships
  where season_number=v_season and academy_id=v_academy_id;

  select * into v_plan
  from public.youth_monthly_race_plans
  where academy_id=v_academy_id and season_number=v_season and month_number=v_month;

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'game_date',v_game_date,
    'current_month',v_month,
    'academy_region',v_broad_region,
    'regional_division',v_regional_division,
    'market_division',v_market_division,
    'race_entry_decider',coalesce(v_entry_decider,'u16_head_coach'),
    'race_squad_decider',coalesce(v_squad_decider,'u16_head_coach'),
    'competition_membership',jsonb_build_object(
      'competition_class',v_membership.competition_class,
      'division_code',v_membership.division_code,
      'seed_rank',v_membership.seed_rank
    ),
    'monthly_plan',jsonb_build_object(
      'month_number',v_plan.month_number,
      'world_race_limit',v_plan.world_race_limit,
      'continental_race_limit',v_plan.continental_race_limit,
      'regional_race_limit',v_plan.regional_race_limit,
      'max_monthly_cost',v_plan.max_monthly_cost,
      'approved',v_plan.approved,
      'available_world',(
        select count(*) from public.youth_races r
        left join public.youth_race_invitations i
          on i.race_id=r.id and i.academy_id=v_academy_id
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
          and r.competition_class='world'
          and r.status='scheduled'
          and (i.status in ('pending','accepted') or i.status is null)
      ),
      'available_continental',(
        select count(*) from public.youth_races r
        left join public.youth_race_invitations i
          on i.race_id=r.id and i.academy_id=v_academy_id
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
          and r.competition_class='continental'
          and r.status='scheduled'
          and (i.status in ('pending','accepted') or i.status is null)
      ),
      'available_regional',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
          and r.competition_class='regional'
          and r.division_code=v_regional_division
          and r.status='scheduled'
      ),
      'entered_cost',(
        select coalesce(sum(e.entry_cost),0)
        from public.youth_race_entries e
        join public.youth_races r on r.id=e.race_id
        where e.academy_id=v_academy_id
          and r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
      )
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
          when r.status='scheduled'
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
        'qualified',private.youth_race_academy_qualified_v1(v_academy_id,r.id),
        'invitation_status',i.status,
        'application_pending',
          i.status='pending' and (
            coalesce((i.metadata->>'manual_manager_application')::boolean,false)
            or coalesce((i.metadata->>'staff_application')::boolean,false)
          ),
        'invitation_type',i.invitation_type,
        'invitation_response_deadline',i.response_deadline,
        'entry_id',e.id,
        'entry_status',e.status,
        'strategy',e.strategy,
        'entered_by',e.entered_by,
        'eligible_rider_ids',coalesce((
          select jsonb_agg(yr.id order by yr.display_name)
          from public.youth_riders yr
          where yr.academy_id=v_academy_id
            and private.youth_rider_available_for_race_v1(yr.id,r.id)
        ),'[]'::jsonb),
        'lineup',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,'age',
            extract(year from age(r.race_date,yr.birth_date))::integer,
            'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
            'eligible',private.youth_rider_available_for_race_v1(yr.id,r.id)
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
      ) order by r.race_date,r.race_name),'[]'::jsonb)
      from public.youth_races r
      left join public.youth_race_invitations i
        on i.race_id=r.id and i.academy_id=v_academy_id
      left join public.youth_race_entries e
        on e.race_id=r.id and e.academy_id=v_academy_id
      where r.season_number=v_season
        and r.status<>'cancelled'
        and (
          r.competition_class in ('world','continental')
          or (
            r.competition_class='regional'
            and r.division_code=v_regional_division
          )
        )
    ),
    'riders',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',yr.id,'name',yr.display_name,'age',
        extract(year from age(v_game_date,yr.birth_date))::integer,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue
      ) order by yr.display_name),'[]'::jsonb)
      from public.youth_riders yr
      where yr.academy_id=v_academy_id and yr.status='academy'
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
  perform private.deduplicate_future_youth_host_cities_v1(public.get_current_season_number(),gd);
  perform public.sync_youth_scheduled_race_invitations_v2(public.get_current_season_number());
  perform private.submit_due_youth_staff_applications_v1(gd);
  auto_entries:=private.auto_enter_youth_races_v1(gd);
  perform private.fill_due_youth_lineups_v1(gd);

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

CREATE OR REPLACE FUNCTION public.run_youth_academy_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  seed_result jsonb;
  hierarchy_result jsonb;
  new_budgets integer:=0;
  agreements_extended integer:=0;
  calendar_result jsonb;
  dedupe_result jsonb;
  runtime_result jsonb;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'Youth Academy transition requires target = source + 1';
  end if;

  seed_result:=public.seed_ai_youth_academies_for_season_v1(p_target_season);
  hierarchy_result:=private.assign_youth_target_memberships_v2(
    p_source_season,p_target_season
  );

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount,initial_allocation
  )
  select
    a.id,p_target_season,
    coalesce(b.season_budget,100000),0,coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_range,'local'),coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_budget,5000),coalesce(b.season_budget,100000)
  from public.youth_academies a
  left join public.youth_academy_season_budgets b
    on b.academy_id=a.id and b.season_number=p_source_season
  where a.is_active
  on conflict(academy_id,season_number) do nothing;
  get diagnostics new_budgets=row_count;

  update public.youth_rider_agreements a
  set ends_on=public.get_game_date_for_season_end(p_target_season),updated_at=now()
  from public.youth_riders r
  where r.id=a.youth_rider_id and r.status='academy' and a.status='active'
    and (a.ends_on is null or a.ends_on<=public.get_game_date_for_season_end(p_source_season));
  get diagnostics agreements_extended=row_count;

  calendar_result:=public.seed_youth_race_calendar_for_season_v1(p_target_season);
  dedupe_result:=private.deduplicate_future_youth_host_cities_v1(p_target_season,null);
  runtime_result:=public.ensure_youth_race_runtime_for_season_v1(p_target_season);

  return jsonb_build_object(
    'ok',true,'source_season',p_source_season,'target_season',p_target_season,
    'new_season_budgets',new_budgets,'agreements_extended',agreements_extended,
    'ai_seed',seed_result,'hierarchy',hierarchy_result,
    'calendar',calendar_result,'calendar_host_deduplication',dedupe_result,'race_runtime',runtime_result
  );
end;
$function$;

