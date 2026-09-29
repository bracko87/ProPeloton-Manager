-- Extend the rollback-only World Nations fixture through the real
-- National Coach / National Team manager lifecycle before the competition
-- progression test.
--
-- Covered inside the rollback fixture:
--   * fixed Jan 1-10 candidature window;
--   * tied Jan 10-20 first round;
--   * Jan 20-27 runoff and elected coach;
--   * 10 human-club call-ups and 10 Accept responses;
--   * confirmed 10-rider squad;
--   * 7-rider TTT / Flat / Hilly-Mountain lineups with 3 then 1 changes;
--   * National Duty planned -> active -> completed;
--   * World Nations generation, schedule, draw, host, race gate,
--     round progression, champion, history and notifications;
--   * full rollback / leak check before returning.

CREATE OR REPLACE FUNCTION private.run_nations_e2e_fixture_core_v1(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer:=greatest(16,least(coalesce(p_association_count,48),64));
  v_season integer;
  v_live_associations integer;
  v_live_edition integer;
  v_available_countries integer;
  v_fixture_token text:=substr(replace(gen_random_uuid()::text,'-',''),1,10);
  v_created jsonb;
  v_schedule jsonb;
  v_host jsonb;
  v_race_runtime jsonb;
  v_edition_id uuid;
  v_first_round_id uuid;
  v_first_round_start date;
  v_round record;
  v_group record;
  v_round_result jsonb;
  v_group_result jsonb;
  v_round_entry_count integer;
  v_expected integer;
  v_history_count integer:=0;
  v_champion_count integer:=0;
  v_host_count integer:=0;
  v_fake_notifications integer:=0;
  v_member_min integer:=0;
  v_member_max integer:=0;
  v_scheduled_group_count integer:=0;
  v_total_group_count integer:=0;
  v_three_event_groups integer:=0;
  v_race_gate_blocked integer:=0;
  v_unsafe_scheduled integer:=0;
  v_report jsonb:='{}'::jsonb;
  v_error text;
  v_leaked_users integer:=0;
  v_leaked_associations integer:=0;

  -- One Association is also taken through the real manager-facing
  -- election/call-up/squad/lineup/National Duty RPC lifecycle.
  v_original_game_date date;
  v_team_assoc_id uuid;
  v_team_country text;
  v_election_id uuid;
  v_candidate1 uuid;
  v_candidate2 uuid;
  v_candidate1_user uuid;
  v_candidate2_user uuid;
  v_election_result jsonb;
  v_coach_terms integer:=0;
  v_cycle text:='e2e-team-lifecycle';
  v_callup_result jsonb;
  v_squad_result jsonb;
  v_squad_id uuid;
  v_squad_riders uuid[];
  v_day1 uuid[];
  v_day2 uuid[];
  v_day3 uuid[];
  v_lineup1 jsonb;
  v_lineup2 jsonb;
  v_lineup3 jsonb;
  v_duty_id uuid;
  v_duty_start_result jsonb;
  v_duty_end_result jsonb;
  v_team_rider_count integer:=0;
  v_team_lifecycle jsonb:='{}'::jsonb;
begin
  select
    season_number,
    public.get_current_game_date_date()
  into v_season,v_original_game_date
  from public.game_state
  where id=true;

  select count(*)::integer into v_live_associations
  from public.national_associations;

  select count(*)::integer into v_live_edition
  from public.nations_competition_editions
  where season_number=v_season;

  if v_live_associations>0 or v_live_edition>0 then
    return jsonb_build_object(
      'status','skipped',
      'reason','fixture_requires_empty_live_nations_state',
      'live_associations',v_live_associations,
      'live_current_season_editions',v_live_edition,
      'note','Use the read-only E2E stress validator once live Associations exist, or run this fixture on a Supabase development branch.'
    );
  end if;

  -- The rollback fixture reuses existing AI clubs rather than creating hundreds
  -- of new human clubs. This avoids triggering the normal new-club roster,
  -- AI-slot replacement and division-rebalance workflows, which are unrelated
  -- to World Nations. Each fixture Association still gets five genuine main
  -- clubs that are temporarily converted to human ownership inside the rollback
  -- subtransaction.
  select count(*)::integer
  into v_available_countries
  from (
    select c.country_code
    from public.clubs c
    where c.deleted_at is null
      and c.club_type='main'
      and c.is_ai=true
      and c.is_active=true
      and not public.is_national_team_club_v1(c.id)
    group by c.country_code
    having count(*)>=5
  ) eligible_countries;

  if v_available_countries<16 then
    return jsonb_build_object(
      'status','skipped',
      'reason','not_enough_existing_ai_club_pools_for_safe_fixture',
      'requested',v_count,
      'available_fixture_countries',v_available_countries,
      'minimum_required',16
    );
  end if;

  v_count:=least(v_count,v_available_countries);

  begin

    create temporary table pg_temp._e2e_associations(
      id uuid primary key,
      idx integer not null,
      country_code text not null
    ) on commit drop;

    insert into pg_temp._e2e_associations(id,idx,country_code)
    select
      gen_random_uuid(),
      row_number() over(order by x.country_code)::integer,
      upper(x.country_code)
    from (
      select c.country_code,count(*)::integer as ai_clubs
      from public.clubs c
      where c.deleted_at is null
        and c.club_type='main'
        and c.is_ai=true
        and c.is_active=true
        and not public.is_national_team_club_v1(c.id)
      group by c.country_code
      having count(*)>=5
      order by c.country_code
      limit v_count
    ) x;

    create temporary table pg_temp._e2e_members(
      association_id uuid not null,
      association_idx integer not null,
      country_code text not null,
      member_no integer not null,
      user_id uuid not null,
      club_id uuid not null
    ) on commit drop;

    insert into pg_temp._e2e_members(
      association_id,association_idx,country_code,member_no,user_id,club_id
    )
    select
      a.id,
      a.idx,
      a.country_code,
      picked.member_no,
      gen_random_uuid(),
      picked.club_id
    from pg_temp._e2e_associations a
    cross join lateral (
      select
        c.id as club_id,
        row_number() over(order by c.club_tier,c.name,c.id)::integer as member_no
      from public.clubs c
      where upper(c.country_code)=a.country_code
        and c.deleted_at is null
        and c.club_type='main'
        and c.is_ai=true
        and c.is_active=true
        and not public.is_national_team_club_v1(c.id)
      order by c.club_tier,c.name,c.id
      limit 5
    ) picked;

    insert into auth.users(
      id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      is_sso_user,is_anonymous
    )
    select
      m.user_id,
      'authenticated',
      'authenticated',
      'ppm-e2e-'||v_fixture_token||'-'||m.association_idx||'-'||m.member_no||'@example.invalid',
      '',
      now(),
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('username','e2e_'||m.association_idx||'_'||m.member_no),
      now(),now(),false,false
    from pg_temp._e2e_members m;

    -- Temporarily turn five pre-existing AI main clubs per country into
    -- human-controlled clubs. The savepoint/subtransaction rollback below
    -- restores every original club row before this function returns.
    update public.clubs c
    set owner_user_id=m.user_id,
        is_ai=false,
        is_active=true,
        inactivity_status='active',
        updated_at=now()
    from pg_temp._e2e_members m
    where c.id=m.club_id;

    insert into public.national_associations(
      id,country_code,name,status,created_by_user_id,
      created_on_game_date,activated_on_game_date,last_status_change_on_game_date
    )
    select
      a.id,
      a.country_code,
      left('E2E '||v_fixture_token||' '||a.country_code||' National Association',80),
      'active',
      (
        select m.user_id
        from pg_temp._e2e_members m
        where m.association_id=a.id
        order by m.member_no
        limit 1
      ),
      public.get_current_game_date_date(),
      public.get_current_game_date_date(),
      public.get_current_game_date_date()
    from pg_temp._e2e_associations a;

    insert into public.national_association_memberships(
      association_id,user_id,club_id,status,coach_eligible,joined_on_game_date
    )
    select
      m.association_id,m.user_id,m.club_id,'active',true,public.get_current_game_date_date()
    from pg_temp._e2e_members m;

    with technical as (
      select
        c.id,
        row_number() over(order by upper(c.country_code),c.id)::integer as rn
      from public.clubs c
      where c.is_ai=true
        and c.deleted_at is null
        and public.is_national_team_club_v1(c.id)
      order by upper(c.country_code),c.id
      limit v_count
    )
    insert into public.national_association_race_team_identities(
      association_id,country_code,technical_club_id,identity_source
    )
    select
      a.id,a.country_code,t.id,'existing_national_team_pool'
    from pg_temp._e2e_associations a
    join technical t on t.rn=a.idx;

    select min(private.national_association_active_member_count_v1(a.id)),
           max(private.national_association_active_member_count_v1(a.id))
    into v_member_min,v_member_max
    from pg_temp._e2e_associations a;

    if v_member_min<>5 or v_member_max<>5 then
      raise exception 'Fixture membership activation failed: min %, max %.',v_member_min,v_member_max;
    end if;

    -- ---------------------------------------------------------------------
    -- Real National Coach + National Team manager workflow
    -- ---------------------------------------------------------------------
    -- Prefer France because the fixture has a deep real rider/club pool there.
    select a.id,a.country_code
    into v_team_assoc_id,v_team_country
    from pg_temp._e2e_associations a
    order by case when a.country_code='FR' then 0 else 1 end,a.idx
    limit 1;

    -- Fixed January election: candidature closes Jan 10, tied Round 1 closes
    -- Jan 20, runoff closes Jan 27.
    update public.game_state
    set month_number=1,day_number=1,hour_number=12,minute_number=0
    where id=true;

    v_election_id:=public.ensure_national_coach_election_v1(v_team_assoc_id,v_season);

    if not exists(
      select 1
      from public.national_coach_elections e
      where e.id=v_election_id
        and e.election_kind='annual'
        and e.registration_open_date=public.game_date_from_parts(v_season,1,1)
        and e.registration_close_date=public.game_date_from_parts(v_season,1,10)
        and e.round1_open_date=public.game_date_from_parts(v_season,1,10)
        and e.round1_close_date=public.game_date_from_parts(v_season,1,20)
    ) then
      raise exception 'First-activation January election did not use the fixed Jan 1-10 / Jan 10-20 window.';
    end if;

    select m.user_id into v_candidate1_user
    from pg_temp._e2e_members m
    where m.association_id=v_team_assoc_id and m.member_no=1;

    select m.user_id into v_candidate2_user
    from pg_temp._e2e_members m
    where m.association_id=v_team_assoc_id and m.member_no=2;

    perform set_config('request.jwt.claim.sub',v_candidate1_user::text,true);
    v_candidate1:=public.register_national_coach_candidate_v1(
      v_election_id,
      'E2E candidate one: balanced national-team selection and lineups.'
    );

    perform set_config('request.jwt.claim.sub',v_candidate2_user::text,true);
    v_candidate2:=public.register_national_coach_candidate_v1(
      v_election_id,
      'E2E candidate two: results-led national-team selection and lineups.'
    );

    update public.game_state
    set month_number=1,day_number=10,hour_number=12,minute_number=0
    where id=true;

    perform public.process_national_coach_election_v1(v_election_id);

    -- Round 1: deliberate 2-2 tie, fifth member abstains.
    for v_group in
      select m.member_no,m.user_id
      from pg_temp._e2e_members m
      where m.association_id=v_team_assoc_id
        and m.member_no<=4
      order by m.member_no
    loop
      perform set_config('request.jwt.claim.sub',v_group.user_id::text,true);
      perform public.cast_national_coach_vote_v1(
        v_election_id,
        case when v_group.member_no in (1,3) then v_candidate1 else v_candidate2 end
      );
    end loop;

    update public.game_state
    set month_number=1,day_number=20,hour_number=12,minute_number=0
    where id=true;

    v_election_result:=public.process_national_coach_election_v1(v_election_id);

    if coalesce(v_election_result->>'status','')<>'runoff'
       or coalesce((v_election_result->>'round')::integer,0)<>2
       or (v_election_result->>'opens_on')::date<>public.game_date_from_parts(v_season,1,20)
       or (v_election_result->>'closes_on')::date<>public.game_date_from_parts(v_season,1,27) then
      raise exception 'Tied Round 1 did not create the fixed Jan 20-27 runoff: %',v_election_result::text;
    end if;

    -- Round 2: candidate one wins 3-2.
    for v_group in
      select m.member_no,m.user_id
      from pg_temp._e2e_members m
      where m.association_id=v_team_assoc_id
      order by m.member_no
    loop
      perform set_config('request.jwt.claim.sub',v_group.user_id::text,true);
      perform public.cast_national_coach_vote_v1(
        v_election_id,
        case when v_group.member_no in (1,3,5) then v_candidate1 else v_candidate2 end
      );
    end loop;

    update public.game_state
    set month_number=1,day_number=27,hour_number=12,minute_number=0
    where id=true;

    v_election_result:=public.process_national_coach_election_v1(v_election_id);

    if coalesce(v_election_result->>'status','')<>'completed'
       or (v_election_result->>'winner_user_id')::uuid<>v_candidate1_user then
      raise exception 'Jan 27 runoff did not elect candidate one: %',v_election_result::text;
    end if;

    select count(*)::integer into v_coach_terms
    from public.national_coach_terms t
    where t.association_id=v_team_assoc_id
      and t.season_number=v_season
      and t.status='active'
      and t.user_id=v_candidate1_user;

    if v_coach_terms<>1 then
      raise exception 'Expected exactly one active elected National Coach term.';
    end if;

    -- Two riders from each of the five human-controlled fixture clubs gives
    -- exactly ten pending club call-ups and exercises Accept on every manager.
    create temporary table pg_temp._e2e_team_riders(
      seq integer primary key,
      rider_id uuid not null,
      owner_user_id uuid not null,
      club_id uuid not null,
      callup_id uuid
    ) on commit drop;

    insert into pg_temp._e2e_team_riders(seq,rider_id,owner_user_id,club_id)
    select
      row_number() over(order by m.member_no,picked.rider_id)::integer,
      picked.rider_id,
      m.user_id,
      m.club_id
    from pg_temp._e2e_members m
    cross join lateral (
      select r.id as rider_id
      from public.rider_statistics_page_view r
      where r.club_id=m.club_id
        and upper(r.country_code)=v_team_country
      order by r.id
      limit 2
    ) picked
    where m.association_id=v_team_assoc_id
    order by m.member_no,picked.rider_id;

    select count(*)::integer into v_team_rider_count
    from pg_temp._e2e_team_riders;

    if v_team_rider_count<>10 then
      raise exception 'Team lifecycle fixture expected 10 riders from the five member clubs, found %.',v_team_rider_count;
    end if;

    perform set_config('request.jwt.claim.sub',v_candidate1_user::text,true);

    for v_group in
      select seq,rider_id
      from pg_temp._e2e_team_riders
      order by seq
    loop
      v_callup_result:=public.send_national_team_callup_v1(
        v_group.rider_id,
        v_cycle
      );

      if coalesce(v_callup_result->>'status','')<>'pending' then
        raise exception 'Human-club rider call-up was not pending: %',v_callup_result::text;
      end if;

      update pg_temp._e2e_team_riders
      set callup_id=(v_callup_result->>'callup_id')::uuid
      where seq=v_group.seq;
    end loop;

    for v_group in
      select seq,callup_id,owner_user_id
      from pg_temp._e2e_team_riders
      order by seq
    loop
      perform set_config('request.jwt.claim.sub',v_group.owner_user_id::text,true);
      v_callup_result:=public.respond_to_national_team_callup_v1(
        v_group.callup_id,true,'E2E accepted'
      );
      if coalesce(v_callup_result->>'status','')<>'accepted' then
        raise exception 'Club acceptance failed: %',v_callup_result::text;
      end if;
    end loop;

    select array_agg(rider_id order by seq)
    into v_squad_riders
    from pg_temp._e2e_team_riders;

    perform set_config('request.jwt.claim.sub',v_candidate1_user::text,true);
    v_squad_result:=public.confirm_national_team_squad_v1(v_cycle,v_squad_riders);
    v_squad_id:=(v_squad_result->>'squad_id')::uuid;

    if coalesce((v_squad_result->>'squad_size')::integer,0)<>10 then
      raise exception 'Final National Team squad did not contain 10 riders: %',v_squad_result::text;
    end if;

    select array_agg(rider_id order by seq)
    into v_day1
    from pg_temp._e2e_team_riders
    where seq between 1 and 7;

    select array_agg(rider_id order by seq)
    into v_day2
    from pg_temp._e2e_team_riders
    where seq in (1,2,3,4,8,9,10);

    select array_agg(rider_id order by seq)
    into v_day3
    from pg_temp._e2e_team_riders
    where seq in (1,2,3,4,5,8,9);

    v_lineup1:=public.submit_national_team_lineup_v1(v_squad_id,1,v_day1);
    v_lineup2:=public.submit_national_team_lineup_v1(v_squad_id,2,v_day2);
    v_lineup3:=public.submit_national_team_lineup_v1(v_squad_id,3,v_day3);

    if coalesce((v_lineup1->>'lineup_size')::integer,0)<>7
       or coalesce((v_lineup2->>'changes_from_previous_day')::integer,-1)<>3
       or coalesce((v_lineup3->>'changes_from_previous_day')::integer,-1)<>1 then
      raise exception 'National Team lineup lifecycle failed: day1 %, day2 %, day3 %.',
        v_lineup1::text,v_lineup2::text,v_lineup3::text;
    end if;

    v_duty_id:=public.set_national_team_duty_window_v1(
      v_squad_id,
      public.game_date_from_parts(v_season,1,30),
      public.game_date_from_parts(v_season,2,1)
    );

    update public.game_state
    set month_number=1,day_number=30,hour_number=12,minute_number=0
    where id=true;

    v_duty_start_result:=public.refresh_national_team_duty_status_v1();

    if not exists(
      select 1
      from public.national_team_duties d
      where d.id=v_duty_id and d.status='active'
    ) then
      raise exception 'National Duty did not become active on its start date.';
    end if;

    update public.game_state
    set month_number=2,day_number=2,hour_number=12,minute_number=0
    where id=true;

    v_duty_end_result:=public.refresh_national_team_duty_status_v1();

    if not exists(
      select 1
      from public.national_team_duties d
      where d.id=v_duty_id and d.status='completed'
    ) then
      raise exception 'National Duty did not complete after its end date.';
    end if;

    v_team_lifecycle:=jsonb_build_object(
      'association_id',v_team_assoc_id,
      'country_code',v_team_country,
      'election',jsonb_build_object(
        'first_round','2-2 tie',
        'runoff_window','Jan 20-27',
        'winner_user_id',v_candidate1_user,
        'active_coach_terms',v_coach_terms
      ),
      'callups',jsonb_build_object(
        'sent',10,
        'accepted',10
      ),
      'squad_size',10,
      'lineups',jsonb_build_array(v_lineup1,v_lineup2,v_lineup3),
      'national_duty',jsonb_build_object(
        'duty_id',v_duty_id,
        'started',v_duty_start_result,
        'completed',v_duty_end_result
      )
    );

    -- Restore the original game date before the competition-wide fixture.
    update public.game_state
    set month_number=extract(month from v_original_game_date)::integer,
        day_number=extract(day from v_original_game_date)::integer,
        hour_number=12,
        minute_number=0
    where id=true;

    v_created:=public.create_nations_competition_edition_v1(v_season);
    if coalesce(v_created->>'status','') not in ('created','existing') then
      raise exception 'Edition generation failed: %',v_created::text;
    end if;

    -- Moving the rollback fixture clock through Jan 28+ intentionally exercises
    -- the real game-state maintenance trigger. It may therefore have generated
    -- the edition before this explicit call, in which case "existing" is the
    -- expected idempotent result.
    v_edition_id:=(v_created->>'edition_id')::uuid;

    select id,starts_on_game_date
    into v_first_round_id,v_first_round_start
    from public.nations_competition_rounds
    where edition_id=v_edition_id
      and round_index=1;

    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);

    select starts_on_game_date
    into v_first_round_start
    from public.nations_competition_rounds
    where id=v_first_round_id;

    select count(*)::integer,
           count(*) filter(
             where (
               select count(*)
               from public.nations_group_events e
               where e.group_id=g.id and e.event_date is not null
             )=3
           )::integer
    into v_total_group_count,v_three_event_groups
    from public.nations_competition_groups g
    join public.nations_competition_rounds r on r.id=g.round_id
    where r.edition_id=v_edition_id;

    if v_total_group_count=0 or v_three_event_groups<>v_total_group_count then
      raise exception 'Competition schedule did not create exactly three dated events for every group.';
    end if;

    -- Host rotation must be independent of money. Three equal candidates are enough
    -- to exercise the real host selector.
    insert into public.nations_host_applications(
      edition_id,association_id,submitted_by_user_id,statement,status,submitted_on_game_date
    )
    select
      v_edition_id,
      a.id,
      (
        select m.user_id
        from pg_temp._e2e_members m
        where m.association_id=a.id
        order by m.member_no
        limit 1
      ),
      'E2E host application',
      'submitted',
      public.get_current_game_date_date()
    from pg_temp._e2e_associations a
    where a.idx<=3;

    v_host:=public.select_nations_host_v1(v_edition_id);
    if coalesce(v_host->>'status','')<>'selected'
       or coalesce(v_host->>'selection_basis','')<>'rotation_not_spending' then
      raise exception 'Host selection failed: %',v_host::text;
    end if;

    select count(*)::integer into v_host_count
    from public.nations_host_applications
    where edition_id=v_edition_id and status='selected';

    if v_host_count<>1 then
      raise exception 'Fixture must select exactly one World Nations host.';
    end if;

    perform public.draw_nations_round_v1(v_first_round_id);

    select count(*)::integer into v_round_entry_count
    from public.nations_group_entries nge
    join public.nations_competition_groups g on g.id=nge.group_id
    where g.round_id=v_first_round_id;

    if v_round_entry_count<>v_count then
      raise exception 'First-round draw expected % entries but created %.',v_count,v_round_entry_count;
    end if;

    -- Move the fixture game clock close to Round 1. The surrounding subtransaction
    -- is always rolled back, so the live game clock never changes for other sessions.
    update public.game_state
    set month_number=extract(month from (v_first_round_start-5))::integer,
        day_number=extract(day from (v_first_round_start-5))::integer,
        hour_number=12,
        minute_number=0
    where id=true;

    v_race_runtime:=public.process_nations_race_runtime_v2();
    v_race_gate_blocked:=coalesce((v_race_runtime->>'race_gates_blocked')::integer,0);

    if v_race_gate_blocked<=0 then
      raise exception 'Missing-lineup race gate was not exercised by the fixture: %',v_race_runtime::text;
    end if;

    select count(*)::integer
    into v_unsafe_scheduled
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    join public.races rr on rr.id=e.race_id
    where r.edition_id=v_edition_id
      and rr.status in ('scheduled','active')
      and e.status='waiting_for_lineups';

    if v_unsafe_scheduled<>0 then
      raise exception 'One or more World Nations races were scheduled despite missing lineups.';
    end if;

    -- Complete every round with deterministic, non-tied synthetic scores.
    for v_round in
      select *
      from public.nations_competition_rounds
      where edition_id=v_edition_id
      order by round_index
    loop
      if v_round.round_index>1 then
        perform public.draw_nations_round_v1(v_round.id);
      end if;

      select count(*)::integer into v_round_entry_count
      from public.nations_group_entries nge
      join public.nations_competition_groups g on g.id=nge.group_id
      where g.round_id=v_round.id;

      v_expected:=v_round.entrants_target;
      if v_round_entry_count<>v_expected then
        raise exception 'Round % expected % entries but drew %.',
          v_round.round_index,v_expected,v_round_entry_count;
      end if;

      for v_group in
        select *
        from public.nations_competition_groups
        where round_id=v_round.id
        order by group_number
      loop
        with ranked as (
          select
            nge.id,
            row_number() over(order by nge.seed_position,nge.id)::integer as rn
          from public.nations_group_entries nge
          where nge.group_id=v_group.id
            and nge.status<>'withdrawn'
        )
        update public.nations_group_entries nge
        set ttt_points=300-r.rn,
            flat_points=400-r.rn,
            mountain_points=300-r.rn,
            total_points=1000-(3*r.rn),
            race_wins=case when r.rn=1 then 2 when r.rn=2 then 1 else 0 end,
            podium_finishes=greatest(0,4-r.rn),
            ttt_rank=r.rn,
            best_day3_rider_rank=r.rn,
            updated_at=now()
        from ranked r
        where nge.id=r.id;

        v_group_result:=public.finalize_nations_group_v1(v_group.id);
        if coalesce(v_group_result->>'status','')<>'completed' then
          raise exception 'Group finalization failed: %',v_group_result::text;
        end if;
      end loop;

      v_round_result:=public.finalize_nations_round_v1(v_round.id);

      if v_round.round_type='world_final' then
        if coalesce(v_round_result->>'status','')<>'edition_completed' then
          raise exception 'World Nations Final did not complete the edition: %',v_round_result::text;
        end if;
      elsif coalesce(v_round_result->>'status','')<>'completed' then
        raise exception 'Round finalization failed: %',v_round_result::text;
      end if;
    end loop;

    select count(*)::integer into v_champion_count
    from public.nations_competition_entries
    where edition_id=v_edition_id and status='champion';

    select count(*)::integer into v_history_count
    from public.nations_competition_history
    where edition_id=v_edition_id;

    if v_champion_count<>1 then
      raise exception 'World Nations fixture resolved % champions instead of one.',v_champion_count;
    end if;

    if v_history_count<>least(16,v_count) then
      raise exception 'World Nations history expected % final rows but stored %.',
        least(16,v_count),v_history_count;
    end if;

    select count(*)::integer into v_fake_notifications
    from public.user_notifications un
    join pg_temp._e2e_members m on m.user_id=un.user_id;

    if v_fake_notifications<=0 then
      raise exception 'Competition lifecycle generated no member notifications.';
    end if;

    v_report:=jsonb_build_object(
      'status','pass',
      'association_count',v_count,
      'member_count',v_count*5,
      'active_member_min',v_member_min,
      'active_member_max',v_member_max,
      'edition_id',v_edition_id,
      'round_count',(
        select count(*) from public.nations_competition_rounds where edition_id=v_edition_id
      ),
      'group_count',v_total_group_count,
      'groups_with_three_scheduled_events',v_three_event_groups,
      'host_selection',v_host,
      'national_team_lifecycle',v_team_lifecycle,
      'race_gate_test',jsonb_build_object(
        'blocked_events',v_race_gate_blocked,
        'unsafe_scheduled_events',v_unsafe_scheduled,
        'runtime',v_race_runtime
      ),
      'champion_count',v_champion_count,
      'history_rows',v_history_count,
      'member_notifications_generated',v_fake_notifications,
      'rollback_mode',true,
      'summary',format(
        'Synthetic %s-association World Nations lifecycle reached one champion and %s final-history rows; all fixture writes will now be rolled back.',
        v_count,v_history_count
      )
    );

    raise exception using
      errcode='Z0001',
      message='WORLD_NATIONS_E2E_FIXTURE_ROLLBACK';
  exception
    when sqlstate 'Z0001' then
      null;
    when others then
      v_error:=sqlerrm;
      v_report:=jsonb_build_object(
        'status','fail',
        'association_count',v_count,
        'error',v_error,
        'rollback_mode',true,
        'summary','Synthetic World Nations fixture failed; all fixture writes were rolled back.'
      );
  end;

  select count(*)::integer into v_leaked_users
  from auth.users
  where email like 'ppm-e2e-'||v_fixture_token||'-%@example.invalid';

  select count(*)::integer into v_leaked_associations
  from public.national_associations
  where name like 'E2E '||v_fixture_token||' %';

  if v_leaked_users<>0 or v_leaked_associations<>0 then
    return v_report||jsonb_build_object(
      'status','fail',
      'cleanup_check',jsonb_build_object(
        'leaked_users',v_leaked_users,
        'leaked_associations',v_leaked_associations
      ),
      'summary','Fixture cleanup check failed.'
    );
  end if;

  return v_report||jsonb_build_object(
    'cleanup_check',jsonb_build_object(
      'leaked_users',0,
      'leaked_associations',0
    )
  );
end;
$function$
;

revoke all on function private.run_nations_e2e_fixture_core_v1(integer)
from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_admin_nations_e2e_fixture_v1(p_association_count integer DEFAULT 48)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  return private.run_nations_e2e_fixture_core_v1(p_association_count);
end;
$function$
;

revoke all on function public.run_admin_nations_e2e_fixture_v1(integer)
from public,anon;
grant execute on function public.run_admin_nations_e2e_fixture_v1(integer)
to authenticated;
