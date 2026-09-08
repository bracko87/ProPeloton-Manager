-- UWT-only field policy. All non-UWT categories continue through the pre-existing functions unchanged.

alter function public.fill_race_ai_teams_v1(uuid)
  rename to fill_race_ai_teams_pre_uwt_policy_v1;

alter function public.submit_race_application_v1(uuid, uuid)
  rename to submit_race_application_pre_uwt_policy_v1;

alter function public.quote_race_application_v1(uuid, uuid)
  rename to quote_race_application_pre_uwt_policy_v1;

alter function public.review_race_applications_v1(uuid, boolean)
  rename to review_race_applications_pre_uwt_policy_v1;

create or replace function public.uwt_race_team_eligible_v1(
  p_race_id uuid,
  p_club_id uuid
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (
      select case
        when r.category not in ('1.UWT','2.UWT') then true
        when c.club_tier::text = 'worldteam' then true
        when c.club_tier::text = 'proteam'
          and public.race_ai_geographic_priority_v1(r.country_code, c.country_code) <= 2
          then true
        else false
      end
      from public.races r
      join public.clubs c on c.id = p_club_id
      where r.id = p_race_id
      limit 1
    ),
    false
  );
$function$;

create or replace function public.fill_race_ai_teams_uwt_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_race record;
  v_rule record;
  v_min_riders integer;
  v_max_teams integer;
  v_world_target integer;
  v_pro_target integer;
  v_existing_total integer := 0;
  v_existing_world integer := 0;
  v_existing_pro integer := 0;
  v_slots integer := 0;
  v_inserted_pro integer := 0;
  v_inserted_world integer := 0;
  v_inserted_world_fallback integer := 0;
  v_inserted_pro_fallback integer := 0;
  v_after_total integer := 0;
  v_after_world integer := 0;
  v_after_pro integer := 0;
  v_assignment_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtext('fill_race_ai_teams_v1'),
    hashtext(p_race_id::text)
  );

  select * into v_race
  from public.races
  where id = p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  if v_race.category not in ('1.UWT','2.UWT') then
    return jsonb_build_object('success',false,'error','not_uwt_race','category',v_race.category);
  end if;

  select * into v_rule
  from public.race_entry_rules
  where race_id = p_race_id
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  v_min_riders := coalesce(v_rule.min_riders_per_team, 6);
  v_max_teams := greatest(
    coalesce(v_rule.max_teams, v_rule.target_teams, 20),
    coalesce(v_rule.target_teams, 20)
  );
  v_pro_target := round(v_max_teams::numeric * 0.20)::integer;
  v_world_target := greatest(0, v_max_teams - v_pro_target);

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_existing_total, v_existing_world, v_existing_pro
  from public.race_team_entries e
  join public.clubs c on c.id = coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  create temporary table if not exists pg_temp.uwt_ai_fill_candidates_v1 (
    club_id uuid primary key,
    club_name text,
    country_code text,
    club_tier text,
    world_tier integer,
    reputation numeric,
    available_riders integer,
    geographic_priority integer
  ) on commit drop;

  truncate table pg_temp.uwt_ai_fill_candidates_v1;

  insert into pg_temp.uwt_ai_fill_candidates_v1(
    club_id,club_name,country_code,club_tier,world_tier,reputation,available_riders,geographic_priority
  )
  select
    pool.id,
    pool.name,
    pool.country_code,
    pool.club_tier::text,
    pool.world_tier,
    pool.reputation,
    available.available_riders,
    public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code)
  from public.ai_competition_filler_club_pool_v1 pool
  cross join lateral (
    select count(*)::integer as available_riders
    from public.club_roster cr
    where cr.club_id=pool.id
      and public.roster_status_allows_race_selection_v1(cr.availability_status)
      and not exists (
        select 1 from public.race_participant_riders same_race
        where same_race.race_id=p_race_id
          and same_race.rider_id=cr.rider_id
      )
      and not exists (
        select 1
        from public.race_participant_riders other_participation
        join public.races other_race on other_race.id=other_participation.race_id
        where other_participation.rider_id=cr.rider_id
          and other_participation.race_id<>p_race_id
          and daterange(other_race.start_date,coalesce(other_race.end_date,other_race.start_date)+1,'[)')
              && daterange(v_race.start_date,coalesce(v_race.end_date,v_race.start_date)+1,'[)')
      )
  ) available
  where coalesce(pool.is_active,true)=true
    and coalesce(pool.is_ai,true)=true
    and coalesce(pool.logo_path,'')<>''
    and available.available_riders>=v_min_riders
    and (
      pool.club_tier::text='worldteam'
      or (
        pool.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code)<=2
      )
    )
    and not exists (
      select 1 from public.race_team_entries existing
      where existing.race_id=p_race_id
        and existing.club_id=pool.id
    )
    and not exists (
      select 1
      from public.race_team_entries other_entry
      join public.races other_race on other_race.id=other_entry.race_id
      where other_entry.club_id=pool.id
        and other_entry.status='accepted'
        and other_race.id<>p_race_id
        and daterange(other_race.start_date,coalesce(other_race.end_date,other_race.start_date)+1,'[)')
            && daterange(v_race.start_date,coalesce(v_race.end_date,v_race.start_date)+1,'[)')
    );

  v_slots := least(
    greatest(v_pro_target - coalesce(v_existing_pro,0),0),
    greatest(v_max_teams - coalesce(v_existing_total,0),0)
  );

  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='proteam'
        and c.geographic_priority<=2
      order by
        c.geographic_priority asc,
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'AI ProTeam added under UWT 80/20 field policy. ProTeams are restricted to the host country or same geographic region.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_pro from inserted;
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_existing_total, v_existing_world, v_existing_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  v_slots := least(
    greatest(v_world_target - coalesce(v_existing_world,0),0),
    greatest(v_max_teams - coalesce(v_existing_total,0),0)
  );

  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='worldteam'
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.geographic_priority asc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'AI WorldTeam added under UWT 80/20 field policy.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_world from inserted;
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_after_total, v_after_world, v_after_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  v_slots := greatest(v_max_teams - coalesce(v_after_total,0),0);
  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='worldteam'
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.geographic_priority asc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'Additional AI WorldTeam added because the host region could not supply the full UWT ProTeam quota.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_world_fallback from inserted;
  end if;

  select count(*)::integer into v_after_total
  from public.race_team_entries
  where race_id=p_race_id and status in ('accepted','confirmed');

  v_slots := greatest(v_max_teams - coalesce(v_after_total,0),0);
  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='proteam'
        and c.geographic_priority<=2
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        c.geographic_priority asc,
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'Additional regional AI ProTeam added because insufficient WorldTeams were available. UWT lower-tier exclusion remains enforced.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_pro_fallback from inserted;
  end if;

  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_assignment_result;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_after_total,v_after_world,v_after_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'race_name',v_race.name,
    'category',v_race.category,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'max_teams',v_max_teams,
    'worldteam_target',v_world_target,
    'proteam_target',v_pro_target,
    'accepted_after_fill',v_after_total,
    'worldteams_after_fill',v_after_world,
    'proteams_after_fill',v_after_pro,
    'continental_and_amateur_allowed',false,
    'proteam_geography','same_country_market_group_or_macro_region_only',
    'proteam_entries_added',v_inserted_pro,
    'worldteam_entries_added',v_inserted_world,
    'worldteam_fallback_entries_added',v_inserted_world_fallback,
    'proteam_fallback_entries_added',v_inserted_pro_fallback,
    'rider_assignment_result',v_assignment_result
  );
