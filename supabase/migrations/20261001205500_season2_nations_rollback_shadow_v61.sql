-- Rollback-only Season 2 National Association / World Nations shadow simulation.
-- This intentionally mutates the game clock and synthetic fixture state only inside
-- a PL/pgSQL subtransaction, then raises a private rollback signal before returning.
-- Live sessions never observe the uncommitted shadow state.

create or replace function private.run_season2_nations_shadow_core_v1(
  p_association_count integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_target_count integer:=greatest(16,least(coalesce(p_association_count,50),64));
  v_token text:=substr(replace(gen_random_uuid()::text,'-',''),1,12);
  v_live_state jsonb;
  v_live_assoc_count integer;
  v_live_user_count integer;
  v_transition_start jsonb;
  v_transition_end jsonb;
  v_elections integer:=0;
  v_terms integer:=0;
  v_eligible_min integer:=0;
  v_eligible_max integer:=0;
  v_edition_id uuid;
  v_created jsonb;
  v_schedule jsonb;
  v_hosts1 jsonb;
  v_hosts2 jsonb;
  v_first_round uuid;
  v_group_count integer:=0;
  v_group_min integer:=0;
  v_group_max integer:=0;
  v_finalists integer:=0;
  v_top10_min integer:=0;
  v_top10_max integer:=0;
  v_champion_count integer:=0;
  v_history_count integer:=0;
  v_standing_count integer:=0;
  v_standing_history_count integer:=0;
  v_host_mutations integer:=0;
  v_report jsonb:='{}'::jsonb;
  v_error text;
  v_leaked_users integer:=0;
  v_leaked_associations integer:=0;
  v_clock_after jsonb;
  r record;
  m record;
  v_election_id uuid;
  v_candidate_id uuid;
  v_result jsonb;
begin
  select to_jsonb(gs),count(*) over()
  into v_live_state,v_live_assoc_count
  from public.game_state gs
  cross join lateral (select count(*) from public.national_associations) x
  where gs.id=true;

  select count(*) into v_live_user_count from auth.users;

  begin
    -- Exercise the real Season 1 -> Season 2 Association migration contract.
    v_transition_start:=public.run_national_association_season_transition_v1(
      gen_random_uuid(),1,2
    );

    update public.game_state
    set season_number=2,month_number=1,day_number=1,hour_number=0,minute_number=0,is_paused=true
    where id=true;

    create temporary table pg_temp._s2_associations(
      id uuid primary key,
      idx integer not null,
      country_code text not null,
      synthetic boolean not null default false
    ) on commit drop;

    insert into pg_temp._s2_associations(id,idx,country_code,synthetic)
    select a.id,row_number() over(order by a.country_code)::int,upper(a.country_code),false
    from public.national_associations a
    where a.status='active'
    order by a.country_code
    limit v_target_count;

    if (select count(*) from pg_temp._s2_associations)<v_target_count then
      insert into pg_temp._s2_associations(id,idx,country_code,synthetic)
      select gen_random_uuid(),
             (select count(*) from pg_temp._s2_associations)+row_number() over(order by x.country_code)::int,
             x.country_code,true
      from (
        select distinct upper(c.country_code) country_code
        from public.clubs c
        where c.deleted_at is null
          and public.is_national_team_club_v1(c.id)
          and not exists(
            select 1 from pg_temp._s2_associations a
            where a.country_code=upper(c.country_code)
          )
        order by 1
        limit v_target_count-(select count(*) from pg_temp._s2_associations)
      ) x;
    end if;

    if (select count(*) from pg_temp._s2_associations)<>v_target_count then
      raise exception 'Could not assemble % shadow associations.',v_target_count;
    end if;

    insert into public.national_associations(
      id,country_code,name,status,created_by_user_id,
      created_on_game_date,activated_on_game_date,last_status_change_on_game_date,
      renewal_paid_through_season
    )
    select a.id,a.country_code,
           'S2 Shadow '||v_token||' '||a.country_code||' National Association',
           'active','59e42a26-34c6-4ae0-955a-462b58a44274'::uuid,
           public.game_date_from_parts(2,1,1),
           public.game_date_from_parts(2,1,1),
           public.game_date_from_parts(2,1,1),2
    from pg_temp._s2_associations a
    where a.synthetic;

    insert into public.national_association_race_team_identities(
      association_id,country_code,technical_club_id,identity_source
    )
    select a.id,a.country_code,nt.id,'existing_national_team_pool'
    from pg_temp._s2_associations a
    join lateral (
      select c.id
      from public.clubs c
      where upper(c.country_code)=a.country_code
        and c.deleted_at is null
        and public.is_national_team_club_v1(c.id)
      order by c.id limit 1
    ) nt on true
    on conflict(association_id) do nothing;

    -- For the shadow election every association gets exactly five genuinely
    -- eligible managers. Existing test memberships are temporarily made
    -- ineligible inside the rollback scope so this also verifies the eligibility rule.
    update public.national_association_memberships m
    set status='ineligible',updated_at=now()
    where m.association_id in (select id from pg_temp._s2_associations)
      and m.status='active';

    create temporary table pg_temp._s2_member_clubs as
    with clubs as (
      select c.id,
             row_number() over(order by c.id)::int rn
      from public.clubs c
      where c.deleted_at is null
        and c.club_type='main'
        and c.is_ai=true
        and c.is_active=true
        and not public.is_national_team_club_v1(c.id)
      order by c.id
      limit v_target_count*5
    )
    select a.id association_id,a.idx,a.country_code,g.member_no,c.id club_id,
           gen_random_uuid() user_id
    from pg_temp._s2_associations a
    cross join generate_series(1,5) g(member_no)
    join clubs c on c.rn=((a.idx-1)*5)+g.member_no;

    if (select count(*) from pg_temp._s2_member_clubs)<>v_target_count*5 then
      raise exception 'Not enough AI main clubs for % five-member shadow associations.',v_target_count;
    end if;

    insert into auth.users(
      id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
      is_sso_user,is_anonymous
    )
    select user_id,'authenticated','authenticated',
           'ppm-s2-shadow-'||v_token||'-'||idx||'-'||member_no||'@example.invalid',
           '',now(),
           jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
           jsonb_build_object('username','s2_shadow_'||idx||'_'||member_no),
           now(),now(),false,false
    from pg_temp._s2_member_clubs;

    update public.clubs c
    set owner_user_id=m.user_id,
        is_ai=false,is_active=true,inactivity_status='active',
        country_code=m.country_code,updated_at=now()
    from pg_temp._s2_member_clubs m
    where c.id=m.club_id;

    insert into public.national_association_memberships(
      association_id,user_id,club_id,status,coach_eligible,joined_on_game_date
    )
    select association_id,user_id,club_id,'active',true,public.game_date_from_parts(2,1,1)
    from pg_temp._s2_member_clubs;

    select min(x.cnt),max(x.cnt)
    into v_eligible_min,v_eligible_max
    from (
      select a.id,count(*)::int cnt
      from pg_temp._s2_associations a
      join pg_temp._s2_member_clubs m on m.association_id=a.id
      where private.national_association_member_is_eligible_v1(a.id,m.user_id)
      group by a.id
    ) x;

    if v_eligible_min<>5 or v_eligible_max<>5 then
      raise exception 'Association eligibility failed: min %, max %.',v_eligible_min,v_eligible_max;
    end if;

    -- Jan 1: one candidate per country.
    create temporary table pg_temp._s2_elections(
      association_id uuid primary key,
      election_id uuid,
      candidate_id uuid,
      candidate_user_id uuid,
      voter_user_id uuid
    ) on commit drop;

    for r in select * from pg_temp._s2_associations order by idx loop
      v_election_id:=public.ensure_national_coach_election_v1(r.id,2);

      select user_id into m
      from pg_temp._s2_member_clubs
      where association_id=r.id and member_no=1;

      perform set_config('request.jwt.claim.sub',m.user_id::text,true);
      v_candidate_id:=public.register_national_coach_candidate_v1(
        v_election_id,
        'Season 2 shadow candidate: national-team selection, preparation and World Nations management.'
      );

      insert into pg_temp._s2_elections(
        association_id,election_id,candidate_id,candidate_user_id,voter_user_id
      )
      select r.id,v_election_id,v_candidate_id,
             c1.user_id,c2.user_id
      from pg_temp._s2_member_clubs c1
      join pg_temp._s2_member_clubs c2 on c2.association_id=c1.association_id
      where c1.association_id=r.id and c1.member_no=1 and c2.member_no=2;
    end loop;

    update public.game_state set day_number=10,hour_number=12 where id=true;

    for r in select * from pg_temp._s2_elections loop
      perform public.process_national_coach_election_v1(r.election_id);
      perform set_config('request.jwt.claim.sub',r.voter_user_id::text,true);
      perform public.cast_national_coach_vote_v1(r.election_id,r.candidate_id);
    end loop;

    update public.game_state set day_number=20,hour_number=12 where id=true;

    for r in select * from pg_temp._s2_elections loop
      v_result:=public.process_national_coach_election_v1(r.election_id);
      if coalesce(v_result->>'status','')<>'completed' then
        raise exception 'Election % did not complete: %',r.election_id,v_result::text;
      end if;
    end loop;

    select count(*)::int into v_elections
    from public.national_coach_elections e
    where e.season_number=2
      and e.association_id in (select id from pg_temp._s2_associations)
      and e.status='completed';

    select count(*)::int into v_terms
    from public.national_coach_terms t
    where t.season_number=2
      and t.association_id in (select id from pg_temp._s2_associations)
      and t.status='active';

    if v_elections<>v_target_count or v_terms<>v_target_count then
      raise exception 'Expected % completed elections/coach terms, found %/%.',
        v_target_count,v_elections,v_terms;
    end if;

    -- Jan 10 generation contract; running it on Jan 20 is idempotent catch-up.
    v_created:=public.create_nations_competition_edition_v1(2);
    v_edition_id:=(v_created->>'edition_id')::uuid;
    if v_edition_id is null then raise exception 'Season 2 World Nations edition missing.'; end if;

    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);
    v_hosts1:=public.assign_nations_event_hosts_v1(v_edition_id);

    create temporary table pg_temp._host_before as
    select g.id,g.host_country_code,g.host_association_id
    from public.nations_competition_groups g
    join public.nations_competition_rounds rr on rr.id=g.round_id
    where rr.edition_id=v_edition_id;

    v_hosts2:=public.assign_nations_event_hosts_v1(v_edition_id);

    select count(*)::int into v_host_mutations
    from pg_temp._host_before b
    join public.nations_competition_groups g on g.id=b.id
    where g.host_country_code is distinct from b.host_country_code
       or g.host_association_id is distinct from b.host_association_id;

    if v_host_mutations<>0 then
      raise exception 'World Nations host assignment changed after it had been fixed.';
    end if;

    select id into v_first_round
    from public.nations_competition_rounds
    where edition_id=v_edition_id and round_index=1;

    -- Deterministic synthetic previous-season standing values exercise Season 2
    -- snake seeding without changing the production standing tables.
    with ranked as (
      select id,row_number() over(order by country_code)::int rn
      from public.nations_competition_entries
      where edition_id=v_edition_id
    )
    update public.nations_competition_entries e
    set seed_score=10000-r.rn
    from ranked r where e.id=r.id;

    perform public.draw_nations_round_v1(v_first_round);

    select count(*)::int,min(g.planned_entrant_count),max(g.planned_entrant_count),
           sum(g.planned_advance_count)::int
    into v_group_count,v_group_min,v_group_max,v_finalists
    from public.nations_competition_groups g
    where g.round_id=v_first_round;

    if v_group_count<>ceil(v_target_count::numeric/16.0)::int
       or v_group_min<12 or v_group_max>16 or v_finalists<>16 then
      raise exception 'Season 2 group design invalid: groups %, sizes %–%, finalists %.',
        v_group_count,v_group_min,v_group_max,v_finalists;
    end if;

    with top10 as (
      select e.id
      from public.nations_competition_entries e
      where e.edition_id=v_edition_id
      order by e.seed_score desc,e.country_code
      limit 10
    ), by_group as (
      select nge.group_id,count(*)::int cnt
      from public.nations_group_entries nge
      join top10 t on t.id=nge.competition_entry_id
      group by nge.group_id
    )
    select min(cnt),max(cnt) into v_top10_min,v_top10_max from by_group;

    if v_top10_max-v_top10_min>1 then
      raise exception 'Top-10 Season 2 seeds were not evenly distributed.';
    end if;

    -- Complete every World Nations group/round deterministically. The existing
    -- race-engine E2E test separately exercises actual race calculation and the
    -- 7-rider field gate; this shadow validates the entire seasonal progression.
    for r in
      select * from public.nations_competition_rounds
      where edition_id=v_edition_id order by round_index
    loop
      if r.round_index>1 then perform public.draw_nations_round_v1(r.id); end if;

      for m in
        select * from public.nations_competition_groups
        where round_id=r.id order by group_number
      loop
        with ranked as (
          select nge.id,row_number() over(order by nge.seed_position,nge.id)::int rn
          from public.nations_group_entries nge
          where nge.group_id=m.id and nge.status<>'withdrawn'
        )
        update public.nations_group_entries nge
        set ttt_points=300-x.rn,
            flat_points=400-x.rn,
            mountain_points=300-x.rn,
            total_points=1000-(3*x.rn),
            race_wins=case when x.rn=1 then 2 when x.rn=2 then 1 else 0 end,
            podium_finishes=greatest(0,4-x.rn),
            ttt_rank=x.rn,best_day3_rider_rank=x.rn,updated_at=now()
        from ranked x where nge.id=x.id;

        v_result:=public.finalize_nations_group_v1(m.id);
        if coalesce(v_result->>'status','')<>'completed' then
          raise exception 'Group finalization failed: %',v_result::text;
        end if;
      end loop;

      v_result:=public.finalize_nations_round_v1(r.id);
      if r.round_type='world_final' then
        if coalesce(v_result->>'status','')<>'edition_completed' then
          raise exception 'World Nations Final failed: %',v_result::text;
        end if;
      elsif coalesce(v_result->>'status','')<>'completed' then
        raise exception 'Qualification round failed: %',v_result::text;
      end if;
    end loop;

    select count(*)::int into v_champion_count
    from public.nations_competition_entries
    where edition_id=v_edition_id and status='champion';

    select count(*)::int into v_history_count
    from public.nations_competition_history
    where edition_id=v_edition_id;

    select count(*)::int into v_standing_count
    from public.get_nations_team_standings_v1(2);

    if v_champion_count<>1 or v_history_count<>16 or v_standing_count<>v_target_count then
      raise exception 'Season end World Nations output invalid: champion %, history %, standings %.',
        v_champion_count,v_history_count,v_standing_count;
    end if;

    update public.game_state
    set month_number=12,day_number=31,hour_number=23,minute_number=0
    where id=true;

    v_transition_end:=public.run_national_association_season_transition_v1(
      gen_random_uuid(),2,3
    );

    select count(*)::int into v_standing_history_count
    from public.nations_team_standing_history h
    where h.snapshot_season=2
      and h.association_id in (select id from pg_temp._s2_associations);

    if v_standing_history_count<>v_target_count then
      raise exception 'Season 2 standing migration expected % snapshots, found %.',
        v_target_count,v_standing_history_count;
    end if;

    if exists(
      select 1 from public.national_coach_terms t
      where t.season_number=2
        and t.association_id in (select id from pg_temp._s2_associations)
        and t.status='active'
    ) then
      raise exception 'Season 2 coach terms remained active after Season 2 -> 3 migration.';
    end if;

    v_report:=jsonb_build_object(
      'status','pass',
      'mode','rollback_only_shadow',
      'season_1_to_2_transition',v_transition_start,
      'association_count',v_target_count,
      'eligible_members_per_association',jsonb_build_object('min',v_eligible_min,'max',v_eligible_max),
      'elections_completed',v_elections,
      'active_coach_terms_after_election',v_terms,
      'world_nations',jsonb_build_object(
        'edition_id',v_edition_id,
        'generation',v_created,
        'schedule',v_schedule,
        'hosts_first_assignment',v_hosts1,
        'hosts_second_assignment',v_hosts2,
        'host_mutations_after_lock',v_host_mutations,
        'qualification_groups',v_group_count,
        'qualification_group_size_min',v_group_min,
        'qualification_group_size_max',v_group_max,
        'total_advancers',v_finalists,
        'top10_seed_group_min',v_top10_min,
        'top10_seed_group_max',v_top10_max,
        'champion_count',v_champion_count,
        'final_history_rows',v_history_count,
        'standing_rows',v_standing_count
      ),
      'season_2_to_3_transition',v_transition_end,
      'standing_history_rows',v_standing_history_count,
      'summary','Season 2 National Association / World Nations shadow lifecycle completed through election, seeding, host lock, qualification, final, champion, standings and next-season reset.'
    );

    raise exception using errcode='Z1001',message='__S2_NATIONS_SHADOW_ROLLBACK__';
  exception
    when sqlstate 'Z1001' then null;
    when others then
      v_error:=sqlerrm;
      v_report:=jsonb_build_object(
        'status','fail','mode','rollback_only_shadow','error',v_error,
        'summary','Season 2 National Association / World Nations shadow lifecycle failed and was rolled back.'
      );
  end;

  select to_jsonb(gs) into v_clock_after
  from public.game_state gs where gs.id=true;

  select count(*)::int into v_leaked_users
  from auth.users
  where email like 'ppm-s2-shadow-'||v_token||'-%@example.invalid';

  select count(*)::int into v_leaked_associations
  from public.national_associations
  where name like 'S2 Shadow '||v_token||' %';

  return v_report||jsonb_build_object(
    'rollback_verified',
      v_clock_after=v_live_state
      and v_leaked_users=0
      and v_leaked_associations=0,
    'live_game_state_before',v_live_state,
    'live_game_state_after',v_clock_after,
    'cleanup',jsonb_build_object(
      'leaked_users',v_leaked_users,
      'leaked_associations',v_leaked_associations
    )
  );
end;
$function$;

revoke all on function private.run_season2_nations_shadow_core_v1(integer)
from public,anon,authenticated;

create or replace function public.run_admin_season2_nations_shadow_v1(
  p_association_count integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;
  return private.run_season2_nations_shadow_core_v1(p_association_count);
end;
$function$;

revoke all on function public.run_admin_season2_nations_shadow_v1(integer)
from public,anon;
grant execute on function public.run_admin_season2_nations_shadow_v1(integer) to authenticated;
