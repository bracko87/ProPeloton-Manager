-- Direct U16 scouting uses the SAME weekly search limit, Youth Scout requirement,
-- geography, premium access and coin prices as run_my_youth_scouting_search_v2.
-- One targeted report consumes one search. No unscouted rider attributes are exposed.
create or replace function public.scout_youth_rider_direct_v1(
  p_youth_rider_id uuid, p_use_coins boolean default false
) returns jsonb language plpgsql security definer
set search_path to 'public','private','auth','pg_temp'
as $function$
declare
  u uuid:=auth.uid();
  gd date:=public.get_current_game_date_date();
  season_no integer:=coalesce(public.get_current_season_number(),1);
  week_start date:=date_trunc('week',gd)::date;
  month_start date:=date_trunc('month',gd)::date;
  club public.clubs%rowtype;
  acad public.youth_academies%rowtype;
  budget public.youth_academy_season_budgets%rowtype;
  scout public.club_staff%rowtype;
  rider public.youth_riders%rowtype;
  source_academy public.youth_academies%rowtype;
  report_id uuid;
  cycle_id uuid;
  runs integer;
  next_run integer;
  cost integer:=0;
  scout_score integer;
  confidence integer;
  assessed integer;
  stipend integer;
  housing integer;
  compensation bigint;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_youth_academy_access_v1(u) then
    raise exception 'Premium membership is required for Youth scouting';
  end if;

  select * into club from public.clubs c
    where c.owner_user_id=u and c.deleted_at is null
      and c.parent_club_id is null and coalesce(c.club_type,'main')<>'developing'
    order by c.created_at limit 1;
  select * into acad from public.youth_academies a
    where a.club_id=club.id and a.is_active=true limit 1;
  if acad.id is null then raise exception 'Youth Academy is not activated'; end if;

  perform pg_advisory_xact_lock(hashtext(
    'youth_scouting_week:'||acad.id::text||':'||week_start::text
  ));

  select * into rider from public.youth_riders r
    where r.id=p_youth_rider_id and r.status='academy';
  select * into source_academy from public.youth_academies a
    where a.id=rider.academy_id and a.is_active;
  if rider.id is null or source_academy.id is null then
    raise exception 'This rider is not available for Youth scouting';
  end if;
  if source_academy.id=acad.id then
    raise exception 'You cannot scout a rider already in your own Academy';
  end if;
  if private.youth_academy_age_v1(rider.birth_date) not between 12 and 15 then
    raise exception 'This rider is outside U16 recruitment age (12–15)';
  end if;

  select * into budget from public.youth_academy_season_budgets b
    where b.academy_id=acad.id and b.season_number=season_no;
  if budget.academy_id is null then
    raise exception 'Youth scouting season budget is not initialized';
  end if;
  if not private.youth_country_allowed_v1(
    club.country_code,rider.country_code,coalesce(budget.scouting_range,'local')
  ) then
    raise exception 'This rider is outside your Youth scouting range. Increase scouting range in Youth Academy settings.';
  end if;

  select * into scout from public.club_staff cs
    where cs.club_id=club.id and cs.is_active=true
      and private.youth_staff_available_v1(cs.id)
      and cs.role_type='youth_scout'
    order by (cs.expertise*0.45+cs.experience*0.20+
              cs.efficiency*0.25+cs.potential*0.10) desc,cs.id
    limit 1;
  if scout.id is null then
    raise exception 'Hire a Youth Scout before scouting another Academy rider';
  end if;

  select r.id into report_id from public.youth_scouting_reports r
    where r.academy_id=acad.id and r.target_youth_rider_id=rider.id
      and r.status in ('new','shortlisted','approached','signed')
      and r.expires_on>=gd and r.discovered_on>=week_start
    order by r.created_at desc limit 1;
  if report_id is not null then
    return jsonb_build_object('report_id',report_id,'already_scouted',true,'coin_cost',0);
  end if;

  select count(*)::int into runs from public.youth_scouting_cycles c
    where c.academy_id=acad.id and c.cycle_week=week_start;
  if runs>=4 then raise exception 'All four Youth scouting searches were used this game week'; end if;
  next_run:=runs+1;
  if runs>0 then
    if not coalesce(p_use_coins,false) then
      raise exception 'The free weekly Youth scouting search was used. Confirm a Coins search to continue.';
    end if;
    cost:=case coalesce(budget.scouting_range,'local')
      when 'local' then 2 when 'regional' then 5
      when 'continental' then 8 else 12 end;
    if not public.debit_user_coins_idempotent_v1(
      u,cost,'youth_scouting_extra_search',
      'youth-scouting:'||acad.id::text||':'||week_start::text||':'||next_run::text,
      jsonb_build_object('academy_id',acad.id,'cycle_week',week_start,
        'run_number',next_run,'scouting_range',budget.scouting_range,
        'target_rider_id',rider.id)
    ) then raise exception 'Youth scouting coin payment could not be completed'; end if;
  end if;

  scout_score:=private.youth_scout_score_v1(club.id);
  confidence:=least(95,greatest(35,round(38+scout_score*0.58-
    case coalesce(budget.scouting_range,'local')
      when 'local' then 0 when 'regional' then 4
      when 'continental' then 8 else 13 end
    +(random()*10-5))::int));
  assessed:=least(95,greatest(35,rider.hidden_potential+
    round((random()-0.5)*(100-confidence)/2.2)::int));
  stipend:=greatest(80,80+greatest(0,rider.hidden_potential-50)*5+floor(random()*35)::int);
  housing:=private.youth_standard_external_accommodation_weekly_v1(
    club.country_code,rider.country_code);
  compensation:=greatest(1500,1500+greatest(0,rider.hidden_potential-50)*700+
    floor(random()*3500)::int);

  insert into public.youth_scouting_cycles(
    academy_id,season_number,cycle_month,cycle_week,run_number,coin_cost,is_coin_boost,
    scouting_range,scout_staff_id,scout_score,report_target_count,reports_created,run_game_date
  ) values (
    acad.id,season_no,month_start,week_start,next_run,cost,cost>0,
    coalesce(budget.scouting_range,'local'),scout.id,scout_score,1,1,gd
  ) returning id into cycle_id;

  insert into public.youth_scouting_reports(
    academy_id,cycle_id,scout_staff_id,target_kind,target_youth_rider_id,source_academy_id,
    country_code,first_name,last_name,birth_date,role,
    sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    hidden_potential,assessment_band,confidence,expected_stipend_weekly,
    suggested_accommodation_weekly,suggested_compensation,relocation_difficulty,
    status,discovered_on,expires_on,metadata
  ) values (
    acad.id,cycle_id,scout.id,'academy',rider.id,source_academy.id,
    upper(rider.country_code),rider.first_name,rider.last_name,rider.birth_date,rider.role,
    rider.sprint,rider.climbing,rider.time_trial,rider.endurance,rider.flat,
    rider.recovery,rider.resistance,rider.race_iq,rider.teamwork,
    rider.hidden_potential,private.youth_potential_band_v1(assessed),confidence,
    stipend,housing,compensation,
    private.youth_relocation_difficulty_v1(club.country_code,rider.country_code),
    'new',gd,gd+60,
    jsonb_build_object('source','direct_youth_rider_profile','cycle_week',week_start,
      'run_number',next_run,'scouting_range',budget.scouting_range,'coin_cost',cost,
      'scout_score',scout_score)
  ) returning id into report_id;

  return jsonb_build_object('report_id',report_id,'already_scouted',false,'coin_cost',cost);
end;
$function$;

revoke all on function public.scout_youth_rider_direct_v1(uuid,boolean) from public;
grant execute on function public.scout_youth_rider_direct_v1(uuid,boolean) to authenticated;
