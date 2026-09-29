-- 1) Canonical race-application deadline policy.
create or replace function public.calculate_race_application_deadlines_v1(
  p_race_start_season_number integer,
  p_race_start_month_number integer,
  p_race_start_day_number integer
)
returns table(
  applications_open_season_number integer,
  applications_open_month_number integer,
  applications_open_day_number integer,
  applications_close_season_number integer,
  applications_close_month_number integer,
  applications_close_day_number integer,
  team_list_announcement_season_number integer,
  team_list_announcement_month_number integer,
  team_list_announcement_day_number integer,
  rider_submission_deadline_season_number integer,
  rider_submission_deadline_month_number integer,
  rider_submission_deadline_day_number integer,
  ai_fill_deadline_season_number integer,
  ai_fill_deadline_month_number integer,
  ai_fill_deadline_day_number integer,
  deadline_policy text
)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_start_ordinal integer;
  v_season_start_ordinal integer;
  v_open_ordinal integer;
  v_close_ordinal integer;
  v_team_list_ordinal integer;
  v_rider_deadline_ordinal integer;
  v_ai_fill_ordinal integer;
  v_open record;
  v_close record;
  v_team_list record;
  v_rider record;
  v_ai record;
begin
  v_start_ordinal := public.game_date_ordinal_v1(
    p_race_start_season_number,
    p_race_start_month_number,
    p_race_start_day_number
  );
  v_season_start_ordinal := public.game_date_ordinal_v1(
    p_race_start_season_number, 1, 1
  );

  if p_race_start_month_number = 1 and p_race_start_day_number <= 15 then
    v_open_ordinal := v_season_start_ordinal;
    v_close_ordinal := greatest(v_season_start_ordinal, v_start_ordinal - 1);
    v_team_list_ordinal := v_close_ordinal;
    v_rider_deadline_ordinal := v_start_ordinal;
    v_ai_fill_ordinal := v_close_ordinal;
    deadline_policy := 'january_early_extended';
  elsif p_race_start_month_number = 1 then
    v_open_ordinal := v_season_start_ordinal;
    v_close_ordinal := greatest(v_season_start_ordinal, v_start_ordinal - 3);
    v_team_list_ordinal := v_close_ordinal;
    v_rider_deadline_ordinal := greatest(v_close_ordinal, v_start_ordinal - 1);
    v_ai_fill_ordinal := v_close_ordinal;
    deadline_policy := 'january_late_3day';
  else
    v_open_ordinal := greatest(v_season_start_ordinal, v_start_ordinal - 60);
    v_close_ordinal := greatest(v_open_ordinal, v_start_ordinal - 7);
    v_team_list_ordinal := v_close_ordinal;
    v_rider_deadline_ordinal := greatest(v_close_ordinal, v_start_ordinal - 3);
    v_ai_fill_ordinal := v_close_ordinal;
    deadline_policy := 'standard_60_7_3';
  end if;

  select * into v_open from public.game_date_parts_from_ordinal_v1(v_open_ordinal);
  select * into v_close from public.game_date_parts_from_ordinal_v1(v_close_ordinal);
  select * into v_team_list from public.game_date_parts_from_ordinal_v1(v_team_list_ordinal);
  select * into v_rider from public.game_date_parts_from_ordinal_v1(v_rider_deadline_ordinal);
  select * into v_ai from public.game_date_parts_from_ordinal_v1(v_ai_fill_ordinal);

  applications_open_season_number := v_open.season_number;
  applications_open_month_number := v_open.month_number;
  applications_open_day_number := v_open.day_number;
  applications_close_season_number := v_close.season_number;
  applications_close_month_number := v_close.month_number;
  applications_close_day_number := v_close.day_number;
  team_list_announcement_season_number := v_team_list.season_number;
  team_list_announcement_month_number := v_team_list.month_number;
  team_list_announcement_day_number := v_team_list.day_number;
  rider_submission_deadline_season_number := v_rider.season_number;
  rider_submission_deadline_month_number := v_rider.month_number;
  rider_submission_deadline_day_number := v_rider.day_number;
  ai_fill_deadline_season_number := v_ai.season_number;
  ai_fill_deadline_month_number := v_ai.month_number;
  ai_fill_deadline_day_number := v_ai.day_number;
  return next;
end;
$$;

