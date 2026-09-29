
create table if not exists public.premium_manager_templates_v1 (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null,
  name text not null,
  payload_json jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_manager_templates_type_chk
    check (template_type in (
      'race_strategy',
      'training',
      'equipment',
      'financial_scenario',
      'season_plan'
    )),
  constraint premium_manager_templates_name_chk
    check (char_length(btrim(name)) between 1 and 80)
);

create index if not exists premium_manager_templates_club_type_idx
  on public.premium_manager_templates_v1(club_id, template_type, updated_at desc);

create table if not exists public.premium_manager_automation_rules_v1 (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_type text not null,
  name text not null,
  template_id uuid not null references public.premium_manager_templates_v1(id) on delete cascade,
  match_json jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  last_matched_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint premium_manager_automation_type_chk
    check (rule_type in ('strategy_prefill','training_prefill','equipment_prefill')),
  constraint premium_manager_automation_name_chk
    check (char_length(btrim(name)) between 1 and 80)
);

create index if not exists premium_manager_automation_club_idx
  on public.premium_manager_automation_rules_v1(club_id, rule_type, is_enabled);

alter table public.premium_manager_templates_v1 enable row level security;
alter table public.premium_manager_automation_rules_v1 enable row level security;

revoke all on table public.premium_manager_templates_v1 from anon, authenticated;
revoke all on table public.premium_manager_automation_rules_v1 from anon, authenticated;

