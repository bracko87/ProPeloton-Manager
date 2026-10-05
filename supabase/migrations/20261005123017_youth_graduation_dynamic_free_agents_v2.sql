
-- Youth graduation history enrichment + dynamic generated free-agent population.
-- Generated free agents scale down with the share of AI-controlled main clubs and
-- naturally reach zero when the world contains no AI main clubs.

create or replace function public.get_dynamic_generated_free_agent_targets_v1()
returns table(
  ai_main_clubs integer,
  human_main_clubs integer,
  total_main_clubs integer,
  ai_share numeric,
  amateur_target integer,
  continental_target integer,
  proteam_target integer
)
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $function$
declare
  v_ai integer:=0;
  v_human integer:=0;
  v_total integer:=0;
  v_share numeric:=0;
  v_factor numeric:=0;
begin
  select
    count(*) filter(where coalesce(c.is_ai,false))::integer,
    count(*) filter(where not coalesce(c.is_ai,false))::integer,
    count(*)::integer
  into v_ai,v_human,v_total
  from public.clubs c
  where c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing';

  if v_total>0 then
    v_share:=v_ai::numeric/v_total::numeric;
  else
    v_share:=0;
  end if;

  -- Slightly concave reduction: the pool falls progressively rather than
  -- disappearing too early while AI clubs still dominate the world.
  v_factor:=case
    when v_share<=0 then 0
    else power(v_share::double precision,0.85)::numeric
  end;

  return query select
    v_ai,v_human,v_total,round(v_share,4),
    case when v_ai=0 then 0 else greatest(1,round(30*v_factor)::integer) end,
    case when v_ai=0 then 0 else greatest(1,round(18*v_factor)::integer) end,
    case when v_ai=0 then 0 else greatest(1,round(8*v_factor)::integer) end;
end;
$function$;

revoke all on function public.get_dynamic_generated_free_agent_targets_v1()
from public,anon;
grant execute on function public.get_dynamic_generated_free_agent_targets_v1()
to authenticated,service_role;