create or replace function public.compute_race_application_window_season_v3(
  p_race_season_number integer,
  p_race_start_month_number integer,
  p_race_start_day_number integer
)
returns table(
  applications_open_season_number integer,
  applications_open_month_number integer,
  applications_open_day_number integer,
  applications_close_season_number integer,
  applications_close_month_number integer,
  applications_close_day_number integer,
  application_window_policy text
)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  d record;
begin
  select * into d
  from public.calculate_race_application_deadlines_v1(
    p_race_season_number,
    p_race_start_month_number,
    p_race_start_day_number
  );

  applications_open_season_number := d.applications_open_season_number;
  applications_open_month_number := d.applications_open_month_number;
  applications_open_day_number := d.applications_open_day_number;
  applications_close_season_number := d.applications_close_season_number;
  applications_close_month_number := d.applications_close_month_number;
  applications_close_day_number := d.applications_close_day_number;
  application_window_policy := case
    when d.applications_open_season_number = p_race_season_number
     and d.applications_open_month_number = 1
     and d.applications_open_day_number = 1
      then 'season_start_clamped'
    else 'standard_90_3'
  end;
  return next;
end;
$$;

create or replace function public.compute_race_application_window_v2(
  p_race_start_date date,
  p_race_season_number integer
)
returns table(
  applications_open_game_date date,
  applications_close_game_date date,
  applications_open_season_number integer,
  applications_open_month_number integer,
  applications_open_day_number integer,
  applications_close_season_number integer,
  applications_close_month_number integer,
  applications_close_day_number integer,
  race_start_month_number integer,
  race_start_day_number integer,
  application_window_policy text
)
language plpgsql
stable
set search_path to 'public'
as $$
declare
  d record;
begin
  if p_race_start_date is null then
    raise exception 'Race start date cannot be null';
  end if;
  if p_race_season_number is null or p_race_season_number < 1 then
    raise exception 'Race season number must be >= 1';
  end if;

  select * into d
  from public.compute_race_application_window_season_v3(
    p_race_season_number,
    extract(month from p_race_start_date)::integer,
    extract(day from p_race_start_date)::integer
  );

  applications_open_game_date := make_date(
    1999 + d.applications_open_season_number,
    d.applications_open_month_number,
    d.applications_open_day_number
  );
  applications_close_game_date := make_date(
    1999 + d.applications_close_season_number,
    d.applications_close_month_number,
    d.applications_close_day_number
  );
  applications_open_season_number := d.applications_open_season_number;
  applications_open_month_number := d.applications_open_month_number;
  applications_open_day_number := d.applications_open_day_number;
  applications_close_season_number := d.applications_close_season_number;
  applications_close_month_number := d.applications_close_month_number;
  applications_close_day_number := d.applications_close_day_number;
  race_start_month_number := extract(month from p_race_start_date)::integer;
  race_start_day_number := extract(day from p_race_start_date)::integer;
  application_window_policy := d.application_window_policy;
  return next;
end;
$$;