end;
$function$;

create or replace function public.fill_race_ai_teams_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_category text;
begin
  select category::text into v_category
  from public.races
  where id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    return public.fill_race_ai_teams_uwt_v1(p_race_id);
  end if;

  return public.fill_race_ai_teams_pre_uwt_policy_v1(p_race_id);
end;
$function$;

create or replace function public.submit_race_application_v1(
  p_race_id uuid,
  p_club_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;

create or replace function public.quote_race_application_v1(
  p_race_id uuid,
  p_club_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payload jsonb;
  v_club_id uuid;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  v_payload := public.quote_race_application_pre_uwt_policy_v1(p_race_id,p_club_id);

  if coalesce((v_payload->>'success')::boolean,false) is not true then
    return v_payload;
  end if;

  begin
    v_club_id := (v_payload->>'club_id')::uuid;
  exception when others then
    v_club_id := p_club_id;
  end;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    v_payload := v_payload || jsonb_build_object(
      'uwt_field_policy','80% WorldTeams / 20% regional ProTeams',
      'uwt_continental_amateur_allowed',false,
      'uwt_proteam_geography','host country or same region only'
    );

    if not (
      v_club_tier='worldteam'
      or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
    ) then
      v_payload := v_payload || jsonb_build_object(
        'can_apply',false,
        'estimated_acceptance_chance_pct',0,
        'chance_label','Not eligible',
        'chance_summary','This team tier is not eligible for UWT races.',
        'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.',
        'eligibility_error','uwt_team_tier_not_eligible'
      );
    end if;
  end if;

  return v_payload;
end;
$function$;

create or replace function public.review_race_applications_uwt_v1(
  p_race_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_race record;
  v_rule record;
  v_current record;
  v_today_ordinal integer;
  v_team_list_ordinal integer;
  v_target_teams integer;
  v_world_target integer;
  v_pro_target integer;
  v_world_accepted integer := 0;
  v_pro_accepted integer := 0;
  v_world_available integer := 0;
  v_pro_available integer := 0;
  v_ineligible_declined integer := 0;
  v_provisional_accepted integer := 0;
  v_new_accepted integer := 0;
  v_new_declined integer := 0;
begin
  perform * from public.recalculate_race_entry_deadlines_v1(p_race_id);

  select * into v_race from public.races where id=p_race_id;
  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  if v_race.category not in ('1.UWT','2.UWT') then
    return jsonb_build_object('success',false,'error','not_uwt_race');
  end if;

  select * into v_rule from public.race_entry_rules where race_id=p_race_id limit 1;
  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  select * into v_current from public.get_current_game_date_parts() limit 1;
  v_today_ordinal := public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);
  v_team_list_ordinal := public.game_date_ordinal_v1(
    v_rule.team_list_announcement_season_number,
    v_rule.team_list_announcement_month_number,
    v_rule.team_list_announcement_day_number
  );

  if not p_force and v_today_ordinal < v_team_list_ordinal then
    return jsonb_build_object(
      'success',false,
      'error','review_not_due_yet',
      'current_game_date',public.game_date_display_v1(v_current.season_number,v_current.month_number,v_current.day_number),
      'team_list_announcement',public.game_date_display_v1(
        v_rule.team_list_announcement_season_number,
        v_rule.team_list_announcement_month_number,
        v_rule.team_list_announcement_day_number
      )
    );
  end if;

  v_target_teams := least(
    coalesce(v_rule.target_teams,v_rule.max_teams,v_rule.min_teams,20),
    coalesce(v_rule.max_teams,v_rule.target_teams,20)
  );
  v_pro_target := round(v_target_teams::numeric*0.20)::integer;
  v_world_target := greatest(0,v_target_teams-v_pro_target);

  with changed as (
    update public.race_team_entries e
    set
      status='declined',
      review_round=2,
      reviewed_at=now(),
      final_decision_at=now(),
      decision_reason='Declined by UWT eligibility policy: only WorldTeams and host-country/same-region ProTeams may enter.',
      updated_at=now()
    from public.clubs c
    where e.race_id=p_race_id
      and c.id=e.club_id
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted')
      and not (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
    returning 1
  )
  select count(*)::integer into v_ineligible_declined from changed;

  update public.race_team_entries e
  set
    commitment_score_snapshot=coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id)),
    acceptance_score=coalesce(
      e.acceptance_score,
      coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id),50)+(random()*10)
    ),
    reviewed_at=now(),
    updated_at=now()
  from public.clubs c
  where e.race_id=p_race_id
    and c.id=e.club_id
    and coalesce(e.is_ai_filler,false)=false
    and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
    and e.status in ('applied','under_review','provisionally_accepted')
    and (
      c.club_tier::text='worldteam'
      or (
        c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
      )
    );

  select
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_world_accepted,v_pro_accepted
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status='accepted';

  v_world_available := greatest(v_world_target-coalesce(v_world_accepted,0),0);
  v_pro_available := greatest(v_pro_target-coalesce(v_pro_accepted,0),0);

  with ranked as (
    select
      e.id,
      c.club_tier::text as club_tier,
      row_number() over (
        partition by c.club_tier::text
        order by coalesce(e.acceptance_score,0) desc,e.created_at asc,e.id
      ) as rn
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    where e.race_id=p_race_id
      and e.status='provisionally_accepted'
      and coalesce(e.is_ai_filler,false)=false
      and (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
  ), changed as (
    update public.race_team_entries e
    set
      status=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then 'accepted'
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then 'accepted'
        else 'under_review'
      end,
      review_round=2,
      reviewed_at=now(),
      final_decision_at=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then now()
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then now()
        else null
      end,
      decision_reason=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then 'Accepted from protected preliminary field within UWT WorldTeam quota.'
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then 'Accepted from protected preliminary field within UWT regional ProTeam quota.'
        else 'Moved to final reserve review because this UWT tier quota was already filled.'
      end,
      updated_at=now()
    from ranked
    where e.id=ranked.id
    returning e.status
  )
  select count(*) filter (where status='accepted')::integer
  into v_provisional_accepted
  from changed;

  select
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_world_accepted,v_pro_accepted
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status='accepted';

  v_world_available := greatest(v_world_target-coalesce(v_world_accepted,0),0);
  v_pro_available := greatest(v_pro_target-coalesce(v_pro_accepted,0),0);

  with candidates as (
    select
      e.id,
      c.club_tier::text as club_tier,
      row_number() over (
        partition by c.club_tier::text
        order by
          case when coalesce(e.review_round,0)=1 and coalesce(e.decision_reason,'') like 'Reserve #%' then 0 else 1 end,
          coalesce(e.acceptance_score,0) desc,
          e.created_at asc,
          e.id
      ) as selection_rank
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    where e.race_id=p_race_id
      and e.status in ('applied','under_review')
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
  ), changed as (
    update public.race_team_entries e
    set
      status=case
        when candidates.club_tier='worldteam' and candidates.selection_rank<=v_world_available then 'accepted'
        when candidates.club_tier='proteam' and candidates.selection_rank<=v_pro_available then 'accepted'
        else 'declined'
      end,
      review_round=2,
      reviewed_at=now(),
      final_decision_at=now(),
      decision_reason=case
        when candidates.club_tier='worldteam' and candidates.selection_rank<=v_world_available then 'Accepted by final UWT review within WorldTeam quota.'
        when candidates.club_tier='proteam' and candidates.selection_rank<=v_pro_available then 'Accepted by final UWT review within regional ProTeam quota.'
        else 'Declined by final UWT review because this team-tier quota was filled.'
      end,
      updated_at=now()
    from candidates
    where e.id=candidates.id
    returning e.status
  )
  select
    count(*) filter (where status='accepted')::integer,
    count(*) filter (where status='declined')::integer
  into v_new_accepted,v_new_declined
  from changed;

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'race_name',v_race.name,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'target_teams',v_target_teams,
    'worldteam_target',v_world_target,
    'proteam_target',v_pro_target,
    'ineligible_pending_applications_declined',coalesce(v_ineligible_declined,0),
    'provisional_accepted',coalesce(v_provisional_accepted,0),
    'new_accepted_from_reserve_or_late_pool',coalesce(v_new_accepted,0),
    'new_declined',coalesce(v_new_declined,0),
    'message','UWT applications reviewed with 80/20 WorldTeam/regional-ProTeam quotas. Continental and Amateur teams are excluded.'
  );