create or replace function public.premium_assert_manager_access_v1(p_club_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, finance, auth, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode='28000';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.' using errcode='22023';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode='42501';
  end if;

  if not public.current_user_has_premium_v1() then
    raise exception 'Premium membership is required.' using errcode='42501';
  end if;

  return p_club_id;
end;
$$;

create or replace function public.premium_get_command_center_v1(p_club_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_club_id uuid;
  v_game_ts timestamptz;
  v_game_date date;
  v_balance bigint := 0;
  v_weekly_income bigint := 0;
  v_weekly_expenses bigint := 0;
  v_wage_total bigint := 0;
  v_staff_wages bigint := 0;
  v_sponsor_monthly bigint := 0;
  v_policy_30d bigint := 0;
begin
  v_club_id := public.premium_assert_manager_access_v1(p_club_id);
  v_game_ts := public.get_current_game_timestamp();
  v_game_date := v_game_ts::date;

  select
    coalesce(current_balance,0),
    coalesce(weekly_income,0),
    coalesce(weekly_expenses,0),
    coalesce(wage_total,0)
  into
    v_balance,
    v_weekly_income,
    v_weekly_expenses,
    v_wage_total
  from public.club_finance_summary
  where club_id = v_club_id;

  select coalesce(sum(cs.salary_weekly),0)::bigint
  into v_staff_wages
  from public.club_staff cs
  where cs.club_id=v_club_id and cs.is_active=true;

  select coalesce(sum(cs.monthly_amount),0)::bigint
  into v_sponsor_monthly
  from public.club_sponsors cs
  where cs.club_id=v_club_id and cs.status='active';

  begin
    select coalesce(total_policy_cost,0)
    into v_policy_30d
    from public.finance_get_team_policy_cost_summary(
      v_club_id,
      v_game_date - 30,
      v_game_date
    )
    limit 1;
  exception when others then
    v_policy_30d := 0;
  end;

  return jsonb_build_object(
    'scope_note',
      'Premium Command Center is a deterministic management workspace built from information the manager already owns. It does not replace Staff Briefing Centre, does not create role-specific advisor reports, and is not influenced by staff advisory skill.',
    'game_now', v_game_ts,
    'club', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'cash_balance', v_balance
      )
      from public.clubs c
      where c.id=v_club_id
    ),
    'summary', jsonb_build_object(
      'weekly_income', v_weekly_income,
      'weekly_expenses', v_weekly_expenses,
      'weekly_net', v_weekly_income-v_weekly_expenses,
      'rider_wages_weekly', v_wage_total,
      'staff_wages_weekly', v_staff_wages,
      'active_sponsor_monthly_income', v_sponsor_monthly,
      'policy_cost_last_30_game_days', v_policy_30d,
      'upcoming_races_60d', (
        select count(*)::integer
        from public.race_preparations rp
        join public.races r on r.id=rp.race_id
        where rp.club_id=v_club_id
          and r.start_date between v_game_date and v_game_date+60
          and lower(coalesce(rp.status,'')) not in ('withdrawn','cancelled','canceled')
      ),
      'unread_transfer_alerts', (
        select count(*)::integer
        from public.transfer_market_alerts a
        where a.club_id=v_club_id and not a.is_read
      ),
      'shortlist_count', (
        select count(*)::integer
        from public.transfer_shortlist s
        where s.club_id=v_club_id
          and s.target_type='rider'
          and s.removed_at is null
      ),
      'active_sponsor_objectives', (
        select count(*)::integer
        from public.club_sponsor_objectives o
        join public.club_sponsors cs on cs.id=o.club_sponsor_id
        where cs.club_id=v_club_id
          and lower(coalesce(o.status,'')) not in ('completed','failed','cancelled','canceled','paid')
      )
    ),
    'season_planner', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.start_date, x.race_name)
      from (
        select
          rp.id as race_preparation_id,
          r.id as race_id,
          r.name as race_name,
          r.category,
          r.race_type,
          r.start_date,
          r.end_date,
          rp.status as preparation_status,
          rp.startlist_status,
          rp.rider_submission_deadline_on,
          rp.setup_window_opens_on,
          coalesce(stage_count.total_stages,0) as total_stages,
          coalesce(plan_count.saved_stage_plans,0) as saved_stage_plans,
          coalesce(obj_count.sponsor_target_count,0) as sponsor_target_count,
          case
            when rp.rider_submission_deadline_on is not null
                 and rp.rider_submission_deadline_on <= v_game_date + 2
                 and coalesce(rp.startlist_status,'') not in ('submitted','locked')
              then 'deadline_close'
            when coalesce(plan_count.saved_stage_plans,0) < coalesce(stage_count.total_stages,0)
              then 'planning_incomplete'
            else 'on_track'
          end as planning_state
        from public.race_preparations rp
        join public.races r on r.id=rp.race_id
        left join lateral (
          select count(*)::integer as total_stages
          from public.race_stages st
          where st.race_id=r.id
        ) stage_count on true
        left join lateral (
          select count(*) filter (where sp.last_saved_at is not null or sp.submitted_at is not null)::integer
            as saved_stage_plans
          from public.race_stage_plans sp
          where sp.race_preparation_id=rp.id
        ) plan_count on true
        left join lateral (
          select count(*)::integer as sponsor_target_count
          from public.club_sponsor_objectives o
          join public.club_sponsors cs on cs.id=o.club_sponsor_id
          where cs.club_id=v_club_id
            and o.target_race_id=r.id
            and lower(coalesce(o.status,'')) not in ('failed','cancelled','canceled')
        ) obj_count on true
        where rp.club_id=v_club_id
          and r.start_date between v_game_date and v_game_date+60
          and lower(coalesce(rp.status,'')) not in ('withdrawn','cancelled','canceled')
        order by r.start_date, r.name
        limit 30
      ) x
    ), '[]'::jsonb),
    'transfer_command', jsonb_build_object(
      'shortlist', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.added_at desc)
        from public.transfer_list_rider_shortlist_v2(v_club_id) s
      ), '[]'::jsonb),
      'saved_searches', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.updated_at desc)
        from public.transfer_list_saved_searches_v1(v_club_id) s
      ), '[]'::jsonb),
      'alerts', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.created_at desc)
        from public.transfer_list_market_alerts_v1(v_club_id,20) a
      ), '[]'::jsonb),
      'pipeline', jsonb_build_object(
        'open_transfer_offers', (
          select count(*)::integer
          from public.rider_transfer_offers o
          where o.buyer_club_id=v_club_id
            and o.status in ('open','club_accepted')
        ),
        'open_transfer_negotiations', (
          select count(*)::integer
          from public.rider_transfer_negotiations n
          where n.buyer_club_id=v_club_id
            and n.status in ('draft','open','pending','countered','club_accepted')
        ),
        'open_free_agent_negotiations', (
          select count(*)::integer
          from public.rider_free_agent_negotiations n
          where n.club_id=v_club_id
            and n.status in ('draft','open','pending','countered')
        )
      )
    ),
    'finance', jsonb_build_object(
      'balance', v_balance,
      'weekly_income', v_weekly_income,
      'weekly_expenses', v_weekly_expenses,
      'weekly_net', v_weekly_income-v_weekly_expenses,
      'rider_wages_weekly', v_wage_total,
      'staff_wages_weekly', v_staff_wages,
      'active_sponsor_monthly_income', v_sponsor_monthly,
      'policy_cost_last_30_game_days', v_policy_30d,
      'cashflow', coalesce((
        select jsonb_agg(to_jsonb(cf) order by cf.bucket_date)
        from public.finance_get_club_cashflow_series(v_club_id,30) cf
      ), '[]'::jsonb)
    ),
    'sponsor_intelligence', coalesce((
      select jsonb_agg(
        to_jsonb(s) ||
        jsonb_build_object(
          'remaining_value', greatest(0,coalesce(s.target_value,0)-coalesce(s.current_value,0)),
          'progress_pct', case
            when coalesce(s.target_value,0) <= 0 then 0
            else least(100,round(100.0*coalesce(s.current_value,0)/s.target_value))
          end,
          'risk_band', case
            when lower(coalesce(s.objective_result_state,s.objective_status,'')) in ('completed','success','paid') then 'completed'
            when lower(coalesce(s.objective_result_state,s.objective_status,'')) in ('failed','failure') then 'failed'
            when coalesce(s.current_value,0) >= coalesce(s.target_value,0) and coalesce(s.target_value,0)>0 then 'target_met'
            when coalesce(s.target_check_game_date,s.eligible_to_game_date) is not null
                 and coalesce(s.target_check_game_date,s.eligible_to_game_date) <= v_game_date+7 then 'high'
            when coalesce(s.target_check_game_date,s.eligible_to_game_date) is not null
                 and coalesce(s.target_check_game_date,s.eligible_to_game_date) <= v_game_date+14 then 'medium'
            else 'normal'
          end
        )
        order by
          coalesce(s.target_check_game_date,s.eligible_to_game_date,'9999-12-31'::date),
          s.objective_title
      )
      from public.get_club_sponsor_objectives_ui_v1(v_club_id) s
    ), '[]'::jsonb),
    'rider_development', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.development_8w desc, x.display_name)
      from (
        select
          r.id as rider_id,
          coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),r.display_name,r.id::text) as display_name,
          r.country_code,
          r.role,
          r.birth_date,
          r.overall,
          r.potential,
          r.fatigue,
          r.morale,
          r.availability_status,
          latest.week_start_date,
          latest.week_end_date,
          latest.total_net_change as latest_net_change,
          latest.overall_delta as latest_overall_delta,
          latest.ui_state,
          latest.ui_label,
          coalesce(dev.development_8w,0) as development_8w,
          coalesce(dev.overall_delta_8w,0) as overall_delta_8w,
          coalesce(dev.weeks_recorded,0) as weeks_recorded
        from public.club_riders cr
        join public.riders r on r.id=cr.rider_id
        left join public.rider_latest_weekly_development_v latest on latest.rider_id=r.id
        left join lateral (
          select
            coalesce(sum(s.total_net_change),0)::numeric as development_8w,
            coalesce(sum(s.overall_delta),0)::numeric as overall_delta_8w,
            count(*)::integer as weeks_recorded
          from public.rider_weekly_development_summaries s
          where s.rider_id=r.id
            and s.week_end_date >= v_game_date-56
        ) dev on true
        where cr.club_id=v_club_id
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.premium_get_race_strategy_lab_v1(p_race_preparation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_club_id uuid;
  v_race_id uuid;
begin
  select rp.club_id, rp.race_id
  into v_club_id, v_race_id
  from public.race_preparations rp
  where rp.id=p_race_preparation_id;

  if v_club_id is null then
    raise exception 'Race preparation not found.' using errcode='P0002';
  end if;

  perform public.premium_assert_manager_access_v1(v_club_id);

  return jsonb_build_object(
    'scope_note',
      'Strategy Lab is an on-demand scenario comparison using visible rider, fatigue and race-profile data. It is separate from the coin-based Sports Director advisory and does not create advisor recommendations or change the race engine.',
    'race', (
      select jsonb_build_object(
        'race_preparation_id', rp.id,
        'race_id', r.id,
        'race_name', r.name,
        'category', r.category,
        'race_type', r.race_type,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'preparation_status', rp.status,
        'startlist_status', rp.startlist_status
      )
      from public.race_preparations rp
      join public.races r on r.id=rp.race_id
      where rp.id=p_race_preparation_id
    ),
    'stages', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'stage_id', st.id,
          'stage_number', st.stage_number,
          'stage_name', st.name,
          'stage_date', st.stage_date,
          'terrain_type', st.terrain_type,
          'profile_type', st.profile_type,
          'stage_format', st.stage_format,
          'distance_km', st.distance_km,
          'elevation_gain_m', st.elevation_gain_m,
          'current_plan', case when sp.id is null then null else jsonb_build_object(
            'stage_plan_id', sp.id,
            'status', sp.status,
            'stage_objective', sp.stage_objective,
            'team_strategy', sp.team_strategy,
            'risk_level', sp.risk_level,
            'last_saved_at', sp.last_saved_at
          ) end,
          'top_candidates', coalesce((
            select jsonb_agg(to_jsonb(cand) order by cand.suitability_score desc, cand.display_name)
            from (
              select
                r.id as rider_id,
                coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),r.display_name,r.id::text) as display_name,
                r.country_code,
                r.role,
                r.overall,
                r.potential,
                r.fatigue,
                r.morale,
                exists (
                  select 1
                  from public.race_stage_plan_riders spr
                  where spr.race_stage_plan_id=sp.id
                    and spr.rider_id=r.id
                ) as currently_selected,
                greatest(0,least(100,round(
                  case
                    when lower(coalesce(st.stage_format,'')) in ('itt','tt','time_trial','individual_time_trial')
                      or lower(coalesce(st.terrain_type,'')) like '%time%'
                      then (
                        coalesce(r.time_trial,50)*0.40 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.flat,50)*0.15 +
                        coalesce(r.race_iq,50)*0.15 +
                        coalesce(r.recovery,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%mountain%'
                      then (
                        coalesce(r.climbing,50)*0.35 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.recovery,50)*0.15 +
                        coalesce(r.resistance,50)*0.10 +
                        coalesce(r.race_iq,50)*0.10 +
                        coalesce(r.teamwork,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%hill%'
                      then (
                        coalesce(r.climbing,50)*0.25 +
                        coalesce(r.flat,50)*0.15 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.recovery,50)*0.10 +
                        coalesce(r.resistance,50)*0.10 +
                        coalesce(r.race_iq,50)*0.10 +
                        coalesce(r.teamwork,50)*0.10
                      )
                    when lower(coalesce(st.terrain_type,st.profile_type,'')) like '%cobbl%'
                      then (
                        coalesce(r.flat,50)*0.20 +
                        coalesce(r.resistance,50)*0.20 +
                        coalesce(r.endurance,50)*0.20 +
                        coalesce(r.race_iq,50)*0.15 +
                        coalesce(r.teamwork,50)*0.10 +
                        coalesce(r.sprint,50)*0.10 +
                        coalesce(r.recovery,50)*0.05
                      )
                    else (
                      coalesce(r.flat,50)*0.25 +
                      coalesce(r.sprint,50)*0.25 +
                      coalesce(r.endurance,50)*0.20 +
                      coalesce(r.race_iq,50)*0.15 +
                      coalesce(r.teamwork,50)*0.10 +
                      coalesce(r.recovery,50)*0.05
                    )
                  end
                  - coalesce(r.fatigue,0)*0.25
                  + (coalesce(r.morale,50)-50)*0.08
                )))::integer as suitability_score
              from public.club_riders cr
              join public.riders r on r.id=cr.rider_id
              where cr.club_id=v_club_id
                and coalesce(r.availability_status,'fit') <> 'injured'
              order by suitability_score desc, display_name
              limit 8
            ) cand
          ), '[]'::jsonb)
        )
        order by st.stage_number
      )
      from public.race_stages st
      left join public.race_stage_plans sp
        on sp.race_preparation_id=p_race_preparation_id
       and sp.stage_id=st.id
      where st.race_id=v_race_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.premium_list_templates_v1(
  p_club_id uuid,
  p_template_type text default null
)
returns setof public.premium_manager_templates_v1
language plpgsql
stable
security definer
set search_path = public, finance, auth, pg_temp
as $$
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  return query
  select t.*
  from public.premium_manager_templates_v1 t
  where t.club_id=p_club_id
    and t.user_id=auth.uid()
    and (p_template_type is null or t.template_type=p_template_type)
  order by t.template_type, t.is_default desc, t.updated_at desc;