create or replace function public.process_race_application_preselection_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current record;
  v_today_ordinal integer;
  r record;
  v_target integer;
  v_human_count integer;
  v_provisional integer := 0;
  v_reserves integer := 0;
  v_declined integer := 0;
  v_processed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  select * into v_current
  from public.get_current_game_date_parts()
  limit 1;
  if not found then
    return jsonb_build_object('success', false, 'error', 'current_game_date_not_found');
  end if;

  v_today_ordinal := public.game_date_ordinal_v1(
    v_current.season_number,
    v_current.month_number,
    v_current.day_number
  );

  for r in
    select race.id as race_id,race.name as race_name,race.start_date,
           rules.target_teams,rules.min_teams,rules.max_teams,
           rules.team_list_announcement_season_number,
           rules.team_list_announcement_month_number,
           rules.team_list_announcement_day_number
    from public.races race
    join public.race_entry_rules rules on rules.race_id=race.id
    where race.status='scheduled'
      and extract(year from race.start_date)::integer-1999=v_current.season_number
      and extract(month from race.start_date)::integer>=2
      and public.game_date_ordinal_v1(
            extract(year from race.start_date)::integer-1999,
            extract(month from race.start_date)::integer,
            extract(day from race.start_date)::integer
          ) - 30 <= v_today_ordinal
      and public.game_date_ordinal_v1(
            rules.team_list_announcement_season_number,
            rules.team_list_announcement_month_number,
            rules.team_list_announcement_day_number
          ) > v_today_ordinal
      and lower(coalesce(race.metadata->>'application_preselection_completed','false')) not in ('true','1','yes')
    order by race.start_date,race.name
  loop
    v_target := coalesce(r.target_teams,r.min_teams,r.max_teams,16);

    update public.race_team_entries e
    set commitment_score_snapshot=coalesce(
          e.commitment_score_snapshot,
          public.get_or_create_club_race_commitment_score_v1(e.club_id)
        ),
        acceptance_score=coalesce(
          e.acceptance_score,
          coalesce(
            e.commitment_score_snapshot,
            public.get_or_create_club_race_commitment_score_v1(e.club_id),
            50
          ) + (random()*10)
        ),
        updated_at=now()
    where e.race_id=r.race_id
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted');

    select count(*)::integer into v_human_count
    from public.race_team_entries e
    where e.race_id=r.race_id
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted');

    v_provisional:=0;
    v_reserves:=0;
    v_declined:=0;

    if v_human_count > v_target + 2 then
      with ranked as (
        select e.id,row_number() over(
          order by coalesce(e.acceptance_score,0) desc,e.created_at asc,e.id
        ) rn
        from public.race_team_entries e
        where e.race_id=r.race_id
          and coalesce(e.is_ai_filler,false)=false
          and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
          and e.status in ('applied','under_review','provisionally_accepted')
      ), changed as (
        update public.race_team_entries e
        set status=case
              when ranked.rn<=v_target then 'provisionally_accepted'
              when ranked.rn<=v_target+2 then 'under_review'
              else 'declined'
            end,
            review_round=1,
            reviewed_at=now(),
            final_decision_at=case when ranked.rn>v_target+2 then now() else null end,
            decision_reason=case
              when ranked.rn<=v_target then
                'Provisionally selected in the 30-day preliminary race application review. Final confirmation occurs when applications close.'
              when ranked.rn<=v_target+2 then
                'Reserve #'||(ranked.rn-v_target)::text||' after the 30-day preliminary race application review.'
              else
                'Declined in the 30-day preliminary race application review because the team ranked outside the target field plus two reserves.'
            end,
            updated_at=now()
        from ranked
        where e.id=ranked.id
        returning e.status,e.decision_reason
      )
      select count(*) filter(where status='provisionally_accepted')::integer,
             count(*) filter(where status='under_review' and decision_reason like 'Reserve #%')::integer,
             count(*) filter(where status='declined')::integer
      into v_provisional,v_reserves,v_declined
      from changed;
    end if;

    update public.races
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'application_preselection_completed',true,
          'application_preselection_completed_at',now(),
          'application_preselection_game_date',public.game_date_display_v1(
            v_current.season_number,v_current.month_number,v_current.day_number
          ),
          'application_preselection_target_teams',v_target,
          'application_preselection_reserve_slots',2,
          'application_preselection_human_applicants',v_human_count,
          'application_preselection_provisional',v_provisional,
          'application_preselection_reserves',v_reserves,
          'application_preselection_declined',v_declined
        ),
        updated_at=now()
    where id=r.race_id;

    v_processed:=v_processed+1;
    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'race_id',r.race_id,'race_name',r.race_name,'target_teams',v_target,
      'human_applicants',v_human_count,'provisional',v_provisional,
      'reserves',v_reserves,'declined',v_declined
    ));
  end loop;

  return jsonb_build_object('success',true,'processed_races',v_processed,'results',v_results);
end;
$$;