end;
$function$;

create or replace function public.review_race_applications_v1(
  p_race_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_category text;
begin
  select category::text into v_category
  from public.races
  where id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    return public.review_race_applications_uwt_v1(p_race_id,p_force);
  end if;

  return public.review_race_applications_pre_uwt_policy_v1(p_race_id,p_force);
end;
$function$;

create or replace function public.reconcile_future_uwt_race_fields_v1(
  p_race_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_race record;
  v_max_teams integer;
  v_pro_target integer;
  v_human_pro integer;
  v_keep_ai_pro integer;
  v_removed_riders integer := 0;
  v_withdrawn_entries integer := 0;
  v_total_removed_riders integer := 0;
  v_total_withdrawn_entries integer := 0;
  v_fill jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_race in
    select r.id,r.name,r.country_code,r.start_date,rer.max_teams,rer.target_teams
    from public.races r
    join public.race_entry_rules rer on rer.race_id=r.id
    where r.category in ('1.UWT','2.UWT')
      and r.start_date>public.get_current_game_date_date()
      and (p_race_id is null or r.id=p_race_id)
      and (
        rer.applications_status='closed'
        or lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
      )
      and exists (
        select 1 from public.race_team_entries e
        where e.race_id=r.id
          and e.status in ('accepted','confirmed')
          and coalesce(e.is_ai_filler,false)=true
      )
    order by r.start_date,r.name
  loop
    v_max_teams := greatest(coalesce(v_race.max_teams,v_race.target_teams,20),coalesce(v_race.target_teams,20));
    v_pro_target := round(v_max_teams::numeric*0.20)::integer;

    with bad as (
      select e.id,coalesce(e.participating_club_id,e.club_id) as team_id
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and (
          c.club_tier::text not in ('worldteam','proteam')
          or (
            c.club_tier::text='proteam'
            and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)>2
          )
        )
    ), deleted as (
      delete from public.race_participant_riders pr
      using bad
      where pr.race_id=v_race.id
        and pr.team_id=bad.team_id
      returning pr.id
    )
    select count(*)::integer into v_removed_riders from deleted;

    with changed as (
      update public.race_team_entries e
      set
        status='withdrawn',
        decision_reason='Removed by UWT 80/20 field reconciliation: only WorldTeams and host-country/same-region ProTeams are eligible.',
        withdrawn_at=coalesce(e.withdrawn_at,now()),
        updated_at=now()
      from public.clubs c
      where e.race_id=v_race.id
        and c.id=coalesce(e.participating_club_id,e.club_id)
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and (
          c.club_tier::text not in ('worldteam','proteam')
          or (
            c.club_tier::text='proteam'
            and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)>2
          )
        )
      returning e.id
    )
    select count(*)::integer into v_withdrawn_entries from changed;

    v_total_removed_riders := v_total_removed_riders+coalesce(v_removed_riders,0);
    v_total_withdrawn_entries := v_total_withdrawn_entries+coalesce(v_withdrawn_entries,0);

    select count(*)::integer into v_human_pro
    from public.race_team_entries e
    join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
    where e.race_id=v_race.id
      and e.status in ('accepted','confirmed')
      and coalesce(e.is_ai_filler,false)=false
      and c.club_tier::text='proteam';

    v_keep_ai_pro := greatest(v_pro_target-coalesce(v_human_pro,0),0);

    with ranked as (
      select
        e.id,
        coalesce(e.participating_club_id,e.club_id) as team_id,
        row_number() over (
          order by
            public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code) asc,
            coalesce(c.world_tier,99) asc,
            coalesce(c.reputation,0) desc,
            e.created_at asc,
            e.id
        ) as rn
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
    ), surplus as (
      select * from ranked where rn>v_keep_ai_pro
    ), deleted as (
      delete from public.race_participant_riders pr
      using surplus
      where pr.race_id=v_race.id and pr.team_id=surplus.team_id
      returning pr.id
    )
    select count(*)::integer into v_removed_riders from deleted;

    with ranked as (
      select
        e.id,
        row_number() over (
          order by
            public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code) asc,
            coalesce(c.world_tier,99) asc,
            coalesce(c.reputation,0) desc,
            e.created_at asc,
            e.id
        ) as rn
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
    ), changed as (
      update public.race_team_entries e
      set
        status='withdrawn',
        decision_reason='Removed by UWT 80/20 field reconciliation because the regional ProTeam quota was exceeded.',
        withdrawn_at=coalesce(e.withdrawn_at,now()),
        updated_at=now()
      from ranked
      where e.id=ranked.id and ranked.rn>v_keep_ai_pro
      returning e.id
    )
    select count(*)::integer into v_withdrawn_entries from changed;

    v_total_removed_riders := v_total_removed_riders+coalesce(v_removed_riders,0);
    v_total_withdrawn_entries := v_total_withdrawn_entries+coalesce(v_withdrawn_entries,0);

    v_fill := public.fill_race_ai_teams_uwt_v1(v_race.id);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'race_id',v_race.id,
      'race_name',v_race.name,
      'fill_result',v_fill
    ));
  end loop;

  return jsonb_build_object(
    'success',true,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'future_only',true,
    'historical_results_untouched',true,
    'ai_entries_withdrawn',v_total_withdrawn_entries,
    'participant_riders_removed',v_total_removed_riders,
    'results',v_results
  );
end;
$function$;

select public.reconcile_future_uwt_race_fields_v1();

grant execute on function public.uwt_race_team_eligible_v1(uuid,uuid) to public, anon, authenticated, service_role;
grant execute on function public.fill_race_ai_teams_uwt_v1(uuid) to public, anon, authenticated, service_role;
grant execute on function public.fill_race_ai_teams_v1(uuid) to public, anon, authenticated, service_role;
grant execute on function public.submit_race_application_v1(uuid,uuid) to public, anon, authenticated, service_role;
grant execute on function public.quote_race_application_v1(uuid,uuid) to public, anon, authenticated, service_role;
grant execute on function public.review_race_applications_uwt_v1(uuid,boolean) to public, anon, authenticated, service_role;
grant execute on function public.review_race_applications_v1(uuid,boolean) to public, anon, authenticated, service_role;
grant execute on function public.reconcile_future_uwt_race_fields_v1(uuid) to public, anon, authenticated, service_role;