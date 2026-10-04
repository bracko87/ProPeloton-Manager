-- Youth scouting balance v2: lower Coin boost costs and skill-scaled report volume.

CREATE OR REPLACE FUNCTION public.get_my_youth_scouting_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_scout public.club_staff%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_cycle_month date:=date_trunc('month',v_game_date)::date;
  v_cycle_week date:=date_trunc('week',v_game_date)::date;
  v_cycle public.youth_scouting_cycles%rowtype;
  v_week_runs integer:=0;
  v_next_coin_cost integer:=0;
  v_coin_balance integer:=0;
  v_scout_score integer:=0;
  v_report_quota integer:=0;
  v_premium boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at
  limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_premium_access_v1(v_user);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id and a.is_active=true
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'activated',false,
      'premium',v_premium,
      'reports','[]'::jsonb,
      'offers','[]'::jsonb
    );
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select * into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select * into v_scout
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true
    and cs.role_type='youth_scout'
  order by
    (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
    cs.id
  limit 1;

  if v_scout.id is not null then
    v_scout_score:=private.youth_scout_score_v1(v_club.id);
    v_report_quota:=case
      when v_scout_score>=90 then 6
      when v_scout_score>=75 then 5
      when v_scout_score>=60 then 4
      when v_scout_score>=45 then 3
      when v_scout_score>=30 then 2
      else 1
    end;
  end if;

  select count(*)::integer into v_week_runs
  from public.youth_scouting_cycles c
  where c.academy_id=v_academy.id and c.cycle_week=v_cycle_week;

  select * into v_cycle
  from public.youth_scouting_cycles c
  where c.academy_id=v_academy.id and c.cycle_week=v_cycle_week
  order by c.run_number desc
  limit 1;

  v_next_coin_cost:=case coalesce(v_budget.scouting_range,'local')
    when 'local' then 2
    when 'regional' then 5
    when 'continental' then 8
    else 12
  end;

  select coalesce(w.balance,0)::integer into v_coin_balance
  from public.user_wallets w where w.user_id=v_user;
  v_coin_balance:=coalesce(v_coin_balance,0);

  return jsonb_build_object(
    'activated',true,
    'premium',v_premium,
    'read_only',not v_premium,
    'game_date',v_game_date,
    'cycle_month',v_cycle_month,
    'cycle_week',v_cycle_week,
    'weekly_runs_used',v_week_runs,
    'weekly_run_limit',4,
    'free_runs_remaining',case when v_week_runs=0 then 1 else 0 end,
    'boost_runs_remaining',greatest(0,4-v_week_runs),
    'next_run_coin_cost',case when v_week_runs=0 then 0 else v_next_coin_cost end,
    'boost_coin_cost',v_next_coin_cost,
    'coin_balance',v_coin_balance,
    'scouting_range',coalesce(v_budget.scouting_range,'local'),
    'scouting_budget',coalesce(v_budget.scouting_budget,0),
    'scouting_committed_amount',coalesce(v_budget.scouting_committed_amount,0),
    'scout',case when v_scout.id is null then null else jsonb_build_object(
      'id',v_scout.id,
      'name',v_scout.staff_name,
      'country_code',v_scout.country_code,
      'expertise',v_scout.expertise,
      'experience',v_scout.experience,
      'efficiency',v_scout.efficiency,
      'score',v_scout_score,
      'monthly_report_quota',v_report_quota,
      'reports_per_search',v_report_quota
    ) end,
    'current_cycle',case when v_cycle.id is null then null else jsonb_build_object(
      'id',v_cycle.id,
      'cycle_month',v_cycle.cycle_month,
      'cycle_week',v_cycle.cycle_week,
      'run_number',v_cycle.run_number,
      'coin_cost',v_cycle.coin_cost,
      'is_coin_boost',v_cycle.is_coin_boost,
      'range',v_cycle.scouting_range,
      'scout_score',v_cycle.scout_score,
      'reports_created',v_cycle.reports_created
    ) end,
    'can_run',v_premium and v_scout.id is not null and v_week_runs<4,
    'can_run_free',v_premium and v_scout.id is not null and v_week_runs=0,
    'can_run_coin',v_premium and v_scout.id is not null and v_week_runs between 1 and 3,
    'director_mode',
      v_settings.recruitment_decider='academy_director',
    'auto_rules',jsonb_build_object(
      'min_band',v_settings.auto_recruit_min_band,
      'max_stipend_weekly',v_settings.auto_recruit_max_stipend_weekly,
      'max_compensation',v_settings.auto_recruit_max_compensation,
      'min_free_slots',v_settings.auto_recruit_min_free_slots
    ),
    'reports',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'target_kind',r.target_kind,
        'display_name',trim(r.first_name||' '||r.last_name),
        'country_code',r.country_code,
        'age',private.youth_academy_age_v1(r.birth_date),
        'role',r.role,
        'assessment_band',r.assessment_band,
        'confidence',r.confidence,
        'strengths',private.youth_strengths_v1(
          r.sprint,r.climbing,r.time_trial,r.endurance,r.flat,
          r.recovery,r.resistance,r.race_iq,r.teamwork,r.confidence
        ),
        'expected_stipend_weekly',r.expected_stipend_weekly,
        'suggested_accommodation_weekly',r.suggested_accommodation_weekly,
        'suggested_compensation',r.suggested_compensation,
        'relocation_difficulty',r.relocation_difficulty,
        'source_academy_id',r.source_academy_id,
        'source_academy_name',source_club.name,
        'status',r.status,
        'discovered_on',r.discovered_on,
        'expires_on',r.expires_on,
        'latest_offer',case when offer.id is null then null else jsonb_build_object(
          'id',offer.id,
          'status',offer.status,
          'stipend_weekly',offer.stipend_weekly,
          'accommodation_weekly',offer.accommodation_weekly,
          'compensation_offer',offer.compensation_offer,
          'source_academy_decision',offer.source_academy_decision,
          'rider_decision',offer.rider_decision,
          'rejection_reason',offer.rejection_reason,
          'submitted_on',offer.submitted_on
        ) end
      ) order by r.discovered_on desc,r.created_at desc),'[]'::jsonb)
      from public.youth_scouting_reports r
      left join public.youth_academies source_a on source_a.id=r.source_academy_id
      left join public.clubs source_club on source_club.id=source_a.club_id
      left join lateral (
        select o.*
        from public.youth_recruitment_offers o
        where o.report_id=r.id
        order by o.created_at desc
        limit 1
      ) offer on true
      where r.academy_id=v_academy.id
        and r.expires_on>=v_game_date
        and r.status<>'expired'
    )
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.run_my_youth_scouting_search_v2(p_use_coins boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_scout public.club_staff%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_cycle_month date:=date_trunc('month',v_game_date)::date;
  v_cycle_week date:=date_trunc('week',v_game_date)::date;
  v_cycle_id uuid;
  v_week_runs integer:=0;
  v_run_number integer:=1;
  v_coin_cost integer:=0;
  v_coin_debited boolean:=false;
  v_score integer;
  v_count integer;
  v_i integer;
  v_j integer;
  v_candidate_count integer;
  v_target_kind text;
  v_target_rider public.youth_riders%rowtype;
  v_source_academy public.youth_academies%rowtype;
  v_country text;
  v_first text;
  v_last text;
  v_age integer;
  v_birth date;
  v_role text;
  v_base integer;
  v_special integer;
  v_potential integer;
  v_candidate_potential integer;
  v_candidate_eval numeric;
  v_best_eval numeric;
  v_sprint integer;
  v_climbing integer;
  v_tt integer;
  v_endurance integer;
  v_flat integer;
  v_recovery integer;
  v_resistance integer;
  v_race_iq integer;
  v_teamwork integer;
  v_confidence integer;
  v_assessed_potential integer;
  v_band text;
  v_expected_stipend integer;
  v_accommodation integer;
  v_compensation bigint;
  v_relocation text;
  v_report_id uuid;
  v_auto_offer uuid;
  v_active_count integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to run Youth scouting.';
  end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at
  limit 1;

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id and a.is_active=true
  limit 1;

  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  perform pg_advisory_xact_lock(hashtext('youth_scouting_week:'||v_academy.id::text||':'||v_cycle_week::text));

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select * into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select * into v_scout
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true
    and cs.role_type='youth_scout'
  order by
    (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
    cs.id
  limit 1;

  if v_scout.id is null then
    raise exception 'Hire a Youth Scout before running active prospect discovery.';
  end if;

  select count(*)::integer into v_week_runs
  from public.youth_scouting_cycles c
  where c.academy_id=v_academy.id and c.cycle_week=v_cycle_week;

  if v_week_runs>=4 then
    raise exception 'The Youth Scout has already used all four searches for this game week.';
  end if;

  v_run_number:=v_week_runs+1;
  if v_week_runs>0 then
    if not coalesce(p_use_coins,false) then
      raise exception 'The free Youth scouting search for this game week has already been used.';
    end if;

    v_coin_cost:=case coalesce(v_budget.scouting_range,'local')
      when 'local' then 2
      when 'regional' then 5
      when 'continental' then 8
      else 12
    end;

    v_coin_debited:=public.debit_user_coins_idempotent_v1(
      v_user,v_coin_cost,'youth_scouting_extra_search',
      'youth-scouting:'||v_academy.id::text||':'||v_cycle_week::text||':'||v_run_number::text,
      jsonb_build_object(
        'academy_id',v_academy.id,'cycle_week',v_cycle_week,
        'run_number',v_run_number,'scouting_range',coalesce(v_budget.scouting_range,'local')
      )
    );
    if not v_coin_debited then
      raise exception 'This Youth scouting boost has already been charged.';
    end if;
  end if;

  v_score:=private.youth_scout_score_v1(v_club.id);
  v_count:=case
      when v_score>=90 then 6
      when v_score>=75 then 5
      when v_score>=60 then 4
      when v_score>=45 then 3
      when v_score>=30 then 2
      else 1
    end;

  insert into public.youth_scouting_cycles(
    academy_id,season_number,cycle_month,cycle_week,run_number,coin_cost,is_coin_boost,
    scouting_range,scout_staff_id,scout_score,report_target_count,reports_created,run_game_date
  )
  values(
    v_academy.id,v_season,v_cycle_month,v_cycle_week,v_run_number,v_coin_cost,(v_coin_cost>0),
    coalesce(v_budget.scouting_range,'local'),v_scout.id,v_score,v_count,0,v_game_date
  )
  returning id into v_cycle_id;

  for v_i in 1..v_count loop
    v_target_kind:='unattached';
    v_target_rider:=null;
    v_source_academy:=null;

    if random()<0.30 then
      v_target_rider.id:=null;
      v_source_academy.id:=null;

      select r.*
      into v_target_rider
      from public.youth_riders r
      join public.youth_academies a on a.id=r.academy_id
      join public.clubs c on c.id=a.club_id
      where a.id<>v_academy.id
        and a.is_active=true
        and (a.is_ai or public.user_has_premium_access_v1(c.owner_user_id))
        and r.status='academy'
        and private.youth_academy_age_v1(r.birth_date) between 12 and 16
        and private.youth_country_allowed_v1(
          v_club.country_code,r.country_code,coalesce(v_budget.scouting_range,'local')
        )
        and not exists(
          select 1
          from public.youth_scouting_reports prior
          where prior.academy_id=v_academy.id
            and prior.target_youth_rider_id=r.id
            and prior.status in ('new','shortlisted','approached','signed')
        )
      order by
        (
          r.hidden_potential*(0.30+v_score/140.0)
          + random()*100
        ) desc
      limit 1;

      if v_target_rider.id is not null then
        select a.* into v_source_academy
        from public.youth_academies a
        where a.id=v_target_rider.academy_id;

        v_target_kind:='academy';
      end if;
    end if;

    if v_target_kind='academy' then
      v_country:=v_target_rider.country_code;
      v_first:=v_target_rider.first_name;
      v_last:=v_target_rider.last_name;
      v_birth:=v_target_rider.birth_date;
      v_role:=v_target_rider.role;
      v_sprint:=v_target_rider.sprint;
      v_climbing:=v_target_rider.climbing;
      v_tt:=v_target_rider.time_trial;
      v_endurance:=v_target_rider.endurance;
      v_flat:=v_target_rider.flat;
      v_recovery:=v_target_rider.recovery;
      v_resistance:=v_target_rider.resistance;
      v_race_iq:=v_target_rider.race_iq;
      v_teamwork:=v_target_rider.teamwork;
      v_potential:=v_target_rider.hidden_potential;
    else
      v_country:=private.pick_youth_scouting_country_v1(
        v_club.country_code,coalesce(v_budget.scouting_range,'local')
      );

      select fn.first_name into v_first
      from public.first_names_master fn
      where upper(fn.country_code)=upper(v_country)
      order by random() limit 1;

      select ln.last_name into v_last
      from public.last_names_master ln
      where upper(ln.country_code)=upper(v_country)
      order by random() limit 1;

      if v_first is null then
        select first_name into v_first from public.first_names_master order by random() limit 1;
      end if;
      if v_last is null then
        select last_name into v_last from public.last_names_master order by random() limit 1;
      end if;

      v_age:=12+floor(random()*5)::integer;
      v_birth:=private.youth_exact_birth_date_v1(v_age);
      v_role:=(array[
        'all_rounder','sprinter','climber','time_trial','domestique','breakaway'
      ])[1+floor(random()*6)::integer];

      -- The scout does not create talent. Each report samples a normal hidden
      -- candidate pool; stronger scouts are simply better at selecting which
      -- candidates are worth reporting.
      v_best_eval:=-1;
      v_candidate_count:=2+floor(v_score/25.0)::integer;
      for v_j in 1..v_candidate_count loop
        v_candidate_potential:=private.draw_youth_potential_v1();
        v_candidate_eval:=random()*100+
          v_candidate_potential*(0.25+v_score/150.0);
        if v_candidate_eval>v_best_eval then
          v_best_eval:=v_candidate_eval;
          v_potential:=v_candidate_potential;
        end if;
      end loop;

      v_base:=19+((v_age-12)*4)+floor(random()*10)::integer;
      v_special:=4+floor(random()*6)::integer;
      v_sprint:=least(68,v_base+case when v_role='sprinter' then v_special else floor(random()*5)::int end);
      v_climbing:=least(68,v_base+case when v_role='climber' then v_special else floor(random()*5)::int end);
      v_tt:=least(68,v_base+case when v_role='time_trial' then v_special else floor(random()*5)::int end);
      v_endurance:=least(68,v_base+floor(random()*6)::int);
      v_flat:=least(68,v_base+case when v_role in ('sprinter','all_rounder') then floor(v_special/2.0)::int else floor(random()*5)::int end);
      v_recovery:=least(68,v_base+floor(random()*6)::int);
      v_resistance:=least(68,v_base+case when v_role='breakaway' then v_special else floor(random()*5)::int end);
      v_race_iq:=least(68,v_base+floor(random()*6)::int);
      v_teamwork:=least(68,v_base+case when v_role='domestique' then v_special else floor(random()*5)::int end);
    end if;

    v_confidence:=least(95,greatest(35,
      round(
        38+v_score*0.58
        - case coalesce(v_budget.scouting_range,'local')
            when 'local' then 0
            when 'regional' then 4
            when 'continental' then 8
            else 13
          end
        +(random()*10-5)
      )::integer
    ));

    v_assessed_potential:=least(95,greatest(35,
      v_potential+round((random()-0.5)*(100-v_confidence)/2.2)::integer
    ));
    v_band:=private.youth_potential_band_v1(v_assessed_potential);

    v_expected_stipend:=greatest(80,
      80+greatest(0,v_potential-50)*5+floor(random()*35)::integer
    );
    v_relocation:=private.youth_relocation_difficulty_v1(
      v_club.country_code,v_country
    );
    v_accommodation:=case
      when upper(v_country)=upper(v_club.country_code) then 0
      when v_relocation='moderate' then 70+floor(random()*41)::integer
      when v_relocation='hard' then 100+floor(random()*61)::integer
      else 130+floor(random()*91)::integer
    end;
    v_compensation:=case
      when v_target_kind='academy' then
        greatest(1500,
          1500+greatest(0,v_potential-50)*700+
          floor(random()*3500)::integer
        )
      else 0
    end;

    insert into public.youth_scouting_reports(
      academy_id,cycle_id,scout_staff_id,target_kind,target_youth_rider_id,
      source_academy_id,country_code,first_name,last_name,birth_date,role,
      sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
      hidden_potential,assessment_band,confidence,expected_stipend_weekly,
      suggested_accommodation_weekly,suggested_compensation,relocation_difficulty,
      status,discovered_on,expires_on,metadata
    )
    values(
      v_academy.id,v_cycle_id,v_scout.id,v_target_kind,
      case when v_target_kind='academy' then v_target_rider.id else null end,
      case when v_target_kind='academy' then v_source_academy.id else null end,
      upper(v_country),coalesce(v_first,'Alex'),coalesce(v_last,'Prospect'),
      v_birth,v_role,v_sprint,v_climbing,v_tt,v_endurance,v_flat,v_recovery,
      v_resistance,v_race_iq,v_teamwork,v_potential,v_band,v_confidence,
      v_expected_stipend,v_accommodation,v_compensation,v_relocation,
      'new',v_game_date,v_game_date+60,
      jsonb_build_object(
        'scouting_range',coalesce(v_budget.scouting_range,'local'),
        'scout_score',v_score,'cycle_week',v_cycle_week,
        'run_number',v_run_number,'coin_cost',v_coin_cost
      )
    )
    returning id into v_report_id;

    if v_settings.recruitment_decider='academy_director'
       and private.youth_band_rank_v1(v_band)>=
           private.youth_band_rank_v1(v_settings.auto_recruit_min_band) then

      update public.youth_scouting_reports
      set status='shortlisted',updated_at=now()
      where id=v_report_id;

      if v_settings.recruitment_negotiation_decider='academy_director'
         and v_expected_stipend<=v_settings.auto_recruit_max_stipend_weekly
         and v_compensation<=v_settings.auto_recruit_max_compensation then

        select count(*) into v_active_count
        from public.youth_riders r
        where r.academy_id=v_academy.id
          and r.status in ('academy','graduating');

        if 16-v_active_count>v_settings.auto_recruit_min_free_slots then
          begin
            v_auto_offer:=private.process_youth_recruitment_offer_v1(
              v_academy.id,v_report_id,
              v_expected_stipend,
              v_accommodation,
              v_compensation,
              'academy_director'
            );
          exception when others then
            -- A director automation failure must never abort the monthly scout report.
            null;
          end;
        end if;
      end if;
    end if;
  end loop;

  update public.youth_scouting_cycles
  set reports_created=(
    select count(*)::integer
    from public.youth_scouting_reports r
    where r.cycle_id=v_cycle_id
  )
  where id=v_cycle_id;

  return public.get_my_youth_scouting_v1();
end;
$function$
;



revoke all on function public.get_my_youth_scouting_v1() from public,anon;
grant execute on function public.get_my_youth_scouting_v1() to authenticated;
revoke all on function public.run_my_youth_scouting_search_v2(boolean) from public,anon;
grant execute on function public.run_my_youth_scouting_search_v2(boolean) to authenticated;
