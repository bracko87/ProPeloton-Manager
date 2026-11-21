-- SAT-08: six additional manager-initiated Youth Academy and finance actions.
-- Draft-only source replacement from read-only production pg_get_functiondef.
-- Do not deploy until isolated real-JWT tests and game entitlement checks.
-- Preserve the existing paid Youth Academy license requirement: a seven-day
-- welcome Premium trial does NOT automatically grant paid Youth Academy.
-- No scheduler/race-engine functions or read-only Youth Academy RPCs changed.

-- Player writer: decline_my_youth_race_invitation_v1
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
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,coalesce(s.race_entry_decider,'u16_head_coach')
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated';
  end if;
  if v_entry_decider<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach.';
  end if;

  select * into v_race
  from public.youth_races
  where id=p_race_id
  for update;

  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'This Youth race can no longer be withdrawn';
  end if;

  select * into v_entry
  from public.youth_race_entries
  where race_id=p_race_id
    and academy_id=v_academy_id
    and status='entered'
  for update;

  if v_entry.id is not null then
    v_refund:=case
      when v_entry.total_participation_cost>0
        then v_entry.total_participation_cost
      else v_entry.entry_cost
    end;

    delete from public.youth_race_lineups where entry_id=v_entry.id;

    update public.youth_race_entries
    set status='withdrawn',updated_at=now()
    where id=v_entry.id;

    if v_refund>0 and not exists(
      select 1
      from public.youth_academy_ledger l
      where l.academy_id=v_academy_id
        and l.category='race_withdrawal_refund'
        and l.metadata->>'race_id'=p_race_id::text
    ) then
      update public.youth_academy_season_budgets
      set
        spent_amount=greatest(0,spent_amount-v_refund),
        updated_at=now()
      where academy_id=v_academy_id
        and season_number=v_race.season_number;

      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      )
      values(
        v_academy_id,v_race.season_number,v_game_date,
        'race_withdrawal_refund',
        'Youth race withdrawal refund: '||v_race.race_name,
        v_refund,
        jsonb_build_object(
          'race_id',p_race_id,
          'reason','manager_withdrawal'
        )
      );
    end if;
  end if;

  update public.youth_race_invitations
  set
    status='declined',
    responded_on=v_game_date,
    metadata=coalesce(metadata,'{}'::jsonb)||
      jsonb_build_object(
        'withdrawn_by_manager',true,
        'withdrawn_on',v_game_date
      ),
    updated_at=now()
  where race_id=p_race_id
    and academy_id=v_academy_id
    and status in ('pending','accepted','waitlist');

  if v_entry.id is null and not found then
    raise exception 'No pending application or entered Youth race found';
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

-- Player writer: enter_my_youth_race_v1
CREATE OR REPLACE FUNCTION public.enter_my_youth_race_v1(p_race_id uuid, p_strategy text DEFAULT 'balanced'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_country text;
  v_entry_decider text;
  v_game_date date:=public.get_current_game_date_date();
  v_race public.youth_races%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select
    a.id,
    c.country_code,
    coalesce(s.race_entry_decider,'u16_head_coach')
  into v_academy_id,v_country,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated';
  end if;
  if v_entry_decider<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach.';
  end if;

  select * into v_race
  from public.youth_races
  where id=p_race_id
  for update;

  if v_race.id is null or v_race.status<>'scheduled' then
    raise exception 'Youth race is not open for applications';
  end if;
  if v_race.race_date<=v_game_date+7 then
    raise exception 'Applications close 7 game days before the race';
  end if;
  if v_race.race_date>v_game_date+150 then
    raise exception 'Applications open 150 game days before the race';
  end if;
  if v_race.competition_class='regional'
     and private.youth_regional_division_for_country_v1(v_country)<>v_race.division_code then
    raise exception 'This Regional race belongs to another Youth market division';
  end if;

  if exists(
    select 1 from public.youth_race_entries e
    where e.race_id=p_race_id
      and e.academy_id=v_academy_id
      and e.status in ('entered','completed')
  ) then
    return public.get_my_youth_race_calendar_v1();
  end if;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,
    priority_score,metadata
  )
  values(
    p_race_id,v_academy_id,
    case when v_race.competition_class='regional'
      then 'regional_local' else 'wildcard' end,
    'pending',v_game_date,v_race.race_date-7,2000,
    jsonb_build_object(
      'source','manager_application_v10',
      'manual_manager_application',true,
      'application_submitted_on',v_game_date,
      'application_source','manager',
      'requested_strategy',
        case when p_strategy in ('conservative','balanced','aggressive')
          then p_strategy else 'balanced' end,
      'application_decision_on',v_race.race_date-7
    )
  )
  on conflict(race_id,academy_id) do update
  set
    status='pending',
    invited_on=least(public.youth_race_invitations.invited_on,excluded.invited_on),
    response_deadline=excluded.response_deadline,
    responded_on=null,
    priority_score=greatest(public.youth_race_invitations.priority_score,excluded.priority_score),
    metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)
      ||excluded.metadata,
    updated_at=now();

  if not private.youth_race_academy_qualified_v1(v_academy_id,p_race_id) then
    raise exception 'Academy does not currently have enough eligible Youth Riders';
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