create or replace function public.review_race_applications_v1(
  p_race_id uuid,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_race record;
  v_rule record;
  v_current record;
  v_today_ordinal integer;
  v_team_list_ordinal integer;
  v_target_teams integer;
  v_existing_accepted integer;
  v_available_slots integer;
  v_provisional_accepted integer:=0;
  v_new_accepted integer:=0;
  v_new_declined integer:=0;
begin
  perform * from public.recalculate_race_entry_deadlines_v1(p_race_id);
  select * into v_race from public.races where id=p_race_id;
  if not found then return jsonb_build_object('success',false,'error','race_not_found'); end if;
  select * into v_rule from public.race_entry_rules where race_id=p_race_id limit 1;
  if not found then return jsonb_build_object('success',false,'error','race_entry_rules_not_found'); end if;
  select * into v_current from public.get_current_game_date_parts() limit 1;

  v_today_ordinal:=public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);
  v_team_list_ordinal:=public.game_date_ordinal_v1(
    v_rule.team_list_announcement_season_number,
    v_rule.team_list_announcement_month_number,
    v_rule.team_list_announcement_day_number
  );
  if not p_force and v_today_ordinal<v_team_list_ordinal then
    return jsonb_build_object(
      'success',false,'error','review_not_due_yet',
      'current_game_date',public.game_date_display_v1(v_current.season_number,v_current.month_number,v_current.day_number),
      'team_list_announcement',public.game_date_display_v1(
        v_rule.team_list_announcement_season_number,
        v_rule.team_list_announcement_month_number,
        v_rule.team_list_announcement_day_number
      )
    );
  end if;

  v_target_teams:=coalesce(v_rule.target_teams,v_rule.min_teams,v_rule.max_teams,16);

  update public.race_team_entries e
  set commitment_score_snapshot=coalesce(
        e.commitment_score_snapshot,
        public.get_or_create_club_race_commitment_score_v1(e.club_id)
      ),
      acceptance_score=coalesce(
        e.acceptance_score,
        coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id),50)+(random()*10)
      ),
      reviewed_at=now(),updated_at=now()
  where e.race_id=p_race_id
    and coalesce(e.is_ai_filler,false)=false
    and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
    and e.status in ('applied','under_review','provisionally_accepted');

  select count(*)::integer into v_existing_accepted
  from public.race_team_entries where race_id=p_race_id and status='accepted';
  v_available_slots:=greatest(0,v_target_teams-coalesce(v_existing_accepted,0));

  with ranked as (
    select e.id,row_number() over(order by coalesce(e.acceptance_score,0) desc,e.created_at asc,e.id) rn
    from public.race_team_entries e
    where e.race_id=p_race_id and e.status='provisionally_accepted' and coalesce(e.is_ai_filler,false)=false
  ), changed as (
    update public.race_team_entries e
    set status=case when ranked.rn<=v_available_slots then 'accepted' else 'under_review' end,
        review_round=2,reviewed_at=now(),
        final_decision_at=case when ranked.rn<=v_available_slots then now() else null end,
        decision_reason=case
          when ranked.rn<=v_available_slots then 'Accepted from the protected preliminary race field at final review.'
          else 'Moved to the final reserve pool because the target field was already filled.'
        end,
        updated_at=now()
    from ranked where e.id=ranked.id returning e.status
  )
  select count(*) filter(where status='accepted')::integer into v_provisional_accepted from changed;

  select count(*)::integer into v_existing_accepted
  from public.race_team_entries where race_id=p_race_id and status='accepted';
  v_available_slots:=greatest(0,v_target_teams-coalesce(v_existing_accepted,0));

  with candidates as (
    select e.id,row_number() over(
      order by case
        when coalesce(e.review_round,0)=1 and coalesce(e.decision_reason,'') like 'Reserve #%' then 0 else 1 end,
        coalesce(e.acceptance_score,0) desc,e.created_at asc,e.id
    ) selection_rank
    from public.race_team_entries e
    where e.race_id=p_race_id
      and e.status in ('applied','under_review')
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
  ), changed as (
    update public.race_team_entries e
    set status=case when c.selection_rank<=v_available_slots then 'accepted' else 'declined' end,
        review_round=2,reviewed_at=now(),final_decision_at=now(),
        decision_reason=case
          when c.selection_rank<=v_available_slots then 'Accepted by final race application review after protected preliminary teams.'
          else 'Declined by final race application review because the target race field was filled.'
        end,
        updated_at=now()
    from candidates c where e.id=c.id returning e.status
  )
  select count(*) filter(where status='accepted')::integer,
         count(*) filter(where status='declined')::integer
  into v_new_accepted,v_new_declined from changed;

  return jsonb_build_object(
    'success',true,'race_id',p_race_id,'race_name',v_race.name,
    'target_teams',v_target_teams,
    'existing_accepted_before_review',coalesce(v_existing_accepted,0)-coalesce(v_new_accepted,0),
    'provisional_accepted',coalesce(v_provisional_accepted,0),
    'new_accepted_from_reserve_or_late_pool',coalesce(v_new_accepted,0),
    'new_declined',coalesce(v_new_declined,0),
    'message','Race applications reviewed using protected D-30 preliminary field and final target-team selection.'
  );
end;
$$;