create or replace function public.refill_generated_free_agent_pool()
returns table(
  created_count integer,
  amateur_created integer,
  continental_created integer,
  proteam_created integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_targets record;
begin
  select * into v_targets
  from public.get_dynamic_generated_free_agent_targets_v1();

  return query
  select *
  from public.seed_generated_free_agent_pool(
    v_targets.amateur_target,
    v_targets.continental_target,
    v_targets.proteam_target
  );
end;
$function$;

create or replace function public.plan_daily_generated_free_agents()
returns table(
  total_to_create integer,
  amateur_to_create integer,
  continental_to_create integer,
  proteam_to_create integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_targets record;
  v_amateur integer:=0;
  v_continental integer:=0;
  v_proteam integer:=0;
  v_existing integer:=0;
begin
  select * into v_targets
  from public.get_dynamic_generated_free_agent_targets_v1();

  select count(*)::integer into v_existing
  from public.rider_free_agents
  where source_type='generated' and status='available' and desired_tier='amateur';
  v_amateur:=greatest(0,v_targets.amateur_target-v_existing);

  select count(*)::integer into v_existing
  from public.rider_free_agents
  where source_type='generated' and status='available' and desired_tier='continental';
  v_continental:=greatest(0,v_targets.continental_target-v_existing);

  select count(*)::integer into v_existing
  from public.rider_free_agents
  where source_type='generated' and status='available' and desired_tier='proteam';
  v_proteam:=greatest(0,v_targets.proteam_target-v_existing);

  return query select
    v_amateur+v_continental+v_proteam,
    v_amateur,v_continental,v_proteam;
end;
$function$;

create or replace function public.generate_daily_generated_free_agents()
returns table(
  created_count integer,
  amateur_created integer,
  continental_created integer,
  proteam_created integer
)
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_targets record;
begin
  select * into v_targets
  from public.get_dynamic_generated_free_agent_targets_v1();

  return query
  select *
  from public.seed_generated_free_agent_pool(
    v_targets.amateur_target,
    v_targets.continental_target,
    v_targets.proteam_target
  );
end;
$function$;

create or replace function public.run_daily_free_agent_maintenance(
  p_amateur_target integer default null,
  p_continental_target integer default null,
  p_proteam_target integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_game_date date;
  v_expired_free_agent_count integer:=0;
  v_expired_negotiation_count integer:=0;
  v_deleted_free_agents integer:=0;
  v_deleted_riders integer:=0;
  v_created_count integer:=0;
  v_amateur_created integer:=0;
  v_continental_created integer:=0;
  v_proteam_created integer:=0;
  v_targets record;
  v_amateur_target integer;
  v_continental_target integer;
  v_proteam_target integer;
  v_result jsonb;
begin
  v_game_date:=public.get_current_game_date_date();
  if v_game_date is null then raise exception 'Current game date not available'; end if;

  if exists(
    select 1 from public.free_agent_daily_maintenance_log l
    where l.game_date=v_game_date
  ) then
    return jsonb_build_object(
      'ok',true,'did_run',false,'reason','already_processed','game_date',v_game_date
    );
  end if;

  select * into v_targets
  from public.get_dynamic_generated_free_agent_targets_v1();

  v_amateur_target:=coalesce(p_amateur_target,v_targets.amateur_target);
  v_continental_target:=coalesce(p_continental_target,v_targets.continental_target);
  v_proteam_target:=coalesce(p_proteam_target,v_targets.proteam_target);

  select x.expired_free_agent_count,x.expired_negotiation_count
  into v_expired_free_agent_count,v_expired_negotiation_count
  from public.expire_rider_free_agent_market_state() x;

  select x.deleted_free_agents,x.deleted_riders
  into v_deleted_free_agents,v_deleted_riders
  from public.cleanup_expired_generated_free_agents() x;

  select x.created_count,x.amateur_created,x.continental_created,x.proteam_created
  into v_created_count,v_amateur_created,v_continental_created,v_proteam_created
  from public.seed_generated_free_agent_pool(
    v_amateur_target,v_continental_target,v_proteam_target
  ) x;

  v_result:=jsonb_build_object(
    'ok',true,'did_run',true,'game_date',v_game_date,
    'mode','ai_share_scaled_generated_pool',
    'ai_main_clubs',v_targets.ai_main_clubs,
    'human_main_clubs',v_targets.human_main_clubs,
    'ai_share',v_targets.ai_share,
    'expired_free_agents',v_expired_free_agent_count,
    'expired_negotiations',v_expired_negotiation_count,
    'deleted_generated_free_agents',v_deleted_free_agents,
    'deleted_generated_riders',v_deleted_riders,
    'created_total',v_created_count,
    'created_amateur',v_amateur_created,
    'created_continental',v_continental_created,
    'created_proteam',v_proteam_created,
    'targets',jsonb_build_object(
      'amateur',v_amateur_target,
      'continental',v_continental_target,
      'proteam',v_proteam_target
    )
  );

  insert into public.free_agent_daily_maintenance_log(game_date,ran_at,result)
  values(v_game_date,now(),v_result);

  return v_result;
end;
$function$;

create or replace function public.run_hourly_free_agent_maintenance_unlimited()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_game_date date;
  v_season integer;
  v_month smallint;
  v_day smallint;
  v_hour smallint;
  v_hour_key text;
  v_last_key text;
  v_expired record;
  v_cleanup record;
  v_created record;
  v_targets record;
begin
  select gs.season_number,gs.month_number,gs.day_number,gs.hour_number
  into v_season,v_month,v_day,v_hour
  from public.game_state gs
  where gs.id=true;

  if v_season is null then raise exception 'game_state is not initialized'; end if;
  v_game_date:=public.get_current_game_date_date();
  if v_game_date is null then raise exception 'Current game date not available'; end if;

  v_hour_key:=format('s%sm%sd%sh%s',v_season,v_month,v_day,v_hour);

  select g.last_game_key into v_last_key
  from public.game_job_runtime_guard g
  where g.job_name='free_agent_maintenance_unlimited_hourly';

  if v_last_key=v_hour_key then
    return jsonb_build_object(
      'ok',true,'mode','ai_share_scaled_generated_pool',
      'reason','already_processed','did_run',false,
      'game_date',v_game_date,'game_hour',v_hour
    );
  end if;

  select * into v_expired from public.expire_rider_free_agent_market_state();
  select * into v_cleanup from public.cleanup_expired_generated_free_agents();
  select * into v_targets from public.get_dynamic_generated_free_agent_targets_v1();

  select * into v_created
  from public.seed_generated_free_agent_pool(
    v_targets.amateur_target,
    v_targets.continental_target,
    v_targets.proteam_target
  );

  insert into public.game_job_runtime_guard(job_name,last_game_key,updated_at)
  values('free_agent_maintenance_unlimited_hourly',v_hour_key,now())
  on conflict(job_name) do update
  set last_game_key=excluded.last_game_key,updated_at=excluded.updated_at;

  return jsonb_build_object(
    'ok',true,'mode','ai_share_scaled_generated_pool','did_run',true,
    'game_date',v_game_date,'game_hour',v_hour,
    'ai_main_clubs',v_targets.ai_main_clubs,
    'human_main_clubs',v_targets.human_main_clubs,
    'ai_share',v_targets.ai_share,
    'targets',jsonb_build_object(
      'amateur',v_targets.amateur_target,
      'continental',v_targets.continental_target,
      'proteam',v_targets.proteam_target
    ),
    'created_total',coalesce(v_created.created_count,0),
    'created_amateur',coalesce(v_created.amateur_created,0),
    'created_continental',coalesce(v_created.continental_created,0),
    'created_proteam',coalesce(v_created.proteam_created,0),
    'expired_free_agents',coalesce(v_expired.expired_free_agent_count,0),
    'expired_negotiations',coalesce(v_expired.expired_negotiation_count,0),
    'deleted_generated_riders',coalesce(v_cleanup.deleted_riders,0),
    'deleted_generated_free_agents',coalesce(v_cleanup.deleted_free_agents,0)
  );
end;
$function$;

-- Enrich Youth graduation metadata. Release already creates a real free-agent
-- listing; this makes Academy membership explicit in the persistent history record.
create or replace function private.complete_youth_graduation_v1(
  p_youth_rider_id uuid,
  p_destination text,
  p_game_date date,
  p_actor text default 'system'
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_youth public.youth_riders%rowtype;
  v_academy public.youth_academies%rowtype;
  v_record public.youth_graduation_records%rowtype;
  v_professional_id uuid;
  v_developing_club_id uuid;
  v_salary integer;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_academy_name text;
begin
  if p_destination not in ('developing_team','release') then
    raise exception 'Unsupported Youth graduation destination';
  end if;

  select * into v_youth
  from public.youth_riders where id=p_youth_rider_id for update;
  if v_youth.id is null then raise exception 'Youth rider not found'; end if;

  select * into v_academy from public.youth_academies where id=v_youth.academy_id;
  select c.name into v_academy_name from public.clubs c where c.id=v_academy.club_id;

  insert into public.youth_graduation_records(
    youth_rider_id,academy_id,main_club_id,became_eligible_on,decision,metadata
  )
  values(
    p_youth_rider_id,v_academy.id,v_academy.club_id,p_game_date,'pending',
    jsonb_build_object(
      'academy_name',v_academy_name,
      'academy_member_from',v_youth.joined_game_date,
      'academy_member_until',p_game_date,
      'history_note','Youth Academy member'
    )
  )
  on conflict(youth_rider_id) do update
  set metadata=public.youth_graduation_records.metadata||excluded.metadata,
      updated_at=now();

  select * into v_record
  from public.youth_graduation_records
  where youth_rider_id=p_youth_rider_id
  for update;

  if v_record.completed_on is not null then return v_record.professional_rider_id; end if;

  v_professional_id:=private.create_professional_rider_from_youth_v1(p_youth_rider_id);

  if p_destination='developing_team' then
    select d.id into v_developing_club_id
    from public.clubs d
    where d.parent_club_id=v_academy.club_id
      and d.club_type='developing'
      and d.deleted_at is null
      and public.is_developing_team_access_active_v1(d.id)
    order by d.created_at asc
    limit 1;

    if v_developing_club_id is null then
      raise exception 'An active Developing Team is required for this graduation route.';
    end if;

    if (
      select count(*) from public.club_riders cr
      where cr.club_id=v_developing_club_id
    )>=8 then
      raise exception 'Developing Team roster is full (8 riders).';
    end if;

    insert into public.club_riders(club_id,rider_id,assigned_role)
    values(
      v_developing_club_id,v_professional_id,
      private.youth_main_rider_role_v1(v_youth.role)
    );

    v_salary:=public.calculate_developing_rider_weekly_salary_v1(v_professional_id);

    update public.riders
    set salary=v_salary,
        contract_expires_at=public.get_game_date_for_season_end(v_season),
        contract_expires_season=v_season
    where id=v_professional_id;

    insert into public.rider_contracts(
      rider_id,club_id,salary_weekly,starts_on,expires_on,duration_seasons,
      status,start_season_number,end_season_number,notes_json
    )
    values(
      v_professional_id,v_developing_club_id,v_salary,p_game_date,
      public.get_game_date_for_season_end(v_season),1,'active',
      v_season,v_season,
      jsonb_build_object(
        'source','youth_academy_graduation',
        'youth_rider_id',p_youth_rider_id,
        'academy_name',v_academy_name
      )
    );

    update public.youth_riders
    set status='graduated',updated_at=now()
    where id=p_youth_rider_id;

    update public.youth_graduation_records
    set decision='developing_team',decided_on=p_game_date,
        professional_rider_id=v_professional_id,
        destination_club_id=v_developing_club_id,
        completed_on=p_game_date,
        metadata=metadata||jsonb_build_object(
          'actor',p_actor,'destination','developing_team',
          'academy_name',v_academy_name,
          'academy_member_until',p_game_date
        ),
        updated_at=now()
    where youth_rider_id=p_youth_rider_id;
  else
    v_salary:=public.calculate_developing_rider_weekly_salary_v1(v_professional_id);

    insert into public.rider_free_agents(
      rider_id,source_type,source_club_id,desired_tier,
      expected_salary_weekly,min_acceptable_salary_weekly,
      preferred_duration_seasons,available_from_game_date,
      expires_on_game_date,status
    )
    values(
      v_professional_id,'youth_academy_release',v_academy.club_id,'continental',
      v_salary,greatest(250,round(v_salary*0.85)::integer),1,p_game_date,
      p_game_date+90,'available'
    );

    update public.youth_riders
    set status='released',updated_at=now()
    where id=p_youth_rider_id;

    update public.youth_graduation_records
    set decision='release',decided_on=p_game_date,
        professional_rider_id=v_professional_id,
        destination_club_id=null,
        completed_on=p_game_date,
        metadata=metadata||jsonb_build_object(
          'actor',p_actor,'destination','free_agent',
          'free_agent_source_type','youth_academy_release',
          'academy_name',v_academy_name,
          'academy_member_until',p_game_date,
          'history_note','Youth Academy member released to Free Agents at age 16'
        ),
        updated_at=now()
    where youth_rider_id=p_youth_rider_id;
  end if;

  update public.youth_rider_agreements
  set status='ended',updated_at=now()
  where youth_rider_id=p_youth_rider_id and status='active';

  return v_professional_id;
end;
$function$;

revoke all on function private.complete_youth_graduation_v1(uuid,text,date,text)
from public,anon,authenticated;