-- Player writer: run_my_youth_scouting_search_v2
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
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
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
  from private.youth_effective_settings_v1 s
  where s.academy_id=v_academy.id;

  select * into v_scout
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true and private.youth_staff_available_v1(cs.id)
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

    if false then -- Attached U16 prospects intentionally suspended; scout unattached prospects only
      -- Both whole records were already reset to NULL above. The previous
      -- dead-branch field assignments were redundant and failed the offline
      -- PL/pgSQL parser; omitting them does not activate attached scouting.

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
    v_accommodation:=private.youth_standard_external_accommodation_weekly_v1(
      v_club.country_code,v_country
    );
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
$function$;

-- Player writer: save_my_youth_race_lineup_v1
CREATE OR REPLACE FUNCTION public.save_my_youth_race_lineup_v1(p_race_id uuid, p_rider_ids uuid[], p_strategy text DEFAULT 'balanced'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_squad_decider text;
  v_rider_id uuid;
  v_slot integer:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_squad_decider into v_academy_id,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if coalesce(v_squad_decider,'u16_head_coach')<>'manager' then
    raise exception 'Race squad selection is delegated to the U16 Head Coach';
  end if;

  select * into v_entry from public.youth_race_entries
  where race_id=p_race_id and academy_id=v_academy_id and status='entered'
  for update;
  select * into v_race from public.youth_races where id=p_race_id;

  if v_entry.id is null then raise exception 'Enter the race before selecting a lineup'; end if;
  if cardinality(p_rider_ids)<4 or cardinality(p_rider_ids)>v_race.lineup_size then
    raise exception 'Youth race lineup must contain between 4 and % riders',v_race.lineup_size;
  end if;

  delete from public.youth_race_lineups where entry_id=v_entry.id;
  foreach v_rider_id in array p_rider_ids loop
    if not exists(select 1 from public.youth_riders yr
      where yr.id=v_rider_id and yr.academy_id=v_academy_id
        and private.youth_rider_available_for_race_v1(yr.id,p_race_id))
    then raise exception 'One or more selected Youth Riders are not eligible or are booked in an overlapping race';
    end if;
    v_slot:=v_slot+1;
    insert into public.youth_race_lineups(entry_id,youth_rider_id,slot_no,selected_by)
    values(v_entry.id,v_rider_id,v_slot,'manager');
  end loop;

  update public.youth_race_entries
  set strategy=case when p_strategy in ('conservative','balanced','aggressive')
    then p_strategy else 'balanced' end,updated_at=now()
  where id=v_entry.id;
  return public.get_my_youth_race_calendar_v1();
end;
$function$;

-- Player writer: transfer_my_youth_academy_budget_v1
CREATE OR REPLACE FUNCTION public.transfer_my_youth_academy_budget_v1(p_direction text, p_amount bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_game_date date:=public.get_current_game_date_date();
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_available bigint;
  v_senior_cash numeric;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;
  if p_amount is null or p_amount<=0 then
    raise exception 'Transfer amount must be greater than zero.';
  end if;
  if v_direction not in ('senior_to_youth','youth_to_senior') then
    raise exception 'Invalid Youth Academy budget transfer direction.';
  end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  perform pg_advisory_xact_lock(hashtext('youth-budget-transfer:'||v_academy.id::text));

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season
  for update;

  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;

  v_available:=greatest(
    v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount,0
  );

  if v_direction='senior_to_youth' then
    v_senior_cash:=coalesce(public.finance_get_club_cash_balance(v_academy.club_id),0);
    if v_senior_cash<p_amount then
      raise exception 'Senior team does not have enough available cash.';
    end if;

    perform public.finance_spend_from_club(
      v_academy.club_id,p_amount,'youth_academy_budget_transfer','SINK',null,
      jsonb_build_object(
        'academy_id',v_academy.id,'season_number',v_season,
        'direction','senior_to_youth'
      )
    );

    update public.youth_academy_season_budgets
    set season_budget=season_budget+p_amount,updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_academy.id,v_season,v_game_date,'budget_transfer_in',
      'Budget transfer from senior team',p_amount,
      jsonb_build_object('source','senior_team','initial_allocation',false)
    );
  else
    if p_amount>v_available then
      raise exception 'Youth Academy has only % available to return.',v_available;
    end if;

    update public.youth_academy_season_budgets
    set season_budget=season_budget-p_amount,updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    perform public.finance_credit_to_club(
      v_academy.club_id,p_amount,'youth_academy_budget_return','SINK',null,
      jsonb_build_object(
        'academy_id',v_academy.id,'season_number',v_season,
        'direction','youth_to_senior'
      )
    );

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_academy.id,v_season,v_game_date,'budget_transfer_out',
      'Budget returned to senior team',-p_amount,
      jsonb_build_object('destination','senior_team')
    );
  end if;

  return public.get_my_youth_academy_finances_v1();