end;
$$;

create or replace function public.premium_save_template_v1(
  p_club_id uuid,
  p_template_id uuid,
  p_template_type text,
  p_name text,
  p_payload_json jsonb,
  p_is_default boolean default false
)
returns public.premium_manager_templates_v1
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_id uuid;
  v_row public.premium_manager_templates_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_template_type not in ('race_strategy','training','equipment','financial_scenario','season_plan') then
    raise exception 'Unsupported template type.' using errcode='22023';
  end if;

  if nullif(btrim(p_name),'') is null then
    raise exception 'Template name is required.' using errcode='22023';
  end if;

  if coalesce(p_is_default,false) then
    update public.premium_manager_templates_v1
    set is_default=false, updated_at=now()
    where club_id=p_club_id
      and user_id=auth.uid()
      and template_type=p_template_type;
  end if;

  if p_template_id is null then
    insert into public.premium_manager_templates_v1(
      club_id,user_id,template_type,name,payload_json,is_default
    )
    values(
      p_club_id,auth.uid(),p_template_type,btrim(p_name),
      coalesce(p_payload_json,'{}'::jsonb),coalesce(p_is_default,false)
    )
    returning id into v_id;
  else
    update public.premium_manager_templates_v1
    set
      template_type=p_template_type,
      name=btrim(p_name),
      payload_json=coalesce(p_payload_json,'{}'::jsonb),
      is_default=coalesce(p_is_default,false),
      updated_at=now()
    where id=p_template_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Template not found.' using errcode='P0002';
    end if;
  end if;

  select * into v_row
  from public.premium_manager_templates_v1
  where id=v_id;

  return v_row;