create or replace function public.submit_race_application_v1(
  p_race_id uuid,
  p_club_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_club_id uuid;
  v_race record;
  v_rule record;
  v_current record;
  v_today_ordinal integer;
  v_open_ordinal integer;
  v_close_ordinal integer;
  v_score integer;
  v_existing record;
  v_entry_id uuid;
begin
  v_club_id:=p_club_id;
  if v_club_id is null then select public.get_my_primary_club_id() into v_club_id; end if;
  if v_club_id is null then return jsonb_build_object('success',false,'error','club_not_found'); end if;
  select * into v_race from public.races where id=p_race_id;
  if not found then return jsonb_build_object('success',false,'error','race_not_found'); end if;
  perform * from public.recalculate_race_entry_deadlines_v1(p_race_id);
  select * into v_rule from public.race_entry_rules where race_id=p_race_id limit 1;
  if not found then return jsonb_build_object('success',false,'error','race_entry_rules_not_found'); end if;
  select * into v_current from public.get_current_game_date_parts() limit 1;
  v_today_ordinal:=public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);
  v_open_ordinal:=public.game_date_ordinal_v1(v_rule.applications_open_season_number,v_rule.applications_open_month_number,v_rule.applications_open_day_number);
  v_close_ordinal:=public.game_date_ordinal_v1(v_rule.applications_close_season_number,v_rule.applications_close_month_number,v_rule.applications_close_day_number);
  if v_today_ordinal<v_open_ordinal then
    return jsonb_build_object('success',false,'error','applications_not_open_yet','applications_open',public.game_date_display_v1(
      v_rule.applications_open_season_number,v_rule.applications_open_month_number,v_rule.applications_open_day_number));
  end if;
  if v_today_ordinal>=v_close_ordinal then
    return jsonb_build_object('success',false,'error','applications_closed','applications_close',public.game_date_display_v1(
      v_rule.applications_close_season_number,v_rule.applications_close_month_number,v_rule.applications_close_day_number));
  end if;
  select * into v_existing from public.race_team_entries where race_id=p_race_id and club_id=v_club_id limit 1;
  if found then return jsonb_build_object('success',false,'error','application_already_exists','status',v_existing.status); end if;
  v_score:=public.get_or_create_club_race_commitment_score_v1(v_club_id);
  insert into public.race_team_entries(
    race_id,club_id,status,commitment_score_snapshot,decision_reason,created_at,updated_at
  ) values(
    p_race_id,v_club_id,'under_review',v_score,
    case
      when lower(coalesce(v_race.metadata->>'application_preselection_completed','false')) in ('true','1','yes')
        then 'Application received after the 30-day preliminary review. This team is in the late waitlist pool and cannot displace protected provisional teams.'
      else 'Application received. Final decision will be made by the race application review process.'
    end,
    now(),now()
  ) returning id into v_entry_id;
  return jsonb_build_object(
    'success',true,'race_id',p_race_id,'club_id',v_club_id,'race_team_entry_id',v_entry_id,
    'status','under_review','race_commitment_score',v_score,
    'preselection_already_completed',lower(coalesce(v_race.metadata->>'application_preselection_completed','false')) in ('true','1','yes'),
    'message','Race application submitted.'
  );
end;
$$;

insert into public.notification_types(code,name,source,icon_name,priority,is_active,preference_group)
values
  ('RACE_APPLICATION_WINDOW_OPEN','Race applications opened','game','calendar',2,true,'raceApplicationResults'),
  ('RACE_APPLICATION_CLOSING_SOON','Race applications closing soon','game','calendar',2,true,'raceApplicationResults'),
  ('RACE_APPLICATION_RULE_CHANGE','Race application rules updated','game','calendar',3,true,'raceApplicationResults')
on conflict(code) do update set
  name=excluded.name,source=excluded.source,icon_name=excluded.icon_name,
  priority=excluded.priority,is_active=true,preference_group=excluded.preference_group;

create or replace function public.process_race_application_window_notifications_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current record;
  v_today_ordinal integer;
  v_open_count integer:=0;
  v_closing_count integer:=0;
  v_open_names text:=null;
  v_closing_names text:=null;
  v_users integer:=0;
  u record;