end;
$function$;

-- Player writer: update_my_youth_training_philosophy_v1
CREATE OR REPLACE FUNCTION public.update_my_youth_training_philosophy_v1(p_training_philosophy text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- An email/Google-linked but unconverted Saturn identity remains subject
  -- to its original 14-day expiry and own-club restriction.
  if public.saturn_test_account_requires_guard_v1()
     and not public.saturn_test_account_can_mutate_v1(public.get_my_primary_club_id())
  then
    raise exception 'Test account expired or not authorized for Youth Academy'
      using errcode='42501';
  end if;
  if not public.user_has_youth_academy_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;
  if p_training_philosophy not in ('freshness','balanced','development') then
    raise exception 'Invalid Youth Academy training philosophy';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  if exists(select 1 from private.youth_effective_settings_v1 where academy_id=v_academy_id and training_decider<>'manager') then raise exception 'Training is delegated to the U16 Head Coach'; end if;

  update public.youth_academy_settings
  set training_philosophy=p_training_philosophy,
      updated_at=now()
  where academy_id=v_academy_id;

  return public.get_my_youth_academy_v1();
end;
$function$;


-- Updated Saturn product decision: no Coins, payments, U16 Academy or U23
-- Developing Team before verified registration. Welcome Premium may still
-- expose included non-paid tools. All restrictions survive identity linking.
-- This is still an unshipped draft migration.
create or replace function private.saturn_is_permanently_registered_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $saturn$
  select p_user_id is not null
    and exists(select 1 from auth.users u where u.id=p_user_id and u.is_anonymous is false)
    and not exists(select 1 from public.saturn_test_accounts_v1 t
      where t.user_id=p_user_id and t.converted_at is null);
$saturn$;
revoke all on function private.saturn_is_permanently_registered_v1(uuid) from public,anon,authenticated;

-- Existing entitlement semantics retained for permanently registered users.
create or replace function public.user_has_youth_academy_access_v1(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $saturn$
  select private.saturn_is_permanently_registered_v1(p_user_id)
    and public.user_has_paid_premium_access_v1(p_user_id)
    and exists(select 1 from public.clubs c
      join public.youth_academies a on a.club_id=c.id and a.is_active=true
      where c.owner_user_id=p_user_id and c.deleted_at is null
      and c.parent_club_id is null and coalesce(c.club_type,'main')<>'developing'
      and coalesce(a.renewed_through_season,a.activated_season,0)>=coalesce(public.get_current_season_number(),1));
$saturn$;

-- Enforce the no-Coins rule even when an internal reward/purchase routine,
-- service or overlooked browser endpoint attempts to bypass UI controls.
-- Zero-balance wallet initialization remains allowed.
create or replace function private.saturn_guard_coin_ledger_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if not private.saturn_is_permanently_registered_v1(new.user_id) then
    raise exception 'Complete registration before receiving or spending Coins' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_coin_ledger_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_coin_ledger_v1 on public.user_coin_ledger;
create trigger saturn_guard_coin_ledger_v1 before insert or update on public.user_coin_ledger
for each row execute function private.saturn_guard_coin_ledger_v1();
create or replace function private.saturn_guard_wallet_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if coalesce(new.balance,0)<>0 and not private.saturn_is_permanently_registered_v1(new.user_id) then
    raise exception 'Complete registration before receiving or spending Coins' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_wallet_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_wallet_v1 on public.user_wallets;
create trigger saturn_guard_wallet_v1 before insert or update on public.user_wallets
for each row execute function private.saturn_guard_wallet_v1();

-- Prevent creation through alternate SQL paths, not just paywall buttons.
-- Existing ordinary senior club creation and AI clubs are unaffected.
create or replace function private.saturn_guard_developing_club_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if new.club_type='developing' and new.owner_user_id is not null
      and not private.saturn_is_permanently_registered_v1(new.owner_user_id) then
    raise exception 'Complete registration before developing-team activation' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_developing_club_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_developing_club_v1 on public.clubs;
create trigger saturn_guard_developing_club_v1 before insert or update of club_type,owner_user_id on public.clubs
for each row execute function private.saturn_guard_developing_club_v1();
create or replace function private.saturn_guard_youth_academy_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if exists(select 1 from public.clubs c where c.id=new.club_id and c.owner_user_id is not null
    and not private.saturn_is_permanently_registered_v1(c.owner_user_id)) then
    raise exception 'Complete registration before Youth Academy activation' using errcode='42501';
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_guard_youth_academy_v1() from public,anon,authenticated;
drop trigger if exists saturn_guard_youth_academy_v1 on public.youth_academies;
create trigger saturn_guard_youth_academy_v1 before insert or update of club_id,is_active on public.youth_academies
for each row execute function private.saturn_guard_youth_academy_v1();

-- The usual 20-Coin gift is deferred until successful permanent conversion,
-- not awarded at anonymous signup or identity linking. Same existing
-- idempotency key as permanent registration; retries cannot award twice.
create or replace function private.saturn_grant_deferred_welcome_coins_v1()
returns trigger language plpgsql security definer set search_path=''
as $saturn$
begin
  if old.converted_at is null and new.converted_at is not null then
    if not private.saturn_is_permanently_registered_v1(new.user_id) then
      raise exception 'Permanent registration is not verified' using errcode='42501';
    end if;
    perform public.apply_coin_delta(new.user_id,20,'welcome',
      jsonb_build_object('system_key','welcome_coins_v1','category','welcome','welcome_amount',20));
  end if;
  return new;
end;
$saturn$;
revoke all on function private.saturn_grant_deferred_welcome_coins_v1() from public,anon,authenticated;
drop trigger if exists saturn_grant_deferred_welcome_coins_v1 on public.saturn_test_accounts_v1;
create trigger saturn_grant_deferred_welcome_coins_v1 after update of converted_at on public.saturn_test_accounts_v1
for each row execute function private.saturn_grant_deferred_welcome_coins_v1();