end;
$$;

create or replace function public.premium_delete_template_v1(
  p_club_id uuid,
  p_template_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_count integer;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  delete from public.premium_manager_templates_v1
  where id=p_template_id
    and club_id=p_club_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$$;

create or replace function public.premium_list_automation_rules_v1(p_club_id uuid)
returns table(
  id uuid,
  club_id uuid,
  user_id uuid,
  rule_type text,
  name text,
  template_id uuid,
  template_name text,
  template_type text,
  match_json jsonb,
  is_enabled boolean,
  last_matched_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, finance, auth, pg_temp
as $$
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  return query
  select
    r.id,r.club_id,r.user_id,r.rule_type,r.name,r.template_id,
    t.name,t.template_type,r.match_json,r.is_enabled,r.last_matched_at,
    r.created_at,r.updated_at
  from public.premium_manager_automation_rules_v1 r
  join public.premium_manager_templates_v1 t on t.id=r.template_id
  where r.club_id=p_club_id
    and r.user_id=auth.uid()
  order by r.is_enabled desc,r.updated_at desc;
end;
$$;

create or replace function public.premium_save_automation_rule_v1(
  p_club_id uuid,
  p_rule_id uuid,
  p_rule_type text,
  p_name text,
  p_template_id uuid,
  p_match_json jsonb,
  p_is_enabled boolean default true
)
returns public.premium_manager_automation_rules_v1
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_id uuid;
  v_template_type text;
  v_row public.premium_manager_automation_rules_v1;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  if p_rule_type not in ('strategy_prefill','training_prefill','equipment_prefill') then
    raise exception 'Unsupported automation rule type.' using errcode='22023';
  end if;

  select t.template_type
  into v_template_type
  from public.premium_manager_templates_v1 t
  where t.id=p_template_id
    and t.club_id=p_club_id
    and t.user_id=auth.uid();

  if v_template_type is null then
    raise exception 'Template not found.' using errcode='P0002';
  end if;

  if (p_rule_type='strategy_prefill' and v_template_type<>'race_strategy')
     or (p_rule_type='training_prefill' and v_template_type<>'training')
     or (p_rule_type='equipment_prefill' and v_template_type<>'equipment') then
    raise exception 'Automation rule and template type do not match.' using errcode='22023';
  end if;

  if p_rule_id is null then
    insert into public.premium_manager_automation_rules_v1(
      club_id,user_id,rule_type,name,template_id,match_json,is_enabled
    )
    values(
      p_club_id,auth.uid(),p_rule_type,btrim(p_name),p_template_id,
      coalesce(p_match_json,'{}'::jsonb),coalesce(p_is_enabled,true)
    )
    returning id into v_id;
  else
    update public.premium_manager_automation_rules_v1
    set
      rule_type=p_rule_type,
      name=btrim(p_name),
      template_id=p_template_id,
      match_json=coalesce(p_match_json,'{}'::jsonb),
      is_enabled=coalesce(p_is_enabled,true),
      updated_at=now()
    where id=p_rule_id
      and club_id=p_club_id
      and user_id=auth.uid()
    returning id into v_id;

    if v_id is null then
      raise exception 'Automation rule not found.' using errcode='P0002';
    end if;
  end if;

  select * into v_row
  from public.premium_manager_automation_rules_v1
  where id=v_id;

  return v_row;
end;
$$;

create or replace function public.premium_delete_automation_rule_v1(
  p_club_id uuid,
  p_rule_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_count integer;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  delete from public.premium_manager_automation_rules_v1
  where id=p_rule_id
    and club_id=p_club_id
    and user_id=auth.uid();

  get diagnostics v_count=row_count;
  return v_count>0;
end;
$$;

create or replace function public.premium_match_automation_template_v1(
  p_club_id uuid,
  p_rule_type text,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_rule record;
begin
  perform public.premium_assert_manager_access_v1(p_club_id);

  select
    r.*,
    t.name as template_name,
    t.template_type,
    t.payload_json
  into v_rule
  from public.premium_manager_automation_rules_v1 r
  join public.premium_manager_templates_v1 t on t.id=r.template_id
  where r.club_id=p_club_id
    and r.user_id=auth.uid()
    and r.rule_type=p_rule_type
    and r.is_enabled
    and not exists (
      select 1
      from jsonb_each_text(coalesce(r.match_json,'{}'::jsonb)) m
      where coalesce(p_context->>m.key,'') <> m.value
    )
  order by jsonb_object_length(coalesce(r.match_json,'{}'::jsonb)) desc,
           r.updated_at desc
  limit 1;

  if v_rule.id is null then
    return jsonb_build_object('matched',false);
  end if;

  update public.premium_manager_automation_rules_v1
  set last_matched_at=now()
  where id=v_rule.id;

  return jsonb_build_object(
    'matched',true,
    'rule_id',v_rule.id,
    'rule_name',v_rule.name,
    'template_id',v_rule.template_id,
    'template_name',v_rule.template_name,
    'template_type',v_rule.template_type,
    'payload_json',v_rule.payload_json,
    'match_json',v_rule.match_json
  );
end;
$$;

revoke all on function public.premium_assert_manager_access_v1(uuid) from public, anon, authenticated;
revoke all on function public.premium_get_command_center_v1(uuid) from public, anon;
revoke all on function public.premium_get_race_strategy_lab_v1(uuid) from public, anon;
revoke all on function public.premium_list_templates_v1(uuid,text) from public, anon;
revoke all on function public.premium_save_template_v1(uuid,uuid,text,text,jsonb,boolean) from public, anon;
revoke all on function public.premium_delete_template_v1(uuid,uuid) from public, anon;
revoke all on function public.premium_list_automation_rules_v1(uuid) from public, anon;
revoke all on function public.premium_save_automation_rule_v1(uuid,uuid,text,text,uuid,jsonb,boolean) from public, anon;
revoke all on function public.premium_delete_automation_rule_v1(uuid,uuid) from public, anon;
revoke all on function public.premium_match_automation_template_v1(uuid,text,jsonb) from public, anon;

grant execute on function public.premium_get_command_center_v1(uuid) to authenticated, service_role;
grant execute on function public.premium_get_race_strategy_lab_v1(uuid) to authenticated, service_role;
grant execute on function public.premium_list_templates_v1(uuid,text) to authenticated, service_role;
grant execute on function public.premium_save_template_v1(uuid,uuid,text,text,jsonb,boolean) to authenticated, service_role;
grant execute on function public.premium_delete_template_v1(uuid,uuid) to authenticated, service_role;
grant execute on function public.premium_list_automation_rules_v1(uuid) to authenticated, service_role;
grant execute on function public.premium_save_automation_rule_v1(uuid,uuid,text,text,uuid,jsonb,boolean) to authenticated, service_role;
grant execute on function public.premium_delete_automation_rule_v1(uuid,uuid) to authenticated, service_role;
grant execute on function public.premium_match_automation_template_v1(uuid,text,jsonb) to authenticated, service_role;
grant execute on function public.premium_assert_manager_access_v1(uuid) to service_role;