begin
  select * into v_current from public.get_current_game_date_parts() limit 1;
  if not found then return jsonb_build_object('success',false,'error','current_game_date_not_found'); end if;
  v_today_ordinal:=public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);

  select string_agg(name,', ' order by name) into v_open_names
  from (
    select r.name from public.races r join public.race_entry_rules rer on rer.race_id=r.id
    where r.status='scheduled'
      and public.game_date_ordinal_v1(rer.applications_open_season_number,rer.applications_open_month_number,rer.applications_open_day_number)=v_today_ordinal
      and public.game_date_ordinal_v1(extract(year from r.start_date)::integer-1999,extract(month from r.start_date)::integer,extract(day from r.start_date)::integer)>v_today_ordinal
    order by r.name limit 5
  ) x;
  select count(*)::integer into v_open_count
  from public.races r join public.race_entry_rules rer on rer.race_id=r.id
  where r.status='scheduled'
    and public.game_date_ordinal_v1(rer.applications_open_season_number,rer.applications_open_month_number,rer.applications_open_day_number)=v_today_ordinal
    and public.game_date_ordinal_v1(extract(year from r.start_date)::integer-1999,extract(month from r.start_date)::integer,extract(day from r.start_date)::integer)>v_today_ordinal;

  select string_agg(name,', ' order by name) into v_closing_names
  from (
    select r.name from public.races r join public.race_entry_rules rer on rer.race_id=r.id
    where r.status='scheduled' and rer.applications_status='open'
      and public.game_date_ordinal_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)=v_today_ordinal+3
    order by r.name limit 5
  ) x;
  select count(*)::integer into v_closing_count
  from public.races r join public.race_entry_rules rer on rer.race_id=r.id
  where r.status='scheduled' and rer.applications_status='open'
    and public.game_date_ordinal_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)=v_today_ordinal+3;

  for u in
    select distinct c.owner_user_id user_id from public.clubs c
    where c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and c.deleted_at is null
  loop
    v_users:=v_users+1;
    if v_current.month_number=1 and v_current.day_number=15 then
      perform public.create_user_game_notification_v1(
        u.user_id,'RACE_APPLICATION_RULE_CHANGE','Race application deadlines are changing',
        'Late-January races now close 3 days before the start. From February onward, applications close 7 days before each race. Review the February calendar now and apply early for the races you want to enter.',
        '/dashboard/calendar',jsonb_build_object(
          'season_number',v_current.season_number,
          'rule','january_16_31_close_d3_february_onward_close_d7',
          'preference_group','raceApplicationResults'
        ),format('race_application_rule_change:s%s:jan15:%s',v_current.season_number,u.user_id),null
      );
    end if;
    if v_open_count>0 then
      perform public.create_user_game_notification_v1(
        u.user_id,'RACE_APPLICATION_WINDOW_OPEN','New race applications are open',
        format('%s upcoming race application window%s opened today%s. Review the Calendar and apply before the deadlines.',
          v_open_count,case when v_open_count=1 then '' else 's' end,
          case when coalesce(v_open_names,'')='' then '' else ': '||v_open_names end),
        '/dashboard/calendar',jsonb_build_object(
          'season_number',v_current.season_number,'month_number',v_current.month_number,'day_number',v_current.day_number,
          'opened_count',v_open_count,'sample_races',v_open_names,'preference_group','raceApplicationResults'
        ),format('race_application_windows_open:s%s:%s:%s:%s',v_current.season_number,v_current.month_number,v_current.day_number,u.user_id),null
      );
    end if;
    if v_closing_count>0 then
      perform public.create_user_game_notification_v1(
        u.user_id,'RACE_APPLICATION_CLOSING_SOON','Race applications close in 3 days',
        format('Applications for %s race%s close in 3 days%s. Review the Calendar now if you still want to enter.',
          v_closing_count,case when v_closing_count=1 then '' else 's' end,
          case when coalesce(v_closing_names,'')='' then '' else ': '||v_closing_names end),
        '/dashboard/calendar',jsonb_build_object(
          'season_number',v_current.season_number,'month_number',v_current.month_number,'day_number',v_current.day_number,
          'closing_count',v_closing_count,'sample_races',v_closing_names,'preference_group','raceApplicationResults'
        ),format('race_application_closing_soon:s%s:%s:%s:%s',v_current.season_number,v_current.month_number,v_current.day_number,u.user_id),null
      );
    end if;
  end loop;
  return jsonb_build_object('success',true,'users_checked',v_users,'opened_today',v_open_count,'closing_in_3_days',v_closing_count,
    'rule_change_due',v_current.month_number=1 and v_current.day_number=15);
end;
$$;

alter function public.process_race_application_deadlines_v1()
  rename to process_race_application_deadlines_v1_legacy_before_preselection;

create or replace function public.process_race_application_deadlines_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_preselection jsonb;
  v_core jsonb;
  v_sync jsonb;
begin
  v_preselection:=public.process_race_application_preselection_v1();
  v_core:=public.process_race_application_deadlines_v1_legacy_before_preselection();
  v_sync:=public.sync_race_application_statuses_v1();
  return coalesce(v_core,'{}'::jsonb)||jsonb_build_object('preselection',v_preselection,'status_sync',v_sync);
end;
$$;

alter function public.prepare_next_season_race_calendar_v1(integer,integer,boolean)
  rename to prepare_next_season_race_calendar_v1_legacy_before_application_deadline_policy;

create or replace function public.prepare_next_season_race_calendar_v1(
  p_source_season integer,
  p_target_season integer,
  p_late_recovery boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_result jsonb;
  r record;
  v_recalculated integer:=0;
begin
  v_result:=public.prepare_next_season_race_calendar_v1_legacy_before_application_deadline_policy(
    p_source_season,p_target_season,p_late_recovery
  );
  if coalesce((v_result->>'ok')::boolean,false) then
    for r in select rer.race_id from public.race_entry_rules rer where rer.race_season_number=p_target_season
    loop
      perform * from public.recalculate_race_entry_deadlines_v1(r.race_id);
      v_recalculated:=v_recalculated+1;
    end loop;
  end if;
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'application_deadlines_recalculated',v_recalculated,
    'application_deadline_policy_version','jan_late_d3_feb_onward_d7_v1'
  );
end;
$$;

create or replace function public.process_due_game_notifications_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_race_preparation_result jsonb:=null;
  v_race_preparation_error text:=null;
  v_startlist_deadline_result jsonb:=null;
  v_startlist_deadline_error text:=null;
  v_application_window_result jsonb:=null;
  v_application_window_error text:=null;
  v_missing_stage_plan_count integer:=0;
  v_duplicate_lock_removed_before integer:=0;
  v_duplicate_lock_removed_after integer:=0;
  v_missed_startlist_cleanup_count integer:=0;
begin
  select public.cleanup_duplicate_stage_plan_lock_notifications_v4() into v_duplicate_lock_removed_before;
  begin
    select public.process_race_application_window_notifications_v1() into v_application_window_result;
  exception when others then v_application_window_error:=sqlerrm; end;
  begin
    select public.process_due_race_preparation_notifications_core_v1() into v_race_preparation_result;
  exception when others then v_race_preparation_error:=sqlerrm; end;
  begin
    select public.process_due_race_startlist_deadlines_v1() into v_startlist_deadline_result;
  exception when others then v_startlist_deadline_error:=sqlerrm; end;
  select public.cleanup_missed_startlist_race_notifications_v1() into v_missed_startlist_cleanup_count;
  select public.process_due_missing_stage_plan_notifications_v1() into v_missing_stage_plan_count;
  select public.cleanup_duplicate_stage_plan_lock_notifications_v4() into v_duplicate_lock_removed_after;
  select public.cleanup_missed_startlist_race_notifications_v1() into v_missed_startlist_cleanup_count;
  return jsonb_build_object(
    'status',case when v_race_preparation_error is null and v_startlist_deadline_error is null and v_application_window_error is null
      then 'completed' else 'completed_with_errors' end,
    'race_application_window_notifications',v_application_window_result,
    'race_application_window_error',v_application_window_error,
    'race_preparation_notifications',v_race_preparation_result,
    'race_preparation_error',v_race_preparation_error,
    'startlist_deadline_processing',v_startlist_deadline_result,
    'startlist_deadline_error',v_startlist_deadline_error,
    'missed_startlist_notifications_cleaned_up',coalesce(v_missed_startlist_cleanup_count,0),
    'missing_stage_plan_notifications_created',coalesce(v_missing_stage_plan_count,0),
    'duplicate_stage_plan_lock_notifications_removed_before',coalesce(v_duplicate_lock_removed_before,0),
    'duplicate_stage_plan_lock_notifications_removed_after',coalesce(v_duplicate_lock_removed_after,0),
    'processed_at',now()
  );
end;
$$;