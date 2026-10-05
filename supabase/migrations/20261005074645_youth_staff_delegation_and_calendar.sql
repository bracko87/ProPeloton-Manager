-- Keep the manager's saved assignments; resolve availability for every operational read.
alter table public.youth_academy_settings add column if not exists training_decider text not null default 'manager'
  check (training_decider in ('manager','u16_head_coach'));
create or replace function private.youth_staff_available_v1(p_staff_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.club_staff cs where cs.id=p_staff_id and cs.is_active
   and not exists(select 1 from public.staff_courses sc where sc.staff_id=cs.id and sc.status='active'));
$$;
revoke all on function private.youth_staff_available_v1(uuid) from public,anon,authenticated;
create or replace function private.youth_available_role_v1(p_academy_id uuid,p_role text)
returns uuid language sql stable security definer set search_path=public,private,pg_temp as $$
 select cs.id from public.youth_academies a join public.club_staff cs on cs.club_id=a.club_id
 where a.id=p_academy_id and cs.role_type=case p_role when 'academy_director' then 'youth_academy_director' else p_role end
 and private.youth_staff_available_v1(cs.id)
 order by private.youth_staff_quality_score_v1(cs.role_type,cs.expertise,cs.experience,cs.potential,cs.leadership,cs.efficiency,cs.loyalty) desc,cs.id limit 1;
$$;
revoke all on function private.youth_available_role_v1(uuid,text) from public,anon,authenticated;

create or replace view private.youth_effective_settings_v1 as select
s.academy_id,
case when s.recruitment_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.recruitment_decider) is null then 'manager' else s.recruitment_decider end as recruitment_decider,
case when s.race_entry_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.race_entry_decider) is null then 'manager' else s.race_entry_decider end as race_entry_decider,
case when s.race_squad_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.race_squad_decider) is null then 'manager' else s.race_squad_decider end as race_squad_decider,
case when s.camp_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.camp_decider) is null then 'manager' else s.camp_decider end as camp_decider,
case when s.equipment_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.equipment_decider) is null then 'manager' else s.equipment_decider end as equipment_decider,
case when s.recruitment_negotiation_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.recruitment_negotiation_decider) is null then 'manager' else s.recruitment_negotiation_decider end as recruitment_negotiation_decider,
s.created_at,
s.updated_at,
s.auto_recruit_min_band,
s.auto_recruit_max_stipend_weekly,
s.auto_recruit_max_compensation,
s.auto_recruit_min_free_slots,
s.training_philosophy,
s.race_report_frequency,
case when s.training_decider<>'manager' and not a.is_ai and private.youth_available_role_v1(a.id,s.training_decider) is null then 'manager' else s.training_decider end as training_decider
from public.youth_academy_settings s join public.youth_academies a on a.id=s.academy_id;
revoke all on private.youth_effective_settings_v1 from public,anon,authenticated;

create table public.youth_staff_decisions (
 id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.youth_academies(id) on delete cascade,
 staff_id uuid references public.club_staff(id) on delete set null, game_date date not null,
 responsibility text not null, summary text not null, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
 unique(academy_id,game_date,responsibility)
);
alter table public.youth_staff_decisions enable row level security;
revoke all on public.youth_staff_decisions from public,anon,authenticated;
create table public.youth_training_camps (
 id uuid primary key default gen_random_uuid(), academy_id uuid not null references public.youth_academies(id) on delete cascade,
 starts_on date not null, ends_on date not null, focus text not null check(focus in ('freshness','balanced','development')),
 cost bigint not null check(cost>=0), staff_score integer not null, booked_by text not null,
 rider_ids uuid[] not null, status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 check(ends_on>=starts_on), unique(academy_id,starts_on)
);
alter table public.youth_training_camps enable row level security;
revoke all on public.youth_training_camps from public,anon,authenticated;
insert into public.notification_types(code,name,source,icon_name,priority,is_active)
values('YOUTH_STAFF_HANDOVER','Youth staff responsibility handover','game','UserCog',2,true),
('YOUTH_STAFF_DECISION','Youth staff decision','game','GraduationCap',1,true)
on conflict(code) do nothing;
create or replace function private.notify_youth_staff_v1(p_academy_id uuid,p_type text,p_title text,p_message text,p_key text,p_payload jsonb default '{}')
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_user uuid;
begin
 select c.owner_user_id into v_user from public.youth_academies a join public.clubs c on c.id=a.club_id
 where a.id=p_academy_id and not a.is_ai and c.deleted_at is null;
 if v_user is not null then
 perform public.create_user_game_notification_v1(v_user,p_type,p_title,p_message,'/dashboard/youth-academy',
 jsonb_build_object('academy_id',p_academy_id)||p_payload,p_key,null);
 end if;
end; $$;
revoke all on function private.notify_youth_staff_v1(uuid,text,text,text,text,jsonb) from public,anon,authenticated;
create or replace function private.youth_course_handover_v1()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a record; v_keys text[]; v_name text; v_role text; v_start boolean;
begin
 if TG_OP='UPDATE' and new.status is not distinct from old.status then return new; end if;
 select cs.staff_name,case cs.role_type when 'youth_academy_director' then 'academy_director' else cs.role_type end
 into v_name,v_role from public.club_staff cs where cs.id=new.staff_id;
 if v_role not in ('academy_director','u16_head_coach','youth_scout') then return new; end if;
 v_start:=new.status='active';
 for a in select ya.id,s.* from public.youth_academies ya join public.youth_academy_settings s on s.academy_id=ya.id where ya.club_id=new.club_id and ya.is_active loop
 select array_agg(replace(k.key,'_decider','')) into v_keys from jsonb_each_text(to_jsonb(a)) k
 where k.key like '%_decider' and k.value=v_role;
 if coalesce(cardinality(v_keys),0)=0 then continue; end if;
 if v_start and private.youth_available_role_v1(a.id,v_role) is not null then continue; end if;
 if not v_start and private.youth_available_role_v1(a.id,v_role) is null then continue; end if;
 perform private.notify_youth_staff_v1(a.id,'YOUTH_STAFF_HANDOVER',
 case when v_start then 'Youth Academy responsibilities transferred to you' else 'Youth Academy staff responsibilities resumed' end,
 case when v_start then format('%s is attending %s until %s. You now handle: %s. Saved assignments resume when an available staff member returns.',v_name,new.course_title,new.completes_on_game_date,array_to_string(v_keys,', '))
 else format('%s has returned. Available staff now resume: %s. Any assignments you changed during the course are respected.',v_name,array_to_string(v_keys,', ')) end,
 'youth-course:'||new.id||':'||new.status,jsonb_build_object('staff_id',new.staff_id,'course_title',new.course_title,'returns_on',new.completes_on_game_date,'responsibilities',v_keys));
 end loop;
 return new;
end; $$;
revoke all on function private.youth_course_handover_v1() from public,anon,authenticated;
create trigger youth_course_handover after insert or update of status on public.staff_courses
for each row execute function private.youth_course_handover_v1();

CREATE OR REPLACE FUNCTION private.auto_enter_youth_races_v1(p_game_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_pair record;
  v_count integer:=0;
  v_strategy text;
begin
  for v_pair in
    select
      r.id race_id,r.season_number,r.race_date,r.competition_class,
      a.id academy_id,a.is_ai,
      coalesce(s.race_entry_decider,'u16_head_coach') race_entry_decider
    from public.youth_races r
    join public.youth_race_invitations i on i.race_id=r.id
    join public.youth_academies a on a.id=i.academy_id
    left join private.youth_effective_settings_v1 s on s.academy_id=a.id
    where r.status='scheduled'
      and r.race_date=p_game_date+7
      and i.status='pending'
      and a.is_active=true
      and (
        a.is_ai
      )
      and not exists(
        select 1 from public.youth_race_entries e
        where e.race_id=r.id and e.academy_id=a.id
          and e.status in ('entered','completed')
      )
    order by
      case r.competition_class when 'world' then 1 when 'continental' then 2 else 3 end,
      r.race_date,r.id,a.id
  loop
    perform private.ensure_youth_monthly_race_plan_v1(
      v_pair.academy_id,v_pair.season_number,
      extract(month from v_pair.race_date)::integer
    );

    if not private.youth_race_selected_by_plan_v1(
      v_pair.academy_id,v_pair.race_id
    ) then
      update public.youth_race_invitations
      set status='declined',responded_on=p_game_date,updated_at=now(),
          metadata=metadata||jsonb_build_object(
            'decline_reason','monthly_plan_selection'
          )
      where race_id=v_pair.race_id and academy_id=v_pair.academy_id
        and status='pending';
      continue;
    end if;

    v_strategy:=case
      when private.youth_deterministic_fraction_v1(
        v_pair.race_id::text||v_pair.academy_id::text||'strategy'
      )<0.22 then 'conservative'
      when private.youth_deterministic_fraction_v1(
        v_pair.race_id::text||v_pair.academy_id::text||'strategy'
      )>0.78 then 'aggressive'
      else 'balanced'
    end;

    begin
      perform private.enter_youth_race_v1(
        v_pair.academy_id,v_pair.race_id,
        case when v_pair.is_ai then 'ai_head_coach' else 'u16_head_coach' end,
        v_strategy
      );
      v_count:=v_count+1;
    exception when others then
      null;
    end;
  end loop;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.build_youth_race_report_v1(p_race_id uuid, p_academy_id uuid, p_allow_notification boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_academy public.youth_academies%rowtype;
  v_club public.clubs%rowtype;
  v_owner uuid;
  v_frequency text:='important_only';
  v_best integer;
  v_podiums integer:=0;
  v_dnf integer:=0;
  v_dns integer:=0;
  v_regional integer:=0;
  v_world integer:=0;
  v_fatigue integer:=0;
  v_development integer:=0;
  v_class text:='routine';
  v_headline text;
  v_summary text;
  v_events jsonb:='[]'::jsonb;
  v_should_notify boolean:=false;
  v_notification_id text;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  select * into v_academy from public.youth_academies where id=p_academy_id;
  if v_race.id is null or v_academy.id is null then
    return jsonb_build_object('ok',false,'reason','missing_race_or_academy');
  end if;

  select * into v_club from public.clubs where id=v_academy.club_id;
  v_owner:=v_club.owner_user_id;

  select coalesce(s.race_report_frequency,'important_only')
  into v_frequency
  from private.youth_effective_settings_v1 s
  where s.academy_id=p_academy_id;

  select
    min(rr.finish_position) filter(where rr.result_status='finished'),
    count(*) filter(where rr.finish_position between 1 and 3),
    count(*) filter(where rr.result_status='dnf'),
    count(*) filter(where rr.result_status='dns'),
    coalesce(sum(rr.regional_points),0),
    coalesce(sum(rr.world_points),0),
    coalesce(sum(rr.fatigue_delta),0),
    coalesce(sum(rr.development_bonus),0)
  into
    v_best,v_podiums,v_dnf,v_dns,v_regional,v_world,v_fatigue,v_development
  from public.youth_race_results rr
  where rr.race_id=p_race_id and rr.academy_id=p_academy_id;

  if v_dnf>0 or v_dns>0 then
    v_class:='problem';
  elsif v_podiums>0 or (v_best is not null and v_best<=5 and v_race.race_level<>'regional') then
    v_class:='exceptional';
  elsif v_race.race_level in ('world_series','world_final')
        or v_world>=50 or v_regional>=100 then
    v_class:='important';
  else
    v_class:='routine';
  end if;

  select coalesce(jsonb_agg(event order by sort_key,event->>'rider_name'),'[]'::jsonb)
  into v_events
  from (
    select
      case
        when rr.finish_position=1 then 1
        when rr.finish_position between 2 and 3 then 2
        when rr.result_status='dnf' then 3
        when rr.result_status='dns' then 4
        when rr.development_bonus>0 then 5
        else 6
      end sort_key,
      jsonb_build_object(
        'rider_id',yr.id,
        'rider_name',yr.display_name,
        'result_status',rr.result_status,
        'position',rr.finish_position,
        'gap_seconds',rr.gap_seconds,
        'regional_points',rr.regional_points,
        'world_points',rr.world_points,
        'fatigue_delta',rr.fatigue_delta,
        'development_bonus',rr.development_bonus,
        'incident_code',rr.incident_code
      ) event
    from public.youth_race_results rr
    join public.youth_riders yr on yr.id=rr.youth_rider_id
    where rr.race_id=p_race_id and rr.academy_id=p_academy_id
      and (
        rr.finish_position between 1 and 5
        or rr.result_status in ('dnf','dns')
        or rr.development_bonus>0
      )
    order by sort_key,rr.finish_position nulls last,yr.display_name
    limit 15
  ) x;

  v_headline:=case
    when v_podiums>0 then v_race.race_name||' · podium result'
    when v_dnf>0 or v_dns>0 then v_race.race_name||' · Head Coach review'
    when v_race.race_level='world_final' then 'Youth World Final · Academy report'
    when v_race.race_level='world_series' then 'Youth World Series · Academy report'
    else v_race.race_name||' · Academy report'
  end;

  v_summary:=
    case
      when v_best is null then 'No classified Academy finish.'
      else 'Best finish #'||v_best::text||'.'
    end
    ||' Regional points +'||v_regional::text
    ||', World points +'||v_world::text
    ||'. Fatigue +'||v_fatigue::text||'.'
    ||case when v_development>0
      then ' '||v_development::text||' rider development event(s) recorded.'
      else '' end
    ||case when v_dnf+v_dns>0
      then ' '||v_dnf::text||' DNF and '||v_dns::text||' DNS require review.'
      else '' end;

  insert into public.youth_race_reports(
    race_id,academy_id,generated_on,report_class,headline,summary,best_finish,
    podium_count,dnf_count,dns_count,regional_points,world_points,fatigue_added,
    development_events,key_events,metadata
  )
  values(
    p_race_id,p_academy_id,v_race.race_date,v_class,v_headline,v_summary,v_best,
    v_podiums,v_dnf,v_dns,v_regional,v_world,v_fatigue,v_development,v_events,
    jsonb_build_object(
      'race_name',v_race.race_name,
      'race_level',v_race.race_level,
      'terrain_type',v_race.terrain_type,
      'distance_km',v_race.distance_km,
      'results_only',true,
      'replay_available',false
    )
  )
  on conflict(race_id,academy_id) do update
  set report_class=excluded.report_class,
      headline=excluded.headline,
      summary=excluded.summary,
      best_finish=excluded.best_finish,
      podium_count=excluded.podium_count,
      dnf_count=excluded.dnf_count,
      dns_count=excluded.dns_count,
      regional_points=excluded.regional_points,
      world_points=excluded.world_points,
      fatigue_added=excluded.fatigue_added,
      development_events=excluded.development_events,
      key_events=excluded.key_events,
      metadata=excluded.metadata;

  v_should_notify:=case v_frequency
    when 'every_race' then true
    when 'important_only' then v_class in ('important','exceptional','problem')
    when 'podium_exceptional' then v_class='exceptional'
    when 'problems_only' then v_class='problem'
    else false
  end;

  if p_allow_notification and v_should_notify and v_owner is not null and v_academy.is_ai=false then
    v_notification_id:=public.create_user_game_notification_v1(
      v_owner,
      'YOUTH_RACE_REPORT',
      v_headline,
      v_summary,
      '/dashboard/youth-academy',
      jsonb_build_object(
        'youth_race_report',true,
        'academy_id',p_academy_id,
        'race_id',p_race_id,
        'race_name',v_race.race_name,
        'race_level',v_race.race_level,
        'race_date',v_race.race_date,
        'report_class',v_class,
        'best_finish',v_best,
        'podium_count',v_podiums,
        'dnf_count',v_dnf,
        'dns_count',v_dns,
        'regional_points',v_regional,
        'world_points',v_world,
        'fatigue_added',v_fatigue,
        'development_events',v_development,
        'key_events',v_events,
        'action_tab','history'
      ),
      'youth-race-report:'||p_race_id::text||':'||p_academy_id::text,
      null
    );

    update public.youth_race_reports
    set notified_at=coalesce(notified_at,now())
    where race_id=p_race_id and academy_id=p_academy_id;
  end if;

  return jsonb_build_object(
    'ok',true,'race_id',p_race_id,'academy_id',p_academy_id,
    'report_class',v_class,'notification_mode',v_frequency,
    'notification_created',p_allow_notification and v_should_notify and v_owner is not null and v_academy.is_ai=false,
    'notification_id',v_notification_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enter_youth_race_v1(p_academy_id uuid, p_race_id uuid, p_entered_by text, p_strategy text DEFAULT 'balanced'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_plan public.youth_monthly_race_plans%rowtype;
  v_invitation public.youth_race_invitations%rowtype;
  v_entry_id uuid;
  v_lineup integer;
  v_game_date date:=public.get_current_game_date_date();
  v_month integer;
  v_class_count integer:=0;
  v_class_limit integer:=0;
  v_month_cost bigint:=0;
  v_team_count integer:=0;
  v_squad_decider text;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  select * into v_academy from public.youth_academies where id=p_academy_id;
  if v_race.id is null or v_academy.id is null then
    raise exception 'Race or Academy not found';
  end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'Youth race entry is closed';
  end if;

  select * into v_invitation
  from public.youth_race_invitations
  where race_id=p_race_id and academy_id=p_academy_id
  for update;
  if v_invitation.race_id is null
     or v_invitation.status not in ('pending','accepted') then
    raise exception 'This Academy does not have an active invitation to the Youth race';
  end if;

  if not private.youth_race_academy_qualified_v1(p_academy_id,p_race_id) then
    raise exception 'Academy does not currently have enough eligible Youth Riders';
  end if;

  v_month:=extract(month from v_race.race_date)::integer;
  perform private.ensure_youth_monthly_race_plan_v1(
    p_academy_id,v_race.season_number,v_month
  );
  select * into v_plan
  from public.youth_monthly_race_plans
  where academy_id=p_academy_id
    and season_number=v_race.season_number
    and month_number=v_month
  for update;

  if not v_academy.is_ai and not coalesce(v_plan.approved,false) then
    raise exception 'Approve the monthly Youth race plan before entering races';
  end if;

  v_class_limit:=case v_race.competition_class
    when 'world' then v_plan.world_race_limit
    when 'continental' then v_plan.continental_race_limit
    else v_plan.regional_race_limit
  end;

  select count(*)::integer into v_class_count
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.academy_id=p_academy_id
    and e.status in ('entered','completed')
    and r.season_number=v_race.season_number
    and extract(month from r.race_date)::integer=v_month
    and r.competition_class=v_race.competition_class
    and r.id<>p_race_id;

  if v_class_count>=coalesce(v_class_limit,0) then
    raise exception 'Monthly % Youth race limit has been reached',
      v_race.competition_class;
  end if;

  select coalesce(sum(e.entry_cost),0)::bigint into v_month_cost
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.academy_id=p_academy_id
    and r.season_number=v_race.season_number
    and extract(month from r.race_date)::integer=v_month
    and r.id<>p_race_id;

  if v_month_cost+v_race.entry_cost>coalesce(v_plan.max_monthly_cost,0) then
    raise exception 'Monthly Youth racing budget limit would be exceeded';
  end if;

  select count(*)::integer into v_team_count
  from public.youth_race_entries e
  where e.race_id=p_race_id and e.status in ('entered','completed');

  if v_team_count>=v_race.team_limit then
    raise exception 'Youth race team limit is already full';
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_race.season_number
  for update;
  if v_budget.academy_id is null then
    raise exception 'Youth Academy season budget not found';
  end if;
  if v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_race.entry_cost then
    raise exception 'Youth Academy budget is insufficient for race travel/logistics';
  end if;

  insert into public.youth_race_entries(
    race_id,academy_id,entered_on,entered_by,strategy,entry_cost,status
  )
  values(
    p_race_id,p_academy_id,v_game_date,p_entered_by,
    case when p_strategy in ('conservative','balanced','aggressive')
      then p_strategy else 'balanced' end,
    v_race.entry_cost,'entered'
  )
  on conflict(race_id,academy_id) do update
  set status='entered',strategy=excluded.strategy,updated_at=now()
  returning id into v_entry_id;

  update public.youth_race_invitations
  set status='accepted',responded_on=coalesce(responded_on,v_game_date),updated_at=now()
  where race_id=p_race_id and academy_id=p_academy_id;

  if not exists(
    select 1 from public.youth_academy_ledger l
    where l.academy_id=p_academy_id
      and l.category='race_travel'
      and l.metadata->>'race_id'=p_race_id::text
  ) then
    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_race.entry_cost,updated_at=now()
    where academy_id=p_academy_id and season_number=v_race.season_number;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      p_academy_id,v_race.season_number,v_game_date,'race_travel',
      'Youth race travel/logistics: '||v_race.race_name,
      -v_race.entry_cost,
      jsonb_build_object(
        'race_id',p_race_id,
        'competition_class',v_race.competition_class,
        'host_city',v_race.host_city
      )
    );
  end if;

  select coalesce(s.race_squad_decider,'u16_head_coach')
  into v_squad_decider
  from private.youth_effective_settings_v1 s
  where s.academy_id=p_academy_id;

  if coalesce(v_squad_decider,'u16_head_coach')='u16_head_coach'
     or v_academy.is_ai then
    v_lineup:=private.select_youth_race_lineup_v1(
      v_entry_id,
      case when v_academy.is_ai then 'ai_head_coach' else 'u16_head_coach' end
    );
    if v_lineup<3 then
      raise exception 'Not enough eligible Youth Riders for this race';
    end if;
  end if;

  return v_entry_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.process_youth_academy_weekly_payroll_v1(p_game_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_academy record;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_week_start date:=date_trunc('week',p_game_date)::date;
  v_rider_cost bigint;
  v_staff_cost bigint;
  v_total bigint;
  v_processed integer:=0;
begin
  if extract(isodow from p_game_date)::integer<>1 then
    return jsonb_build_object('weekly_run',false,'processed',0);
  end if;

  for v_academy in
    select a.id,a.club_id
    from public.youth_academies a
    where a.is_active=true
  loop
    if exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='weekly_payroll'
        and l.metadata->>'week_start'=v_week_start::text
    ) then continue; end if;

    select coalesce(sum(agr.stipend_weekly+agr.accommodation_weekly),0)::bigint
    into v_rider_cost
    from public.youth_rider_agreements agr
    where agr.academy_id=v_academy.id and agr.status='active';

    select coalesce(sum(cs.salary_weekly),0)::bigint
    into v_staff_cost
    from public.club_staff cs
    where cs.club_id=v_academy.club_id and cs.is_active=true
      and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

    v_total:=coalesce(v_rider_cost,0)+coalesce(v_staff_cost,0);

    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_total,
        committed_amount=greatest(
          scouting_committed_amount,
          committed_amount-least(committed_amount-scouting_committed_amount,greatest(v_rider_cost,0))
        ),
        updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    ) values(
      v_academy.id,v_season,p_game_date,'weekly_payroll',
      'Youth Academy weekly rider support and staff payroll',-v_total,
      jsonb_build_object(
        'week_start',v_week_start,'rider_support',v_rider_cost,
        'staff_salary',v_staff_cost,'total',v_total
      )
    );
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'weekly_run',true,'week_start',v_week_start,'processed',v_processed
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.process_youth_development_week_v1(p_game_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_rider public.youth_riders%rowtype;
  v_academy public.youth_academies%rowtype;
  v_philosophy text;
  v_age integer;
  v_coach_score integer;
  v_focus text;
  v_secondary text;
  v_workload text;
  v_age_factor numeric;
  v_workload_factor numeric;
  v_gap integer;
  v_overall numeric;
  v_chance numeric;
  v_primary_delta integer:=0;
  v_secondary_delta integer:=0;
  v_readiness_after integer;
  v_fatigue_after integer;
  v_week_start date:=date_trunc('week',p_game_date)::date;
  v_processed integer:=0;
  v_improved integer:=0;
begin
  if extract(isodow from p_game_date)::integer<>1 then
    return jsonb_build_object('processed',0,'improved',0,'weekly_run',false);
  end if;

  for v_rider in
    select r.*
    from public.youth_riders r
    join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and a.is_active=true
      and private.youth_academy_age_v1(r.birth_date) between 12 and 16
  loop
    if exists(
      select 1 from public.youth_development_weekly_runs d
      where d.youth_rider_id=v_rider.id and d.week_start=v_week_start
    ) then continue; end if;

    select * into v_academy
    from public.youth_academies where id=v_rider.academy_id;

    select coalesce(s.training_philosophy,'balanced')
    into v_philosophy
    from private.youth_effective_settings_v1 s
    where s.academy_id=v_rider.academy_id;

    select coalesce(round(
      cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25
    )::integer,45)
    into v_coach_score
    from public.club_staff cs
    where cs.club_id=v_academy.club_id
      and cs.role_type='u16_head_coach'
      and cs.is_active=true and private.youth_staff_available_v1(cs.id)
    order by cs.expertise desc
    limit 1;
    v_coach_score:=coalesce(v_coach_score,45);

    v_age:=private.youth_academy_age_v1(v_rider.birth_date);

    v_workload:=case v_philosophy
      when 'freshness' then
        case when v_rider.fatigue>=25 or v_rider.readiness<70 then 'light' else 'moderate' end
      when 'development' then
        case when v_rider.fatigue<40 and v_rider.readiness>=65 then 'high' else 'moderate' end
      else
        case when v_rider.fatigue>=55 or v_rider.readiness<60 then 'light' else 'moderate' end
    end;

    v_focus:=private.youth_focus_for_role_v1(v_rider.role,v_rider.development_focus);
    v_secondary:=(array[
      'sprint','climbing','time_trial','endurance','flat',
      'recovery','resistance','race_iq','teamwork'
    ])[1+floor(random()*9)::integer];
    if v_secondary=v_focus then
      v_secondary:=case when v_focus='endurance' then 'race_iq' else 'endurance' end;
    end if;

    v_overall:=(
      v_rider.sprint+v_rider.climbing+v_rider.time_trial+v_rider.endurance+
      v_rider.flat+v_rider.recovery+v_rider.resistance+v_rider.race_iq+
      v_rider.teamwork
    )::numeric/9.0;
    v_gap:=greatest(0,v_rider.hidden_potential-round(v_overall)::integer);

    v_age_factor:=case v_age
      when 12 then 0.55 when 13 then 0.70 when 14 then 0.85
      when 15 then 1.00 else 0.90 end;
    v_workload_factor:=case v_workload
      when 'light' then 0.72 when 'high' then 1.16 else 1.00 end;

    -- Intentionally slow: usually zero or one primary point per week.
    v_chance:=least(
      0.82,
      greatest(
        0.04,
        0.12*v_age_factor*v_workload_factor
        *(0.72+v_coach_score/180.0)
        *(0.55+least(v_gap,30)/30.0)
        *(case when v_rider.fatigue>=60 then 0.55 else 1.0 end)
      )
    );

    if v_gap>0
       and private.youth_attribute_value_v1(v_rider,v_focus)<v_rider.hidden_potential
       and random()<v_chance then
      v_primary_delta:=1;
      perform private.apply_youth_attribute_delta_v1(v_rider.id,v_focus,1);
    else
      v_primary_delta:=0;
    end if;

    if v_gap>=8
       and private.youth_attribute_value_v1(v_rider,v_secondary)<v_rider.hidden_potential
       and random()<(v_chance*0.28) then
      v_secondary_delta:=1;
      perform private.apply_youth_attribute_delta_v1(v_rider.id,v_secondary,1);
    else
      v_secondary_delta:=0;
    end if;

    v_fatigue_after:=least(100,greatest(0,
      v_rider.fatigue+
      case v_workload when 'light' then -3 when 'high' then 5 else 1 end
    ));
    v_readiness_after:=least(100,greatest(0,
      v_rider.readiness+
      case v_workload when 'light' then 2 when 'high' then -2 else 0 end+
      case when v_coach_score>=75 then 1 else 0 end
    ));

    update public.youth_riders
    set workload=v_workload,
        fatigue=v_fatigue_after,
        readiness=v_readiness_after,
        updated_at=now()
    where id=v_rider.id;

    insert into public.youth_development_weekly_runs(
      youth_rider_id,academy_id,week_start,processed_on,age,coach_score,
      workload,development_focus,attribute_changed,primary_delta,
      secondary_attribute_changed,secondary_delta,readiness_before,
      readiness_after,fatigue_before,fatigue_after,metadata
    )
    values(
      v_rider.id,v_rider.academy_id,v_week_start,p_game_date,v_age,v_coach_score,
      v_workload,v_focus,
      case when v_primary_delta>0 then v_focus else null end,v_primary_delta,
      case when v_secondary_delta>0 then v_secondary else null end,v_secondary_delta,
      v_rider.readiness,v_readiness_after,v_rider.fatigue,v_fatigue_after,
      jsonb_build_object(
        'hidden_potential_gap',v_gap,
        'development_probability',round(v_chance,4),
        'training_philosophy',v_philosophy
      )
    );

    v_processed:=v_processed+1;
    if v_primary_delta+v_secondary_delta>0 then v_improved:=v_improved+1; end if;
  end loop;

  return jsonb_build_object(
    'processed',v_processed,'improved',v_improved,'weekly_run',true,
    'week_start',v_week_start
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.process_youth_recruitment_offer_v1(p_academy_id uuid, p_report_id uuid, p_stipend_weekly integer, p_accommodation_weekly integer, p_compensation_offer bigint, p_decision_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_report public.youth_scouting_reports%rowtype;
  v_academy public.youth_academies%rowtype;
  v_club public.clubs%rowtype;
  v_source_academy public.youth_academies%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_end_date date;
  v_weeks integer;
  v_active_count integer;
  v_weekly_commit bigint;
  v_available bigint;
  v_source_decision text:='not_required';
  v_rider_decision text:='pending';
  v_status text:='submitted';
  v_reason text;
  v_rider_score numeric;
  v_source_accept_chance numeric;
  v_head_coach_skill integer:=0;
  v_offer_id uuid;
  v_new_rider_id uuid;
  v_agreement_id uuid;
begin
  if p_decision_mode not in ('manager','academy_director') then
    raise exception 'Invalid recruitment decision mode.';
  end if;

  select * into v_academy
  from public.youth_academies a
  where a.id=p_academy_id and a.is_active=true
  for update;

  if v_academy.id is null then raise exception 'Youth Academy not found'; end if;

  select * into v_club from public.clubs c where c.id=v_academy.club_id;
  select * into v_settings from private.youth_effective_settings_v1 s
  where s.academy_id=p_academy_id;

  select * into v_report
  from public.youth_scouting_reports r
  where r.id=p_report_id
    and r.academy_id=p_academy_id
    and r.status in ('new','shortlisted','approached')
    and r.expires_on>=v_game_date
  for update;

  if v_report.id is null then raise exception 'Scouting report is not available'; end if;
  if v_report.target_kind='unattached' then p_compensation_offer:=0; end if;
  if p_decision_mode='academy_director' and v_settings.recruitment_negotiation_decider<>'academy_director' then raise exception 'Youth negotiation responsibility is assigned to the manager'; end if;
  if exists(select 1 from public.youth_recruitment_offers where report_id=p_report_id and status='submitted') then raise exception 'An offer is already pending'; end if;

  select count(*) into v_active_count
  from public.youth_riders r
  where r.academy_id=p_academy_id
    and r.status in ('academy','graduating');

  if v_active_count>=16 then raise exception 'Youth Academy is full (16/16)'; end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=p_academy_id and b.season_number=v_season
  for update;

  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;

  v_end_date:=public.get_game_date_for_season_end(v_season);
  v_weeks:=greatest(1,ceil(greatest(0,(v_end_date-v_game_date))::numeric/7.0)::integer);
  v_weekly_commit:=(greatest(0,p_stipend_weekly)+greatest(0,p_accommodation_weekly))::bigint*v_weeks;
  v_available:=greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount);

  if greatest(0,p_compensation_offer)+v_weekly_commit>v_available then
    raise exception 'Youth Academy budget is insufficient for this offer package.';
  end if;

  if v_report.target_kind='academy' then
    select * into v_source_academy
    from public.youth_academies a
    where a.id=v_report.source_academy_id
    for update;

    if v_source_academy.id is null then
      v_source_decision:='rejected';
      v_status:='academy_rejected';
      v_reason:='Source Academy is no longer available.';
    elsif not v_source_academy.is_ai then
      v_source_decision:='pending';
      v_status:='submitted';
    else
      v_source_accept_chance:=case
        when p_compensation_offer>=v_report.suggested_compensation*1.05 then 0.95
        when p_compensation_offer>=v_report.suggested_compensation then 0.85
        when p_compensation_offer>=v_report.suggested_compensation*0.80 then 0.60
        when p_compensation_offer>=v_report.suggested_compensation*0.65 then 0.30
        else 0.05
      end;

      if random()<=v_source_accept_chance then
        v_source_decision:='accepted';
      else
        v_source_decision:='rejected';
        v_status:='academy_rejected';
        v_reason:='The current Academy rejected the development compensation offer.';
      end if;
    end if;
  end if;

  if v_status='submitted' and v_source_decision<>'pending' then
    select coalesce(round(
      cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25
    )::integer,0)
    into v_head_coach_skill
    from public.club_staff cs
    where cs.club_id=v_academy.club_id
      and cs.role_type='u16_head_coach'
      and cs.is_active=true and private.youth_staff_available_v1(cs.id)
    order by cs.expertise desc
    limit 1;

    v_rider_score:=45
      + case
          when upper(v_report.country_code)=upper(v_club.country_code) then 22
          when private.youth_country_allowed_v1(v_club.country_code,v_report.country_code,'regional') then 10
          when private.youth_country_allowed_v1(v_club.country_code,v_report.country_code,'continental') then 0
          else -8
        end
      + least(22,greatest(-25,
          ((p_stipend_weekly::numeric/nullif(v_report.expected_stipend_weekly,0))-1.0)*55
        ))
      + case
          when upper(v_report.country_code)=upper(v_club.country_code) then 0
          when p_accommodation_weekly>=v_report.suggested_accommodation_weekly then 14
          else -18
        end
      + least(10,v_head_coach_skill/10.0)
      + least(8,v_academy.reputation/1250.0)
      + case
          when private.youth_academy_age_v1(v_report.birth_date)<=13
               and upper(v_report.country_code)<>upper(v_club.country_code)
          then -10 else 0
        end;

    if random()*100<=least(95,greatest(5,v_rider_score)) then
      v_rider_decision:='accepted';
      v_status:='accepted';
    else
      v_rider_decision:='rejected';
      v_status:='rider_rejected';
      v_reason:='The rider and family declined the proposed move and support package.';
    end if;
  end if;

  insert into public.youth_recruitment_offers(
    report_id,offering_academy_id,source_academy_id,target_youth_rider_id,
    decision_mode,stipend_weekly,accommodation_weekly,compensation_offer,
    source_academy_decision,rider_decision,status,rejection_reason,
    submitted_on,decided_on
  )
  values(
    v_report.id,p_academy_id,v_report.source_academy_id,v_report.target_youth_rider_id,
    p_decision_mode,greatest(50,p_stipend_weekly),greatest(0,p_accommodation_weekly),
    greatest(0,p_compensation_offer),v_source_decision,v_rider_decision,v_status,v_reason,
    v_game_date,v_game_date
  )
  returning id into v_offer_id;

  if v_source_decision='pending' then
    update public.youth_recruitment_offers
    set
      reserved_amount=greatest(0,p_compensation_offer)+v_weekly_commit,
      reserved_weekly_commitment=v_weekly_commit
    where id=v_offer_id;

    update public.youth_academy_season_budgets
    set
      committed_amount=committed_amount+greatest(0,p_compensation_offer)+v_weekly_commit,
      updated_at=now()
    where academy_id=p_academy_id and season_number=v_season;

    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_report.id;

    return v_offer_id;
  end if;

  if v_status='accepted' then
    if v_report.target_kind='unattached' then
      insert into public.youth_riders(
        academy_id,country_code,first_name,last_name,birth_date,role,
        sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
        hidden_potential,readiness,fatigue,development_focus,workload,
        joined_game_date,joined_season,status,is_starter_rider,is_ai_generated
      )
      values(
        p_academy_id,v_report.country_code,v_report.first_name,v_report.last_name,
        v_report.birth_date,v_report.role,
        v_report.sprint,v_report.climbing,v_report.time_trial,v_report.endurance,
        v_report.flat,v_report.recovery,v_report.resistance,v_report.race_iq,
        v_report.teamwork,v_report.hidden_potential,70,0,'balanced','moderate',
        v_game_date,v_season,'academy',false,false
      )
      returning id into v_new_rider_id;
    else
      v_new_rider_id:=v_report.target_youth_rider_id;

      update public.youth_rider_agreements
      set status='ended',updated_at=now()
      where youth_rider_id=v_new_rider_id and status='active';

      update public.youth_riders
      set academy_id=p_academy_id,
          joined_game_date=v_game_date,
          joined_season=v_season,
          status='academy',
          updated_at=now()
      where id=v_new_rider_id;
    end if;

    insert into public.youth_rider_agreements(
      youth_rider_id,academy_id,stipend_weekly,accommodation_weekly,
      starts_on,ends_on,status
    )
    values(
      v_new_rider_id,p_academy_id,greatest(50,p_stipend_weekly),
      greatest(0,p_accommodation_weekly),v_game_date,v_end_date,'active'
    )
    returning id into v_agreement_id;

    update public.youth_academy_season_budgets
    set
      spent_amount=spent_amount+greatest(0,p_compensation_offer),
      committed_amount=committed_amount+v_weekly_commit,
      updated_at=now()
    where academy_id=p_academy_id and season_number=v_season;

    if p_compensation_offer>0 then
      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      )
      values(
        p_academy_id,v_season,v_game_date,'recruitment',
        'Youth recruitment development compensation',
        -greatest(0,p_compensation_offer),
        jsonb_build_object(
          'offer_id',v_offer_id,
          'report_id',v_report.id,
          'youth_rider_id',v_new_rider_id
        )
      );
    end if;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      p_academy_id,v_season,v_game_date,'agreement_commitment',
      'Youth rider support agreement committed for the remaining season',
      0,
      jsonb_build_object(
        'offer_id',v_offer_id,
        'agreement_id',v_agreement_id,
        'weekly_commitment',greatest(50,p_stipend_weekly)+greatest(0,p_accommodation_weekly),
        'weeks_remaining',v_weeks,
        'committed_amount',v_weekly_commit
      )
    );

    update public.youth_scouting_reports
    set status='signed',target_youth_rider_id=v_new_rider_id,updated_at=now()
    where id=v_report.id;
  else
    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_report.id;
  end if;

  return v_offer_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.process_youth_world_invitation_deadlines_v1(p_game_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race record;
  v_invite record;
  v_entered integer:=0;
  v_declined integer:=0;
  v_expired integer:=0;
  v_wildcards integer:=0;
  v_this_expired integer:=0;
begin
  for v_race in
    select r.id,r.season_number,r.race_date
    from public.youth_races r
    where r.status='scheduled'
      and r.competition_class='world'
      and r.invitation_response_deadline=p_game_date
  loop
    for v_invite in
      select i.academy_id,a.is_ai,
        coalesce(s.race_entry_decider,'u16_head_coach') race_entry_decider
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      left join private.youth_effective_settings_v1 s on s.academy_id=a.id
      where i.race_id=v_race.id
        and i.invitation_type='world_class'
        and i.status='pending'
        and (
          a.is_ai
        )
    loop
      perform private.ensure_youth_monthly_race_plan_v1(
        v_invite.academy_id,v_race.season_number,
        extract(month from v_race.race_date)::integer
      );

      if not private.youth_race_selected_by_plan_v1(
        v_invite.academy_id,v_race.id
      ) then
        update public.youth_race_invitations
        set status='declined',responded_on=p_game_date,updated_at=now(),
            metadata=metadata||jsonb_build_object(
              'decline_reason','monthly_plan_selection'
            )
        where race_id=v_race.id and academy_id=v_invite.academy_id
          and status='pending';
        v_declined:=v_declined+1;
        continue;
      end if;

      begin
        perform private.enter_youth_race_v1(
          v_invite.academy_id,v_race.id,
          case when v_invite.is_ai then 'ai_head_coach' else 'u16_head_coach' end,
          'balanced'
        );
        v_entered:=v_entered+1;
      exception when others then
        update public.youth_race_invitations
        set status='declined',responded_on=p_game_date,updated_at=now(),
            metadata=metadata||jsonb_build_object(
              'decline_reason','budget_roster_or_eligibility'
            )
        where race_id=v_race.id and academy_id=v_invite.academy_id
          and status='pending';
        v_declined:=v_declined+1;
      end;
    end loop;

    with expired as (
      update public.youth_race_invitations
      set status='expired',responded_on=p_game_date,updated_at=now()
      where race_id=v_race.id
        and invitation_type='world_class'
        and status='pending'
      returning 1
    )
    select count(*)::integer into v_this_expired from expired;
    v_expired:=v_expired+coalesce(v_this_expired,0);

    v_wildcards:=v_wildcards+private.fill_youth_world_race_wildcards_v1(v_race.id);
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,
    'world_entries',v_entered,
    'world_declined',v_declined,
    'world_expired',v_expired,
    'wildcards_added',v_wildcards
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.purchase_youth_academy_equipment_v1(p_academy_id uuid, p_catalog_item_id uuid, p_require_manager boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_academy public.youth_academies%rowtype;
  v_catalog public.equipment_catalog%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_game_date date:=public.get_current_game_date_date();
  v_decider text:='manager';
  v_item_id uuid;
  v_discount_pct integer:=0;
  v_purchase_cost bigint:=0;
begin
  select * into v_academy from public.youth_academies
  where id=p_academy_id and is_active=true for update;
  if v_academy.id is null then raise exception 'Youth Academy is not active'; end if;

  select coalesce(s.equipment_decider,'manager') into v_decider
  from private.youth_effective_settings_v1 s where s.academy_id=p_academy_id;
  if p_require_manager and v_decider<>'manager' then
    raise exception 'Equipment purchasing is delegated to the Youth Academy Director.';
  end if;

  select * into v_catalog from public.equipment_catalog ec
  where ec.id=p_catalog_item_id and ec.is_active=true
    and ec.equipment_kind='durable' and ec.tier between 1 and 2
    and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes');
  if v_catalog.id is null then raise exception 'This item is not available to the Youth Academy.'; end if;

  v_discount_pct:=private.youth_academy_director_discount_pct_v1(v_academy.club_id);
  v_purchase_cost:=greatest(0,round(v_catalog.base_price_cash*(1-v_discount_pct/100.0))::bigint);

  select * into v_budget from public.youth_academy_season_budgets b
  where b.academy_id=p_academy_id and b.season_number=v_season for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;
  if v_purchase_cost>greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount) then
    raise exception 'Youth Academy budget is too low for this equipment purchase.';
  end if;

  insert into public.youth_academy_equipment_inventory(
    academy_id,season_number,catalog_item_id,equipment_category,display_name,
    quality_score,durability_score,condition_percent,purchase_cost,status,purchased_on,metadata
  )
  values(
    p_academy_id,v_season,v_catalog.id,v_catalog.equipment_category,v_catalog.display_name,
    v_catalog.quality_score,v_catalog.durability_score,100,v_purchase_cost,'available',v_game_date,
    jsonb_build_object(
      'catalog_tier',v_catalog.tier,'catalog_metadata',v_catalog.metadata,
      'catalog_effects',v_catalog.effects,'academy_director_discount_pct',v_discount_pct,
      'catalog_base_price',v_catalog.base_price_cash
    )
  ) returning id into v_item_id;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_purchase_cost,updated_at=now()
  where academy_id=p_academy_id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  values(
    p_academy_id,v_season,v_game_date,'equipment',
    'Youth Academy equipment: '||v_catalog.display_name,-v_purchase_cost,
    jsonb_build_object(
      'inventory_item_id',v_item_id,'catalog_item_id',v_catalog.id,
      'equipment_category',v_catalog.equipment_category,
      'academy_director_discount_pct',v_discount_pct
    )
  );
  return v_item_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.select_youth_race_lineup_v1(p_entry_id uuid, p_selected_by text DEFAULT 'u16_head_coach'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_rider record;
  v_slot integer:=0;
  v_coach_score numeric:=50;
begin
  select * into v_entry from public.youth_race_entries where id=p_entry_id;
  if v_entry.id is null then raise exception 'Youth race entry not found'; end if;
  select * into v_race from public.youth_races where id=v_entry.race_id;

  if p_selected_by='u16_head_coach' and not exists(select 1 from private.youth_effective_settings_v1 s where s.academy_id=v_entry.academy_id and s.race_squad_decider='u16_head_coach') then return 0; end if;

  delete from public.youth_race_lineups where entry_id=p_entry_id;

  select coalesce(max(cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25),50)
  into v_coach_score
  from public.youth_academies a
  left join public.club_staff cs
    on cs.club_id=a.club_id and cs.role_type='u16_head_coach' and cs.is_active=true and private.youth_staff_available_v1(cs.id)
  where a.id=v_entry.academy_id;

  for v_rider in
    select r.id,
      private.youth_race_capability_v1(r,v_race.terrain_type)
      +r.readiness*0.13-r.fatigue*0.16
      +(private.youth_deterministic_fraction_v1(p_entry_id::text||r.id::text||':selection')-0.5)*(100-v_coach_score)*0.35 as selection_score
    from public.youth_riders r
    where r.academy_id=v_entry.academy_id
      and private.youth_rider_available_for_race_v1(r.id,v_race.id)
    order by selection_score desc,r.id
    limit v_race.lineup_size
  loop
    v_slot:=v_slot+1;
    insert into public.youth_race_lineups(
      entry_id,youth_rider_id,slot_no,selected_by
    )
    values(p_entry_id,v_rider.id,v_slot,p_selected_by);
  end loop;

  return v_slot;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.simulate_youth_race_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_row record;
  v_position integer:=0;
  v_finished integer:=0;
  v_dnf integer:=0;
  v_dns integer:=0;
  v_points integer;
  v_regional integer;
  v_world integer;
  v_gap integer;
  v_time integer;
  v_fatigue integer;
  v_dev integer;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if exists(select 1 from public.youth_race_processing_log where race_id=p_race_id) then
    return (select result from public.youth_race_processing_log where race_id=p_race_id);
  end if;

  create temporary table if not exists pg_temp.youth_race_scores(
    entry_id uuid,academy_id uuid,youth_rider_id uuid,
    result_status text,score numeric
  ) on commit drop;
  truncate pg_temp.youth_race_scores;

  insert into pg_temp.youth_race_scores(
    entry_id,academy_id,youth_rider_id,result_status,score
  )
  select
    e.id,e.academy_id,l.youth_rider_id,
    case
      when r.id is null or r.status<>'academy' then 'dns'
      when not private.youth_race_rider_eligible_v1(r.id,v_race.race_date) then 'dns'
      when private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'incident'
      )<0.025 then 'dnf'
      else 'finished'
    end,
    case when r.id is null then 0 else
      private.youth_race_capability_v1(r,v_race.terrain_type)
      +r.readiness*0.10-r.fatigue*0.14
      +case e.strategy when 'aggressive' then 1.4 when 'conservative' then -0.4 else 0 end
      +coalesce((
        select avg(inv.quality_score)::numeric*0.025
        from public.youth_academy_equipment_inventory inv
        where inv.academy_id=e.academy_id and inv.status in ('available','in_use')
      ),0)
      +coalesce((
        select max(cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25)*0.04
        from public.youth_academies a
        left join public.club_staff cs
          on cs.club_id=a.club_id and cs.role_type='u16_head_coach' and cs.is_active=true and private.youth_staff_available_v1(cs.id)
        where a.id=e.academy_id
      ),2)
      +(private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'form'
      )-0.5)*8.0
    end
  from public.youth_race_entries e
  join public.youth_race_lineups l on l.entry_id=e.id
  left join public.youth_riders r on r.id=l.youth_rider_id
  where e.race_id=p_race_id and e.status='entered';

  for v_row in
    select * from pg_temp.youth_race_scores
    order by
      case result_status when 'finished' then 0 when 'dnf' then 1 else 2 end,
      score desc,youth_rider_id
  loop
    if v_row.result_status='finished' then
      v_position:=v_position+1;
      v_finished:=v_finished+1;
      v_points:=private.youth_race_base_points_v1(v_position);
      if v_race.race_level='regional' then
        v_regional:=v_points;
        v_world:=round(v_points*0.35)::integer;
      elsif v_race.race_level='world_series' then
        v_regional:=0;
        v_world:=round(v_points*1.5)::integer;
      else
        v_regional:=0;
        v_world:=v_points*2;
      end if;
      v_gap:=greatest(0,round((100-v_row.score)*2.2)::integer+v_position*2);
      if v_position=1 then v_gap:=0; end if;
      v_time:=round(v_race.distance_km*85+greatest(0,70-v_row.score)*3)::integer;
      v_fatigue:=case
        when v_race.distance_km>=85 then 15
        when v_race.distance_km>=70 then 12 else 9 end;
      v_dev:=case when private.youth_deterministic_fraction_v1(
        p_race_id::text||v_row.youth_rider_id::text||'development'
      )<case when v_position<=5 then 0.18 else 0.10 end then 1 else 0 end;
    elsif v_row.result_status='dnf' then
      v_dnf:=v_dnf+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=11;v_dev:=0;
    else
      v_dns:=v_dns+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=0;v_dev:=0;
    end if;

    insert into public.youth_race_results(
      race_id,entry_id,academy_id,youth_rider_id,result_status,finish_position,
      time_seconds,gap_seconds,performance_score,regional_points,world_points,
      fatigue_delta,development_bonus,incident_code
    )
    values(
      p_race_id,v_row.entry_id,v_row.academy_id,v_row.youth_rider_id,
      v_row.result_status,
      case when v_row.result_status='finished' then v_position else null end,
      v_time,v_gap,v_row.score,v_regional,v_world,v_fatigue,v_dev,
      case when v_row.result_status='dnf' then 'race_incident' else null end
    );

    if v_fatigue>0 then
      update public.youth_riders
      set fatigue=least(100,fatigue+v_fatigue),
          readiness=greatest(0,readiness-round(v_fatigue*0.65)::integer),
          updated_at=now()
      where id=v_row.youth_rider_id;
    end if;

    if v_dev>0 then
      perform private.apply_youth_attribute_delta_v1(
        v_row.youth_rider_id,
        case v_race.terrain_type
          when 'flat' then 'flat' when 'hilly' then 'endurance'
          when 'mountain' then 'climbing' when 'time_trial' then 'time_trial'
          else 'race_iq' end,
        1
      );
    end if;
  end loop;

  update public.youth_race_entries
  set status='completed',updated_at=now()
  where race_id=p_race_id and status='entered';

  update public.youth_races
  set status='completed',results_published_at=now(),updated_at=now()
  where id=p_race_id;

  insert into public.youth_race_processing_log(
    race_id,processed_game_date,entry_count,rider_count,result
  )
  values(
    p_race_id,v_race.race_date,
    (select count(*) from public.youth_race_entries where race_id=p_race_id and status='completed'),
    v_finished+v_dnf+v_dns,
    jsonb_build_object(
      'race_id',p_race_id,'finished',v_finished,'dnf',v_dnf,'dns',v_dns,
      'results_only',true,'replay_available',false
    )
  );

  return (select result from public.youth_race_processing_log where race_id=p_race_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION private.youth_academy_director_score_v1(p_club_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
  select coalesce((
    select private.youth_staff_quality_score_v1(
      cs.role_type,cs.expertise,cs.experience,cs.potential,
      cs.leadership,cs.efficiency,cs.loyalty
    )
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true and private.youth_staff_available_v1(cs.id)
      and cs.role_type='youth_academy_director'
    order by cs.expertise desc,cs.id
    limit 1
  ),0);
$function$
;

CREATE OR REPLACE FUNCTION private.youth_scout_score_v1(p_club_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce((
    select least(100,greatest(1,round(
      cs.expertise*0.45+
      cs.experience*0.20+
      cs.efficiency*0.25+
      cs.potential*0.10
    )::integer))
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true and private.youth_staff_available_v1(cs.id)
      and cs.role_type='youth_scout'
    order by
      (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
      cs.id
    limit 1
  ),0);
$function$
;

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
  v_class text;
  v_game_date date:=public.get_current_game_date_date();
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
  if v_entry_decider<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach';
  end if;

  select competition_class into v_class
  from public.youth_races where id=p_race_id;

  update public.youth_race_invitations
  set status='declined',responded_on=v_game_date,updated_at=now()
  where race_id=p_race_id and academy_id=v_academy_id and status='pending';

  if not found then raise exception 'No pending Youth race invitation found'; end if;

  if v_class='world' then
    perform private.fill_youth_world_race_wildcards_v1(p_race_id);
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enter_my_youth_race_v1(p_race_id uuid, p_strategy text DEFAULT 'balanced'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_entry_decider
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if coalesce(v_entry_decider,'u16_head_coach')<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach';
  end if;

  perform private.enter_youth_race_v1(v_academy_id,p_race_id,'manager',p_strategy);
  return public.get_my_youth_race_calendar_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_equipment_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_decider text:='manager';
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object('activated',false,'catalog','[]'::jsonb,'inventory','[]'::jsonb);
  end if;

  select coalesce(s.equipment_decider,'manager')
  into v_decider
  from private.youth_effective_settings_v1 s
  where s.academy_id=v_academy.id;

  return jsonb_build_object(
    'activated',true,
    'equipment_decider',coalesce(v_decider,'manager'),
    'catalog',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ec.id,
        'display_name',ec.display_name,
        'equipment_category',ec.equipment_category,
        'tier',ec.tier,
        'quality_score',ec.quality_score,
        'durability_score',ec.durability_score,
        'price',ec.base_price_cash,
        'effects',ec.effects,
        'metadata',ec.metadata
      ) order by ec.equipment_category,ec.base_price_cash,ec.quality_score desc)
      from public.equipment_catalog ec
      where ec.is_active=true
        and ec.equipment_kind='durable'
        and ec.tier between 1 and 2
        and ec.equipment_category in (
          'frame','wheelset','tires','groupset','helmet','shoes'
        )
    ),'[]'::jsonb),
    'inventory',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,
        'catalog_item_id',e.catalog_item_id,
        'display_name',e.display_name,
        'equipment_category',e.equipment_category,
        'quality_score',e.quality_score,
        'durability_score',e.durability_score,
        'condition_percent',e.condition_percent,
        'purchase_cost',e.purchase_cost,
        'status',e.status,
        'purchased_on',e.purchased_on,
        'metadata',e.metadata
      ) order by e.equipment_category,e.purchased_on desc,e.created_at desc)
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy.id
        and e.status<>'retired'
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_finances_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_rider_weekly bigint:=0;
  v_staff_weekly bigint:=0;
  v_senior_cash numeric:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null
  limit 1;

  if v_academy.id is null then return jsonb_build_object('activated',false); end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select coalesce(sum(a.stipend_weekly+a.accommodation_weekly),0)
  into v_rider_weekly
  from public.youth_rider_agreements a
  where a.academy_id=v_academy.id and a.status='active';

  select coalesce(sum(cs.salary_weekly),0)
  into v_staff_weekly
  from public.club_staff cs
  where cs.club_id=v_academy.club_id and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  v_senior_cash:=coalesce(public.finance_get_club_cash_balance(v_academy.club_id),0);

  return jsonb_build_object(
    'activated',true,'season_number',v_season,
    'initial_allocation',coalesce(v_budget.initial_allocation,0),
    'season_budget',coalesce(v_budget.season_budget,0),
    'spent_amount',coalesce(v_budget.spent_amount,0),
    'committed_amount',coalesce(v_budget.committed_amount,0),
    'available_amount',greatest(
      0,coalesce(v_budget.season_budget,0)
      -coalesce(v_budget.spent_amount,0)
      -coalesce(v_budget.committed_amount,0)
    ),
    'senior_cash_balance',v_senior_cash,
    'weekly_rider_support',v_rider_weekly,
    'weekly_staff_salary',v_staff_weekly,
    'weekly_operating_commitment',v_rider_weekly+v_staff_weekly,
    'equipment_spend',coalesce((
      select sum(e.purchase_cost)
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy.id and e.season_number=v_season
    ),0),
    'race_income',coalesce((
      select sum(l.amount)
      from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='race_prize' and l.amount>0
    ),0),
    'budget_transfer_in',coalesce((
      select sum(l.amount)
      from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='budget_transfer_in'
        and coalesce(l.metadata->>'initial_allocation','false')<>'true'
        and l.amount>0
    ),0),
    'budget_transfer_out',coalesce((
      select abs(sum(l.amount))
      from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='budget_transfer_out' and l.amount<0
    ),0),
    'ledger',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,'game_date',x.game_date,'category',x.category,
        'description',x.description,'amount',x.amount
      ) order by x.game_date desc,x.created_at desc)
      from (
        select l.*
        from public.youth_academy_ledger l
        where l.academy_id=v_academy.id and l.season_number=v_season
        order by l.game_date desc,l.created_at desc limit 75
      ) x
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_history_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_frequency text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id,coalesce(s.race_report_frequency,'important_only')
  into v_academy_id,v_frequency
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null
  order by a.created_at asc
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false);
  end if;

  return jsonb_build_object(
    'activated',true,
    'race_report_frequency',v_frequency,
    'summary',jsonb_build_object(
      'graduates',(
        select count(*) from public.youth_graduation_records g
        where g.academy_id=v_academy_id and g.completed_on is not null
      ),
      'race_wins',(
        select count(*) from public.youth_race_results rr
        where rr.academy_id=v_academy_id and rr.finish_position=1
      ),
      'podiums',(
        select count(*) from public.youth_race_results rr
        where rr.academy_id=v_academy_id and rr.finish_position between 1 and 3
      ),
      'races_completed',(
        select count(distinct rr.race_id) from public.youth_race_results rr
        where rr.academy_id=v_academy_id
      )
    ),
    'alumni',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'youth_rider_id',yr.id,
        'rider_name',yr.display_name,
        'country_code',yr.country_code,
        'role',yr.role,
        'joined_game_date',yr.joined_game_date,
        'joined_season',yr.joined_season,
        'joined_age',extract(year from age(yr.joined_game_date,yr.birth_date))::integer,
        'graduated_on',g.completed_on,
        'graduation_age',case when g.completed_on is null then null
          else extract(year from age(g.completed_on,yr.birth_date))::integer end,
        'graduation_decision',g.decision,
        'professional_rider_id',g.professional_rider_id,
        'race_starts',(
          select count(*) from public.youth_race_results rr
          where rr.youth_rider_id=yr.id and rr.result_status in ('finished','dnf')
        ),
        'wins',(
          select count(*) from public.youth_race_results rr
          where rr.youth_rider_id=yr.id and rr.finish_position=1
        ),
        'podiums',(
          select count(*) from public.youth_race_results rr
          where rr.youth_rider_id=yr.id and rr.finish_position between 1 and 3
        ),
        'regional_points',(
          select coalesce(sum(rr.regional_points),0) from public.youth_race_results rr
          where rr.youth_rider_id=yr.id
        ),
        'world_points',(
          select coalesce(sum(rr.world_points),0) from public.youth_race_results rr
          where rr.youth_rider_id=yr.id
        ),
        'final_regional_rank',case when g.completed_on is null then null else
          private.youth_rider_regional_rank_v1(
            yr.id,
            greatest(1,extract(year from g.completed_on)::integer-1999)
          )
        end,
        'final_world_rank',case when g.completed_on is null then null else
          private.youth_rider_world_rank_v1(
            yr.id,
            greatest(1,extract(year from g.completed_on)::integer-1999)
          )
        end
      ) order by g.completed_on desc nulls last,yr.display_name),'[]'::jsonb)
      from public.youth_riders yr
      left join public.youth_graduation_records g on g.youth_rider_id=yr.id
      where yr.academy_id=v_academy_id
        and yr.status in ('graduated','released')
    ),
    'race_reports',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'race_id',rp.race_id,
        'race_name',r.race_name,
        'race_date',r.race_date,
        'race_level',r.race_level,
        'terrain_type',r.terrain_type,
        'distance_km',r.distance_km,
        'report_class',rp.report_class,
        'headline',rp.headline,
        'summary',rp.summary,
        'best_finish',rp.best_finish,
        'podium_count',rp.podium_count,
        'dnf_count',rp.dnf_count,
        'dns_count',rp.dns_count,
        'regional_points',rp.regional_points,
        'world_points',rp.world_points,
        'fatigue_added',rp.fatigue_added,
        'development_events',rp.development_events,
        'key_events',rp.key_events
      ) order by r.race_date desc,r.race_name),'[]'::jsonb)
      from public.youth_race_reports rp
      join public.youth_races r on r.id=rp.race_id
      where rp.academy_id=v_academy_id
    ),
    'development_history',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'week_start',d.week_start,
        'processed_on',d.processed_on,
        'youth_rider_id',d.youth_rider_id,
        'rider_name',yr.display_name,
        'age',d.age,
        'workload',d.workload,
        'development_focus',d.development_focus,
        'attribute_changed',d.attribute_changed,
        'primary_delta',d.primary_delta,
        'secondary_attribute_changed',d.secondary_attribute_changed,
        'secondary_delta',d.secondary_delta,
        'readiness_before',d.readiness_before,
        'readiness_after',d.readiness_after,
        'fatigue_before',d.fatigue_before,
        'fatigue_after',d.fatigue_after
      ) order by d.week_start desc,yr.display_name),'[]'::jsonb)
      from (
        select *
        from public.youth_development_weekly_runs
        where academy_id=v_academy_id
        order by week_start desc
        limit 250
      ) d
      join public.youth_riders yr on yr.id=d.youth_rider_id
    )
  );
end;
$function$
;

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
    coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER'),
    s.race_entry_decider,s.race_squad_decider
  into
    v_academy_id,v_broad_region,v_regional_division,
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
        'lineup_size',r.lineup_size,
        'team_limit',r.team_limit,
        'entries_count',(
          select count(*) from public.youth_race_entries xe
          where xe.race_id=r.id and xe.status in ('entered','completed')
        ),
        'status',r.status,
        'qualified',private.youth_race_academy_qualified_v1(v_academy_id,r.id),
        'invitation_status',i.status,
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
$function$
;

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

CREATE OR REPLACE FUNCTION public.respond_to_youth_recruitment_offer_v1(p_offer_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_offer public.youth_recruitment_offers%rowtype;
  v_report public.youth_scouting_reports%rowtype;
  v_source_academy public.youth_academies%rowtype;
  v_offering_academy public.youth_academies%rowtype;
  v_offering_club public.clubs%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_end_date date:=public.get_game_date_for_season_end(
    coalesce(public.get_current_season_number(),1)
  );
  v_active_count integer;
  v_head_coach_skill integer:=0;
  v_score numeric;
  v_rider_accept boolean:=false;
  v_agreement_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth recruitment offers.';
  end if;

  select o.* into v_offer
  from public.youth_recruitment_offers o
  join public.youth_academies source_a on source_a.id=o.source_academy_id
  join public.clubs source_c on source_c.id=source_a.club_id
  where o.id=p_offer_id
    and source_c.owner_user_id=v_user
    and source_c.deleted_at is null
    and o.source_academy_decision='pending'
    and o.status='submitted'
  for update;

  if v_offer.id is null then
    raise exception 'Incoming Youth recruitment offer is no longer pending.';
  end if;

  select * into v_report
  from public.youth_scouting_reports r
  where r.id=v_offer.report_id
  for update;

  select * into v_source_academy
  from public.youth_academies a
  where a.id=v_offer.source_academy_id
  for update;

  select * into v_offering_academy
  from public.youth_academies a
  where a.id=v_offer.offering_academy_id
  for update;

  if not coalesce(p_accept,false) then
    update public.youth_recruitment_offers
    set
      source_academy_decision='rejected',
      status='academy_rejected',
      rejection_reason='The current Academy manager rejected the approach.',
      decided_on=v_game_date
    where id=v_offer.id;

    update public.youth_academy_season_budgets
    set
      committed_amount=greatest(0,committed_amount-v_offer.reserved_amount),
      updated_at=now()
    where academy_id=v_offer.offering_academy_id
      and season_number=v_season;

    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_offer.report_id;

    return public.get_my_youth_incoming_offers_v1();
  end if;

  select count(*) into v_active_count
  from public.youth_riders r
  where r.academy_id=v_offer.offering_academy_id
    and r.status in ('academy','graduating');

  if v_active_count>=16 then
    update public.youth_recruitment_offers
    set
      source_academy_decision='accepted',
      rider_decision='rejected',
      status='rider_rejected',
      rejection_reason='The offering Academy no longer has a free roster place.',
      decided_on=v_game_date
    where id=v_offer.id;

    update public.youth_academy_season_budgets
    set committed_amount=greatest(0,committed_amount-v_offer.reserved_amount),
        updated_at=now()
    where academy_id=v_offer.offering_academy_id
      and season_number=v_season;

    return public.get_my_youth_incoming_offers_v1();
  end if;

  select * into v_offering_club
  from public.clubs c
  where c.id=v_offering_academy.club_id;

  select coalesce(round(
    cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25
  )::integer,0)
  into v_head_coach_skill
  from public.club_staff cs
  where cs.club_id=v_offering_academy.club_id
    and cs.role_type='u16_head_coach'
    and cs.is_active=true and private.youth_staff_available_v1(cs.id)
  order by cs.expertise desc
  limit 1;

  v_score:=private.youth_offer_acceptance_score_v1(
    v_offering_club.country_code,
    v_report.country_code,
    v_report.expected_stipend_weekly,
    v_offer.stipend_weekly,
    v_report.suggested_accommodation_weekly,
    v_offer.accommodation_weekly,
    private.youth_academy_age_v1(v_report.birth_date),
    v_head_coach_skill,
    v_offering_academy.reputation
  );

  v_rider_accept:=random()*100<=least(95,greatest(5,v_score));

  if not v_rider_accept then
    update public.youth_recruitment_offers
    set
      source_academy_decision='accepted',
      rider_decision='rejected',
      status='rider_rejected',
      rejection_reason='The rider and family declined the proposed move and support package.',
      decided_on=v_game_date
    where id=v_offer.id;

    update public.youth_academy_season_budgets
    set
      committed_amount=greatest(0,committed_amount-v_offer.reserved_amount),
      updated_at=now()
    where academy_id=v_offer.offering_academy_id
      and season_number=v_season;

    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_offer.report_id;

    return public.get_my_youth_incoming_offers_v1();
  end if;

  update public.youth_rider_agreements
  set status='ended',updated_at=now()
  where youth_rider_id=v_offer.target_youth_rider_id
    and status='active';

  update public.youth_riders
  set
    academy_id=v_offer.offering_academy_id,
    joined_game_date=v_game_date,
    joined_season=v_season,
    status='academy',
    updated_at=now()
  where id=v_offer.target_youth_rider_id;

  insert into public.youth_rider_agreements(
    youth_rider_id,academy_id,stipend_weekly,accommodation_weekly,
    starts_on,ends_on,status
  )
  values(
    v_offer.target_youth_rider_id,v_offer.offering_academy_id,
    v_offer.stipend_weekly,v_offer.accommodation_weekly,
    v_game_date,v_end_date,'active'
  )
  returning id into v_agreement_id;

  update public.youth_academy_season_budgets
  set
    committed_amount=greatest(
      0,
      committed_amount-v_offer.compensation_offer
    ),
    spent_amount=spent_amount+v_offer.compensation_offer,
    updated_at=now()
  where academy_id=v_offer.offering_academy_id
    and season_number=v_season;

  -- Development compensation becomes additional Academy budget for a human
  -- source Academy, making the transfer economically meaningful.
  update public.youth_academy_season_budgets
  set season_budget=season_budget+v_offer.compensation_offer,
      updated_at=now()
  where academy_id=v_offer.source_academy_id
    and season_number=v_season;

  if v_offer.compensation_offer>0 then
    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values
      (
        v_offer.offering_academy_id,v_season,v_game_date,'recruitment',
        'Youth recruitment development compensation',
        -v_offer.compensation_offer,
        jsonb_build_object(
          'offer_id',v_offer.id,
          'youth_rider_id',v_offer.target_youth_rider_id
        )
      ),
      (
        v_offer.source_academy_id,v_season,v_game_date,'development_compensation',
        'Youth rider development compensation received',
        v_offer.compensation_offer,
        jsonb_build_object(
          'offer_id',v_offer.id,
          'youth_rider_id',v_offer.target_youth_rider_id
        )
      );
  end if;

  update public.youth_recruitment_offers
  set
    source_academy_decision='accepted',
    rider_decision='accepted',
    status='accepted',
    decided_on=v_game_date
  where id=v_offer.id;

  update public.youth_scouting_reports
  set status='signed',updated_at=now()
  where id=v_offer.report_id;

  return public.get_my_youth_incoming_offers_v1();
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
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.race_squad_decider
  into v_academy_id,v_squad_decider
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

  if v_entry.id is null then
    raise exception 'Enter the race before selecting a lineup';
  end if;
  if cardinality(p_rider_ids)<3 or cardinality(p_rider_ids)>v_race.lineup_size then
    raise exception 'Youth race lineup must contain between 3 and % riders',v_race.lineup_size;
  end if;

  delete from public.youth_race_lineups where entry_id=v_entry.id;

  foreach v_rider_id in array p_rider_ids loop
    if not exists(
      select 1 from public.youth_riders yr
      where yr.id=v_rider_id and yr.academy_id=v_academy_id
        and private.youth_rider_available_for_race_v1(yr.id,p_race_id)
    ) then
      raise exception 'One or more selected Youth Riders are not eligible or are booked in an overlapping race';
    end if;
    v_slot:=v_slot+1;
    insert into public.youth_race_lineups(
      entry_id,youth_rider_id,slot_no,selected_by
    )
    values(v_entry.id,v_rider_id,v_slot,'manager');
  end loop;

  update public.youth_race_entries
  set strategy=case when p_strategy in ('conservative','balanced','aggressive')
    then p_strategy else 'balanced' end,
      updated_at=now()
  where id=v_entry.id;

  return public.get_my_youth_race_calendar_v1();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_youth_staff_course_v1(p_staff_id uuid, p_course_code text)
 RETURNS staff_courses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_staff public.club_staff%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_title text;
  v_focus text;
  v_days integer;
  v_cost bigint;
  v_expertise smallint:=0;
  v_experience smallint:=0;
  v_potential smallint:=0;
  v_leadership smallint:=0;
  v_efficiency smallint:=0;
  v_loyalty smallint:=0;
  v_course public.staff_courses%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required for Youth Academy staff courses.';
  end if;

  select cs.* into v_staff
  from public.club_staff cs
  join public.clubs c on c.id=cs.club_id
  where cs.id=p_staff_id and cs.is_active=true and private.youth_staff_available_v1(cs.id) and c.owner_user_id=v_user
    and c.deleted_at is null
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
  limit 1;
  if v_staff.id is null then raise exception 'Active Youth Academy staff member not found'; end if;

  select a.* into v_academy from public.youth_academies a
  where a.club_id=v_staff.club_id and a.is_active=true limit 1;
  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  if exists(select 1 from public.staff_courses sc where sc.staff_id=v_staff.id and sc.status='active') then
    raise exception 'This staff member is already on a course';
  end if;

  if v_staff.role_type='youth_academy_director' then
    case p_course_code
      when 'youth_director_programme_management' then
        v_title:='Academy Programme Management';v_focus:='Leadership + Efficiency';v_days:=30;v_cost:=16000;v_leadership:=1;v_efficiency:=2;
      when 'youth_director_budget_pathways' then
        v_title:='Academy Budget & Pathways';v_focus:='Academy Management + Efficiency';v_days:=45;v_cost:=26000;v_expertise:=2;v_efficiency:=1;
      when 'youth_director_recruitment_strategy' then
        v_title:='Youth Recruitment Strategy';v_focus:='Talent Pathways + Leadership';v_days:=60;v_cost:=38000;v_potential:=2;v_leadership:=1;v_experience:=1;
      else raise exception 'Invalid Youth Academy Director course';
    end case;
  elsif v_staff.role_type='u16_head_coach' then
    case p_course_code
      when 'u16_development_methodology' then
        v_title:='U16 Development Methodology';v_focus:='Youth Development + Potential';v_days:=30;v_cost:=16000;v_expertise:=2;v_potential:=1;
      when 'u16_workload_management' then
        v_title:='U16 Workload Management';v_focus:='Efficiency + Experience';v_days:=45;v_cost:=26000;v_efficiency:=2;v_experience:=1;
      when 'u16_race_coaching' then
        v_title:='U16 Race Coaching Programme';v_focus:='Race Coaching + Leadership';v_days:=60;v_cost:=38000;v_expertise:=1;v_leadership:=1;v_efficiency:=1;
      else raise exception 'Invalid U16 Head Coach course';
    end case;
  elsif v_staff.role_type='youth_scout' then
    case p_course_code
      when 'youth_scout_talent_id' then
        v_title:='Youth Talent Identification';v_focus:='Talent ID + Accuracy';v_days:=30;v_cost:=16000;v_expertise:=2;v_efficiency:=1;
      when 'youth_scout_network_building' then
        v_title:='Youth Scouting Network';v_focus:='Network + Experience';v_days:=45;v_cost:=24000;v_experience:=2;v_leadership:=1;
      when 'youth_scout_assessment_accuracy' then
        v_title:='Youth Assessment Accuracy';v_focus:='Accuracy + Potential';v_days:=60;v_cost:=36000;v_efficiency:=2;v_potential:=1;v_expertise:=1;
      else raise exception 'Invalid Youth Scout course';
    end case;
  end if;

  select * into v_budget from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;
  if v_cost>greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount) then
    raise exception 'Youth Academy budget is too low for this staff course.';
  end if;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_cost,updated_at=now()
  where academy_id=v_academy.id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  ) values(
    v_academy.id,v_season,v_game_date,'staff_course',
    'Youth staff course: '||v_title,-v_cost,
    jsonb_build_object('staff_id',v_staff.id,'staff_name',v_staff.staff_name,'course_code',p_course_code)
  );

  insert into public.staff_courses(
    club_id,staff_id,course_code,course_title,focus_label,status,
    started_game_date,completes_on_game_date,duration_days,cost_cash,
    expertise_gain,experience_gain,potential_gain,leadership_gain,
    efficiency_gain,loyalty_gain,metadata
  ) values(
    v_staff.club_id,v_staff.id,p_course_code,v_title,v_focus,'active',
    v_game_date,v_game_date+v_days,v_days,v_cost,
    v_expertise,v_experience,v_potential,v_leadership,v_efficiency,v_loyalty,
    jsonb_build_object('role_type',v_staff.role_type,'staff_name',v_staff.staff_name,'paid_from','youth_academy_budget')
  ) returning * into v_course;
  return v_course;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_premium boolean:=false;
  v_budget jsonb;
  v_settings jsonb;
  v_riders jsonb;
  v_staff jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_premium_access_v1(v_user);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'premium',v_premium,'activated',false,
      'club_id',v_club.id,'club_name',v_club.name,
      'country_code',v_club.country_code,'capacity',16,'starter_riders',6,
      'default_season_budget',100000,'default_scouting_range','local',
      'default_scouting_cost',5000
    );
  end if;

  select to_jsonb(b) into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select to_jsonb(s) into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'display_name',r.display_name,'country_code',r.country_code,
    'age',private.youth_academy_age_v1(r.birth_date),'role',r.role,
    'assessment_band',private.youth_potential_band_v1(r.hidden_potential),
    'development_focus',r.development_focus,'workload',r.workload,
    'readiness',r.readiness,'fatigue',r.fatigue,'status',r.status,
    'stipend_weekly',coalesce(agr.stipend_weekly,0)
  ) order by r.birth_date),'[]'::jsonb)
  into v_riders
  from public.youth_riders r
  left join public.youth_rider_agreements agr
    on agr.youth_rider_id=r.id and agr.status='active'
  where r.academy_id=v_academy.id
    and r.status in ('academy','graduating');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cs.id,'role_type',cs.role_type,'specialization',cs.specialization,
    'team_scope',cs.team_scope,'staff_name',cs.staff_name,
    'first_name',cs.first_name,'last_name',cs.last_name,
    'country_code',cs.country_code,'birth_date',cs.birth_date,
    'expertise',cs.expertise,'experience',cs.experience,
    'potential',cs.potential,'leadership',cs.leadership,
    'efficiency',cs.efficiency,'loyalty',cs.loyalty,
    'salary_weekly',cs.salary_weekly,
    'contract_expires_at',cs.contract_expires_at,
    'available',private.youth_staff_available_v1(cs.id),
    'active_course',(select jsonb_build_object('id',sc.id,'title',sc.course_title,'returns_on',sc.completes_on_game_date) from public.staff_courses sc where sc.staff_id=cs.id and sc.status='active' order by sc.created_at desc limit 1)
  ) order by
    case cs.role_type
      when 'youth_academy_director' then 1
      when 'u16_head_coach' then 2
      when 'youth_scout' then 3 else 9 end,
    cs.staff_name
  ),'[]'::jsonb)
  into v_staff
  from public.club_staff cs
  where cs.club_id=v_club.id and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  return jsonb_build_object(
    'premium',v_premium,'activated',true,'read_only',not v_premium,
    'club_id',v_club.id,'club_name',v_club.name,'country_code',v_club.country_code,
    'academy',jsonb_build_object(
      'id',v_academy.id,'capacity',16,
      'active_riders',jsonb_array_length(v_riders),
      'reputation',v_academy.reputation,
      'activated_season',v_academy.activated_season
    ),
    'budget',coalesce(v_budget,'{}'::jsonb),
    'settings',coalesce(v_settings,'{}'::jsonb),
    'effective_settings',(select to_jsonb(es) from private.youth_effective_settings_v1 es where es.academy_id=v_academy.id),
    'staff_decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from (select * from public.youth_staff_decisions where academy_id=v_academy.id order by created_at desc limit 20) d),'[]'::jsonb),
    'training_camps',coalesce((select jsonb_agg(to_jsonb(tc) order by tc.starts_on desc) from public.youth_training_camps tc where tc.academy_id=v_academy.id),'[]'::jsonb),
    'riders',v_riders,'staff',v_staff,
    'scouting_programs',(
      select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order),'[]'::jsonb)
      from public.youth_academy_scouting_programs p where p.is_active=true
    )
  );
end;
$function$
;
-- Camps use the Academy budget and Youth riders only; no senior bookings or riders.
create or replace function private.book_youth_camp_v1(p_academy_id uuid,p_focus text,p_booked_by text)
returns uuid language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_day date:=public.get_current_game_date_date(); v_ids uuid[]; v_cost bigint; v_budget public.youth_academy_season_budgets%rowtype; v_id uuid; v_score integer; v_staff uuid;
begin
 perform 1 from public.youth_academies where id=p_academy_id and is_active for update;
 if not found then raise exception 'Youth Academy is not active'; end if;
 if p_focus not in ('freshness','balanced','development') then raise exception 'Invalid camp focus'; end if;
 if exists(select 1 from public.youth_training_camps where academy_id=p_academy_id and status<>'cancelled' and starts_on>=v_day-28) then raise exception 'Only one Youth camp may be booked every 28 game days'; end if;
 v_staff:=private.youth_available_role_v1(p_academy_id,'academy_director');
 if p_booked_by='academy_director' and not exists(select 1 from private.youth_effective_settings_v1 where academy_id=p_academy_id and camp_decider='academy_director') then raise exception 'Camp responsibility is assigned to the manager'; end if;
 select private.youth_staff_quality_score_v1(role_type,expertise,experience,potential,leadership,efficiency,loyalty) into v_score from public.club_staff where id=v_staff;
 v_score:=coalesce(v_score,45);
 select array_agg(r.id order by r.id) into v_ids from public.youth_riders r where r.academy_id=p_academy_id and r.status='academy'
 and not exists(select 1 from public.youth_race_lineups l join public.youth_race_entries e on e.id=l.entry_id join public.youth_races race on race.id=e.race_id
 where l.youth_rider_id=r.id and e.status='entered' and race.race_date<=v_day+5 and coalesce(race.race_end_date,race.race_date)>=v_day+3);
 if coalesce(cardinality(v_ids),0)=0 then raise exception 'No Youth riders are available for this camp'; end if;
 v_cost:=cardinality(v_ids)*(200+greatest(0,70-v_score)*2);
 select * into v_budget from public.youth_academy_season_budgets where academy_id=p_academy_id and season_number=public.get_current_season_number() for update;
 if v_budget.academy_id is null or v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_cost then raise exception 'Insufficient Academy funds for this camp'; end if;
 insert into public.youth_training_camps(academy_id,starts_on,ends_on,focus,cost,staff_score,booked_by,rider_ids)
 values(p_academy_id,v_day+3,v_day+5,p_focus,v_cost,v_score,p_booked_by,v_ids) returning id into v_id;
 update public.youth_academy_season_budgets set spent_amount=spent_amount+v_cost,updated_at=now() where academy_id=p_academy_id and season_number=public.get_current_season_number();
 insert into public.youth_academy_ledger(academy_id,season_number,game_date,category,description,amount,metadata)
 values(p_academy_id,public.get_current_season_number(),v_day,'training_camp','Youth Academy three-day camp',-v_cost,jsonb_build_object('camp_id',v_id,'riders',cardinality(v_ids),'focus',p_focus));
 return v_id;
end; $$;
revoke all on function private.book_youth_camp_v1(uuid,text,text) from public,anon,authenticated;
create or replace function public.book_my_youth_camp_v1(p_focus text default 'balanced')
returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.user_has_premium_access_v1(auth.uid()) then raise exception 'Premium membership is required'; end if;
 select a.id into v_id from public.youth_academies a join public.clubs c on c.id=a.club_id join private.youth_effective_settings_v1 s on s.academy_id=a.id
 where c.owner_user_id=auth.uid() and c.deleted_at is null and a.is_active and s.camp_decider='manager';
 if v_id is null then raise exception 'Camp booking is not assigned to you'; end if;
 perform private.book_youth_camp_v1(v_id,p_focus,'manager');
 return public.get_my_youth_academy_v1();
end; $$;
revoke all on function public.book_my_youth_camp_v1(text) from public,anon;
grant execute on function public.book_my_youth_camp_v1(text) to authenticated;

create or replace function private.run_youth_staff_decisions_v1(p_academy_id uuid,p_game_date date,p_only text default null)
returns integer language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
 a public.youth_academies%rowtype; s public.youth_academy_settings%rowtype; b public.youth_academy_season_budgets%rowtype;
 v_role text; v_staff public.club_staff%rowtype; v_key text; v_report public.youth_scouting_reports%rowtype;
 v_race record; v_item record; v_id uuid; v_count integer:=0; v_summary text; v_meta jsonb;
 v_score integer; v_available bigint; v_slots integer; v_stipend integer; v_comp bigint; v_focus text; v_avg_fatigue numeric;
begin
 -- One lock and one recorded action per responsibility per game day also cover concurrent RPC/daily calls.
 select * into a from public.youth_academies where id=p_academy_id and is_active and not is_ai for update;
 if a.id is null or not exists(select 1 from public.clubs c where c.id=a.club_id and c.deleted_at is null and public.user_has_premium_access_v1(c.owner_user_id)) then return 0; end if;
 select * into s from private.youth_effective_settings_v1 where academy_id=a.id;
 foreach v_key in array array['recruitment_decider','recruitment_negotiation_decider','race_entry_decider','race_squad_decider','equipment_decider','camp_decider','training_decider'] loop
 if p_only is not null and p_only<>v_key then continue; end if;
 v_role:=to_jsonb(s)->>v_key;
 if v_role is null or v_role='manager' then continue; end if;
 if exists(select 1 from public.youth_staff_decisions where academy_id=a.id and game_date=p_game_date and responsibility=v_key) then continue; end if;
 select * into v_staff from public.club_staff where id=private.youth_available_role_v1(a.id,v_role);
 if v_staff.id is null then continue; end if;
 v_score:=private.youth_staff_quality_score_v1(v_staff.role_type,v_staff.expertise,v_staff.experience,v_staff.potential,v_staff.leadership,v_staff.efficiency,v_staff.loyalty);
 v_summary:=null; v_meta:='{}';
 select * into b from public.youth_academy_season_budgets where academy_id=a.id and season_number=public.get_current_season_number();
 v_available:=greatest(0,b.season_budget-b.spent_amount-b.committed_amount);
 select 16-count(*) into v_slots from public.youth_riders where academy_id=a.id and status in ('academy','graduating');
 begin
 if v_key='recruitment_decider' then
   select * into v_report from public.youth_scouting_reports r where r.academy_id=a.id and r.status='new' and r.expires_on>=p_game_date
     and private.youth_band_rank_v1(r.assessment_band)>=private.youth_band_rank_v1(s.auto_recruit_min_band)
     order by private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+r.confidence*v_score/100.0
       +private.youth_deterministic_fraction_v1(r.id::text||':director')*(100-v_score) desc,r.id limit 1;
   if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
     update public.youth_scouting_reports set status='shortlisted',updated_at=now() where id=v_report.id;
     v_summary:=format('%s shortlisted %s %s for recruitment.',v_staff.staff_name,v_report.first_name,v_report.last_name);
     v_meta:=jsonb_build_object('report_id',v_report.id);
   end if;
 elsif v_key='recruitment_negotiation_decider' then
   select * into v_report from public.youth_scouting_reports r where r.academy_id=a.id and r.status='shortlisted' and r.expires_on>=p_game_date
     and r.expected_stipend_weekly<=s.auto_recruit_max_stipend_weekly and r.suggested_compensation<=s.auto_recruit_max_compensation
     and not exists(select 1 from public.youth_recruitment_offers o where o.report_id=r.id)
     order by private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+r.confidence desc,r.id limit 1;
   if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
     v_stipend:=least(s.auto_recruit_max_stipend_weekly,greatest(50,round(v_report.expected_stipend_weekly*(1+(100-v_score)/500.0))::integer));
     v_comp:=case when v_report.target_kind='unattached' then 0 else least(s.auto_recruit_max_compensation,round(v_report.suggested_compensation*(1+(100-v_score)/400.0))::bigint) end;
     v_id:=private.process_youth_recruitment_offer_v1(a.id,v_report.id,v_stipend,v_report.suggested_accommodation_weekly,v_comp,'academy_director');
     v_summary:=format('%s negotiated with %s %s: %s per week in support, %s one-time compensation. Decision: %s.',v_staff.staff_name,v_report.first_name,v_report.last_name,v_stipend+v_report.suggested_accommodation_weekly,v_comp,(select status from public.youth_recruitment_offers where id=v_id));
     v_meta:=jsonb_build_object('offer_id',v_id);
   end if;
 elsif v_key='equipment_decider' then
   select ec.* into v_item from public.equipment_catalog ec where ec.is_active and ec.equipment_kind='durable' and ec.tier between 1 and 2
     and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes') and ec.base_price_cash<=v_available
     and not exists(select 1 from public.youth_academy_equipment_inventory inv where inv.academy_id=a.id and inv.equipment_category=ec.equipment_category and inv.status in ('available','in_use') and inv.condition_percent>25)
     order by (ec.quality_score::numeric/greatest(ec.base_price_cash,1))*v_score
       +private.youth_deterministic_fraction_v1(ec.id::text||a.id::text)*(100-v_score)/100.0 desc,ec.base_price_cash,ec.id limit 1;
   if v_item.id is not null then
     v_id:=private.purchase_youth_academy_equipment_v1(a.id,v_item.id,false);
     v_summary:=format('%s purchased %s for the Academy.',v_staff.staff_name,v_item.display_name);
     v_meta:=jsonb_build_object('inventory_id',v_id);
   end if;
 elsif v_key='race_entry_decider' then
   -- Accept at most one suitable invitation per game day, including newly delegated near-term races.
   for v_race in select r.* from public.youth_races r join public.youth_race_invitations i on i.race_id=r.id
     where i.academy_id=a.id and i.status='pending' and r.status='scheduled' and r.race_date>p_game_date
       and r.race_date<=p_game_date+14 and (r.invitation_response_deadline is null or r.invitation_response_deadline>=p_game_date or i.invitation_type<>'world_class')
       and private.youth_race_academy_qualified_v1(a.id,r.id)
       and not exists(select 1 from public.youth_race_entries e where e.race_id=r.id and e.academy_id=a.id)
     order by r.invitation_response_deadline nulls last,r.entry_cost*v_score/100.0+private.youth_deterministic_fraction_v1(r.id::text||a.id::text)*(100-v_score)*30,r.race_date limit 20 loop
     perform private.ensure_youth_monthly_race_plan_v1(a.id,v_race.season_number,extract(month from v_race.race_date)::integer);
     -- Approval of the manager's existing monthly limits remains mandatory.
     if not private.youth_race_selected_by_plan_v1(a.id,v_race.id) then continue; end if;
     begin
       v_id:=private.enter_youth_race_v1(a.id,v_race.id,'u16_head_coach',case when v_score>=60 then 'balanced' else 'aggressive' end);
       v_summary:=format('%s entered %s on %s within the approved monthly plan.',v_staff.staff_name,v_race.race_name,v_race.race_date);
       v_meta:=jsonb_build_object('race_id',v_race.id,'entry_id',v_id); exit;
     exception when raise_exception then continue; end;
   end loop;
 elsif v_key='race_squad_decider' then
   select e.id,r.race_name into v_race from public.youth_race_entries e join public.youth_races r on r.id=e.race_id
   where e.academy_id=a.id and e.status='entered' and r.status='scheduled' and r.race_date>p_game_date
     and not exists(select 1 from public.youth_staff_decisions d where d.academy_id=a.id and d.responsibility=v_key and d.metadata->>'entry_id'=e.id::text)
   order by r.race_date,e.id limit 1;
   if v_race.id is not null then
     perform private.select_youth_race_lineup_v1(v_race.id,'u16_head_coach');
     v_summary:=format('%s selected the squad for %s.',v_staff.staff_name,v_race.race_name);
     v_meta:=jsonb_build_object('entry_id',v_race.id);
   end if;
 elsif v_key='camp_decider' then
   if not exists(select 1 from public.youth_training_camps where academy_id=a.id and status<>'cancelled' and starts_on>=p_game_date-28) and v_available>=2000 then
     select avg(fatigue) into v_avg_fatigue from public.youth_riders where academy_id=a.id and status='academy';
     v_focus:=case when v_avg_fatigue>35 and v_score>=50 then 'freshness' when v_score>=65 then 'balanced' else 'development' end;
     v_id:=private.book_youth_camp_v1(a.id,v_focus,'academy_director');
     v_summary:=format('%s booked a three-day %s camp starting %s.',v_staff.staff_name,v_focus,p_game_date+3);
     v_meta:=jsonb_build_object('camp_id',v_id);
   end if;
 elsif v_key='training_decider' then
   if not exists(select 1 from public.youth_staff_decisions where academy_id=a.id and responsibility=v_key and game_date>p_game_date-7) then
     select avg(fatigue) into v_avg_fatigue from public.youth_riders where academy_id=a.id and status='academy';
     v_focus:=case when v_avg_fatigue>case when v_score>=60 then 30 else 55 end then 'freshness' when v_avg_fatigue<20 then 'development' else 'balanced' end;
     update public.youth_academy_settings set training_philosophy=v_focus,updated_at=now() where academy_id=a.id;
     update public.youth_riders set development_focus=case when v_score>=60 then private.youth_focus_for_role_v1(role,'balanced') else 'balanced' end where academy_id=a.id and status='academy';
     v_summary:=format('%s set the training plan to %s after reviewing rider fatigue.',v_staff.staff_name,v_focus);
   end if;
 end if;
 if v_summary is not null then
   insert into public.youth_staff_decisions(academy_id,staff_id,game_date,responsibility,summary,metadata)
   values(a.id,v_staff.id,p_game_date,v_key,v_summary,v_meta);
   perform private.notify_youth_staff_v1(a.id,'YOUTH_STAFF_DECISION','Youth Academy staff decision',v_summary,
   'youth-decision:'||a.id||':'||p_game_date||':'||v_key,v_meta||jsonb_build_object('staff_id',v_staff.id,'responsibility',v_key));
   v_count:=v_count+1;
 end if;
 exception when raise_exception then
   -- Expected budget/eligibility limits must not interrupt the game-day processor.
   -- Unexpected SQL errors deliberately propagate for health monitoring.
   null;
 end;
 end loop;
 return v_count;
end; $$;
revoke all on function private.run_youth_staff_decisions_v1(uuid,date,text) from public,anon,authenticated;

create or replace function private.youth_delegation_changed_v1()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare k text;
begin
 if pg_trigger_depth()>1 then return new; end if;
 foreach k in array array['recruitment_decider','recruitment_negotiation_decider','race_entry_decider','race_squad_decider','equipment_decider','camp_decider','training_decider'] loop
 if (to_jsonb(new)->>k) is distinct from (to_jsonb(old)->>k) and to_jsonb(new)->>k<>'manager' then
 perform private.run_youth_staff_decisions_v1(new.academy_id,public.get_current_game_date_date(),k);
 end if;
 end loop;
 return new;
end; $$;
revoke all on function private.youth_delegation_changed_v1() from public,anon,authenticated;
create trigger youth_delegation_changed after update of recruitment_decider,recruitment_negotiation_decider,race_entry_decider,race_squad_decider,equipment_decider,camp_decider,training_decider
on public.youth_academy_settings for each row execute function private.youth_delegation_changed_v1();

create or replace function public.set_my_youth_training_decider_v1(p_decider text)
returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.user_has_premium_access_v1(auth.uid()) then raise exception 'Premium membership is required'; end if;
 if p_decider not in ('manager','u16_head_coach') then raise exception 'Invalid training responsibility'; end if;
 select a.id into v_id from public.youth_academies a join public.clubs c on c.id=a.club_id where c.owner_user_id=auth.uid() and c.deleted_at is null and a.is_active;
 if v_id is null then raise exception 'Youth Academy not found'; end if;
 update public.youth_academy_settings set training_decider=p_decider,updated_at=now() where academy_id=v_id;
 return public.get_my_youth_academy_v1();
end; $$;
revoke all on function public.set_my_youth_training_decider_v1(text) from public,anon;
grant execute on function public.set_my_youth_training_decider_v1(text) to authenticated;

CREATE OR REPLACE FUNCTION public.process_youth_academy_game_day_v1(p_game_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_dev jsonb;
  v_academy record;
  v_camp record;
  v_races jsonb;
  v_payroll jsonb;
  v_rider record;
  v_ai_graduated integer:=0;
  v_ai_released integer:=0;
  v_human_pending integer:=0;
  v_pathway_expired integer:=0;
  v_can_develop boolean;
begin
  perform public.process_staff_courses();
  for v_academy in select id from public.youth_academies where is_active and not is_ai loop
    perform private.run_youth_staff_decisions_v1(v_academy.id,p_game_date);
  end loop;
  for v_camp in select * from public.youth_training_camps where status='scheduled' and ends_on<=p_game_date for update loop
    update public.youth_riders set
      fatigue=greatest(0,least(100,fatigue+case v_camp.focus when 'freshness' then -8 when 'development' then 4 else -3 end)),
      readiness=least(100,readiness+case when v_camp.staff_score>=65 then 4 else 2 end),updated_at=now()
    where academy_id=v_camp.academy_id and id=any(v_camp.rider_ids) and status='academy';
    update public.youth_training_camps set status='completed' where id=v_camp.id;
  end loop;
  v_payroll:=private.process_youth_academy_weekly_payroll_v1(p_game_date);
  v_dev:=private.process_youth_development_week_v1(p_game_date);
  v_races:=public.process_youth_race_day_v1(p_game_date);

  for v_rider in
    select r.id,r.academy_id,a.is_ai,a.club_id,r.hidden_potential
    from public.youth_riders r join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and extract(year from age(p_game_date,r.birth_date))::integer>=16
      and not exists(select 1 from public.youth_graduation_records g where g.youth_rider_id=r.id)
  loop
    insert into public.youth_graduation_records(
      youth_rider_id,academy_id,main_club_id,became_eligible_on,decision
    ) values(v_rider.id,v_rider.academy_id,v_rider.club_id,p_game_date,'pending');
    update public.youth_riders set status='graduating',updated_at=now() where id=v_rider.id;

    if v_rider.is_ai then
      select exists(
        select 1 from public.clubs d
        where d.parent_club_id=v_rider.club_id and d.club_type='developing'
          and d.deleted_at is null and public.is_developing_team_access_active_v1(d.id)
          and (select count(*) from public.club_riders cr where cr.club_id=d.id)<8
      ) into v_can_develop;
      if v_can_develop and v_rider.hidden_potential>=64 then
        perform private.complete_youth_graduation_v1(v_rider.id,'developing_team',p_game_date,'ai_academy');
        v_ai_graduated:=v_ai_graduated+1;
      else
        perform private.complete_youth_graduation_v1(v_rider.id,'release',p_game_date,'ai_academy');
        v_ai_released:=v_ai_released+1;
      end if;
    else
      v_human_pending:=v_human_pending+1;
    end if;
  end loop;

  for v_rider in
    select g.youth_rider_id
    from public.youth_graduation_records g
    join public.youth_academies a on a.id=g.academy_id
    where g.decision='pathway' and g.completed_on is null
      and g.pathway_expires_on is not null and g.pathway_expires_on<=p_game_date
      and a.is_ai=false
  loop
    perform private.complete_youth_graduation_v1(
      v_rider.youth_rider_id,'release',p_game_date,'pathway_expiry'
    );
    v_pathway_expired:=v_pathway_expired+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,'payroll',v_payroll,'development',v_dev,'races',v_races,
    'ai_graduated_to_developing',v_ai_graduated,'ai_released',v_ai_released,
    'human_graduation_decisions_created',v_human_pending,
    'expired_pathways_released',v_pathway_expired
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_my_youth_academy_equipment_director_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_decider text;
  v_category text;
  v_catalog_id uuid;
  v_available bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,s.equipment_decider
  into v_academy_id,v_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if v_decider<>'academy_director' then
    raise exception 'Equipment responsibility is currently assigned to the manager.';
  end if;

  perform private.run_youth_staff_decisions_v1(v_academy_id,public.get_current_game_date_date(),'equipment_decider');

  return public.get_my_youth_academy_equipment_v1();
end;
$function$
;

create or replace function public.shortlist_my_youth_report_v1(p_report_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,auth,pg_temp as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.user_has_premium_access_v1(auth.uid()) then raise exception 'Premium membership is required'; end if;
 select a.id into v_id from public.youth_academies a join public.clubs c on c.id=a.club_id join private.youth_effective_settings_v1 s on s.academy_id=a.id
 where c.owner_user_id=auth.uid() and c.deleted_at is null and a.is_active and s.recruitment_decider='manager';
 if v_id is null then raise exception 'Recruitment selection is not assigned to you'; end if;
 update public.youth_scouting_reports set status='shortlisted',updated_at=now() where id=p_report_id and academy_id=v_id and status='new' and expires_on>=public.get_current_game_date_date();
 if not found then raise exception 'Scouting report is not available'; end if;
 perform private.run_youth_staff_decisions_v1(v_id,public.get_current_game_date_date(),'recruitment_negotiation_decider');
 return public.get_my_youth_scouting_v1();
end; $$;
revoke all on function public.shortlist_my_youth_report_v1(uuid) from public,anon;
grant execute on function public.shortlist_my_youth_report_v1(uuid) to authenticated;
create table public.youth_race_stage_results (
 race_id uuid not null references public.youth_races(id) on delete cascade,
 stage_number integer not null check(stage_number>0), stage_date date not null,
 entry_id uuid not null references public.youth_race_entries(id) on delete cascade,
 academy_id uuid not null references public.youth_academies(id) on delete cascade,
 youth_rider_id uuid not null references public.youth_riders(id) on delete cascade,
 result_status text not null check(result_status in ('finished','dnf','dns')),
 finish_position integer, time_seconds integer, gap_seconds integer, performance_score numeric,
 primary key(race_id,stage_number,youth_rider_id)
);
alter table public.youth_race_stage_results enable row level security;
revoke all on public.youth_race_stage_results from public,anon,authenticated;
create index youth_stage_results_entry_idx on public.youth_race_stage_results(entry_id);
create index youth_stage_results_academy_idx on public.youth_race_stage_results(academy_id);
create index youth_stage_results_rider_idx on public.youth_race_stage_results(youth_rider_id);
create or replace function private.process_youth_race_stages_v1(p_game_date date)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
declare race public.youth_races%rowtype; stage integer; v_date date;
begin
 for race in select * from public.youth_races where status='scheduled' and race_days>1 and race_date<=p_game_date for update loop
 for stage in 1..least(race.race_days,p_game_date-race.race_date+1) loop
 v_date:=race.race_date+stage-1;
 if exists(select 1 from public.youth_race_stage_results where race_id=race.id and stage_number=stage) then continue; end if;
 insert into public.youth_race_stage_results(race_id,stage_number,stage_date,entry_id,academy_id,youth_rider_id,result_status,finish_position,time_seconds,gap_seconds,performance_score)
 with scores as (
 select e.id entry_id,e.academy_id,r.id rider_id,
 case when r.status<>'academy' or r.academy_id<>e.academy_id or not private.youth_race_rider_eligible_v1(r.id,race.race_date) then 'dns'
 when exists(select 1 from public.youth_race_stage_results prev where prev.race_id=race.id and prev.youth_rider_id=r.id and prev.result_status<>'finished') then 'dnf'
 when private.youth_deterministic_fraction_v1(race.id::text||r.id::text||stage::text||':incident')<0.01 then 'dnf' else 'finished' end status,
 private.youth_race_capability_v1(r,race.terrain_type)+r.readiness*0.10-r.fatigue*0.14
 +case e.strategy when 'aggressive' then 1.4 when 'conservative' then -0.4 else 0 end
 +(private.youth_deterministic_fraction_v1(race.id::text||r.id::text||stage::text||':form')-0.5)*8.0 score
 from public.youth_race_entries e join public.youth_race_lineups l on l.entry_id=e.id join public.youth_riders r on r.id=l.youth_rider_id
 where e.race_id=race.id and e.status='entered'
 ), timed as (select *,case when status='finished' then greatest(1,round(race.distance_km::numeric/race.race_days*85+(100-score)*3)::integer) end elapsed from scores),
 ranked as (select *,row_number() over(order by case status when 'finished' then 0 when 'dnf' then 1 else 2 end,elapsed nulls last,rider_id) pos,min(elapsed) over() winning_time from timed)
 select race.id,stage,v_date,entry_id,academy_id,rider_id,status,case when status='finished' then pos end,elapsed,case when status='finished' then elapsed-winning_time end,score from ranked;
 end loop;
 end loop;
end; $$;
revoke all on function private.process_youth_race_stages_v1(date) from public,anon,authenticated;

create or replace function public.get_my_youth_race_results_v1(p_race_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,private,auth,pg_temp as $$
declare race public.youth_races%rowtype; v_results jsonb; v_stages jsonb;
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if not exists(select 1 from public.youth_academies a join public.clubs c on c.id=a.club_id where c.owner_user_id=auth.uid() and c.deleted_at is null and a.is_active) then raise exception 'Youth Academy not found'; end if;
 select * into race from public.youth_races where id=p_race_id;
 if race.id is null or race.status<>'completed' or coalesce(race.race_end_date,race.race_date)>public.get_current_game_date_date() then raise exception 'Results are available only after the race finishes'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('rider_id',r.id,'rider_name',r.display_name,'country_code',r.country_code,'academy_name',c.name,
 'status',rr.result_status,'position',rr.finish_position,'time_seconds',rr.time_seconds,'gap_seconds',rr.gap_seconds) order by rr.finish_position nulls last,r.display_name),'[]') into v_results
 from public.youth_race_results rr join public.youth_riders r on r.id=rr.youth_rider_id join public.youth_academies a on a.id=rr.academy_id left join public.clubs c on c.id=a.club_id where rr.race_id=p_race_id;
 select coalesce(jsonb_agg(jsonb_build_object('stage_number',st.stage_number,'stage_date',st.stage_date,'results',st.results) order by st.stage_number),'[]') into v_stages from (
 select sr.stage_number,sr.stage_date,jsonb_agg(jsonb_build_object('rider_id',r.id,'rider_name',r.display_name,'country_code',r.country_code,'academy_name',c.name,
 'status',sr.result_status,'position',sr.finish_position,'time_seconds',sr.time_seconds,'gap_seconds',sr.gap_seconds) order by sr.finish_position nulls last,r.display_name) results
 from public.youth_race_stage_results sr join public.youth_riders r on r.id=sr.youth_rider_id join public.youth_academies a on a.id=sr.academy_id left join public.clubs c on c.id=a.club_id
 where sr.race_id=p_race_id group by sr.stage_number,sr.stage_date) st;
 return jsonb_build_object('race_id',race.id,'classification',v_results,'stages',v_stages);
end; $$;
revoke all on function public.get_my_youth_race_results_v1(uuid) from public,anon;
grant execute on function public.get_my_youth_race_results_v1(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.simulate_youth_race_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_row record;
  v_position integer:=0;
  v_finished integer:=0;
  v_dnf integer:=0;
  v_dns integer:=0;
  v_points integer;
  v_regional integer;
  v_world integer;
  v_gap integer;
  v_time integer;
  v_fatigue integer;
  v_dev integer;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if exists(select 1 from public.youth_race_processing_log where race_id=p_race_id) then
    return (select result from public.youth_race_processing_log where race_id=p_race_id);
  end if;

  create temporary table if not exists pg_temp.youth_race_scores(
    entry_id uuid,academy_id uuid,youth_rider_id uuid,
    result_status text,score numeric
  ) on commit drop;
  truncate pg_temp.youth_race_scores;

  insert into pg_temp.youth_race_scores(
    entry_id,academy_id,youth_rider_id,result_status,score
  )
  select
    e.id,e.academy_id,l.youth_rider_id,
    case
      when r.id is null or r.status<>'academy' then 'dns'
      when not private.youth_race_rider_eligible_v1(r.id,v_race.race_date) then 'dns'
      when private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'incident'
      )<0.025 then 'dnf'
      else 'finished'
    end,
    case when r.id is null then 0 else
      private.youth_race_capability_v1(r,v_race.terrain_type)
      +r.readiness*0.10-r.fatigue*0.14
      +case e.strategy when 'aggressive' then 1.4 when 'conservative' then -0.4 else 0 end
      +coalesce((
        select avg(inv.quality_score)::numeric*0.025
        from public.youth_academy_equipment_inventory inv
        where inv.academy_id=e.academy_id and inv.status in ('available','in_use')
      ),0)
      +coalesce((
        select max(cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25)*0.04
        from public.youth_academies a
        left join public.club_staff cs
          on cs.club_id=a.club_id and cs.role_type='u16_head_coach' and cs.is_active=true and private.youth_staff_available_v1(cs.id)
        where a.id=e.academy_id
      ),2)
      +(private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'form'
      )-0.5)*8.0
    end
  from public.youth_race_entries e
  join public.youth_race_lineups l on l.entry_id=e.id
  left join public.youth_riders r on r.id=l.youth_rider_id
  where e.race_id=p_race_id and e.status='entered';

  if v_race.race_days>1 and exists(select 1 from public.youth_race_stage_results where race_id=p_race_id) then
    truncate pg_temp.youth_race_scores;
    insert into pg_temp.youth_race_scores(entry_id,academy_id,youth_rider_id,result_status,score)
    select entry_id,academy_id,youth_rider_id,
      case when bool_or(result_status='dns') then 'dns' when count(*)<v_race.race_days or bool_or(result_status='dnf') then 'dnf' else 'finished' end,
      100.0-sum(time_seconds)::numeric/10000.0
    from public.youth_race_stage_results where race_id=p_race_id group by entry_id,academy_id,youth_rider_id;
  end if;

  for v_row in
    select * from pg_temp.youth_race_scores
    order by
      case result_status when 'finished' then 0 when 'dnf' then 1 else 2 end,
      score desc,youth_rider_id
  loop
    if v_row.result_status='finished' then
      v_position:=v_position+1;
      v_finished:=v_finished+1;
      v_points:=private.youth_race_base_points_v1(v_position);
      if v_race.race_level='regional' then
        v_regional:=v_points;
        v_world:=round(v_points*0.35)::integer;
      elsif v_race.race_level='world_series' then
        v_regional:=0;
        v_world:=round(v_points*1.5)::integer;
      else
        v_regional:=0;
        v_world:=v_points*2;
      end if;
      v_gap:=greatest(0,round((100-v_row.score)*2.2)::integer+v_position*2);
      if v_position=1 then v_gap:=0; end if;
      v_time:=round(v_race.distance_km*85+greatest(0,70-v_row.score)*3)::integer;
      if v_race.race_days>1 and exists(select 1 from public.youth_race_stage_results where race_id=p_race_id) then
        select sum(time_seconds)::integer into v_time from public.youth_race_stage_results where race_id=p_race_id and youth_rider_id=v_row.youth_rider_id;
        select v_time-min(total_time)::integer into v_gap from (
          select sum(time_seconds) total_time from public.youth_race_stage_results where race_id=p_race_id
          group by youth_rider_id having count(*)=v_race.race_days and bool_and(result_status='finished')
        ) totals;
      end if;
      v_fatigue:=case
        when v_race.distance_km>=85 then 15
        when v_race.distance_km>=70 then 12 else 9 end;
      v_dev:=case when private.youth_deterministic_fraction_v1(
        p_race_id::text||v_row.youth_rider_id::text||'development'
      )<case when v_position<=5 then 0.18 else 0.10 end then 1 else 0 end;
    elsif v_row.result_status='dnf' then
      v_dnf:=v_dnf+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=11;v_dev:=0;
    else
      v_dns:=v_dns+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=0;v_dev:=0;
    end if;

    insert into public.youth_race_results(
      race_id,entry_id,academy_id,youth_rider_id,result_status,finish_position,
      time_seconds,gap_seconds,performance_score,regional_points,world_points,
      fatigue_delta,development_bonus,incident_code
    )
    values(
      p_race_id,v_row.entry_id,v_row.academy_id,v_row.youth_rider_id,
      v_row.result_status,
      case when v_row.result_status='finished' then v_position else null end,
      v_time,v_gap,v_row.score,v_regional,v_world,v_fatigue,v_dev,
      case when v_row.result_status='dnf' then 'race_incident' else null end
    );

    if v_fatigue>0 then
      update public.youth_riders
      set fatigue=least(100,fatigue+v_fatigue),
          readiness=greatest(0,readiness-round(v_fatigue*0.65)::integer),
          updated_at=now()
      where id=v_row.youth_rider_id;
    end if;

    if v_dev>0 then
      perform private.apply_youth_attribute_delta_v1(
        v_row.youth_rider_id,
        case v_race.terrain_type
          when 'flat' then 'flat' when 'hilly' then 'endurance'
          when 'mountain' then 'climbing' when 'time_trial' then 'time_trial'
          else 'race_iq' end,
        1
      );
    end if;
  end loop;

  update public.youth_race_entries
  set status='completed',updated_at=now()
  where race_id=p_race_id and status='entered';

  update public.youth_races
  set status='completed',results_published_at=now(),updated_at=now()
  where id=p_race_id;

  insert into public.youth_race_processing_log(
    race_id,processed_game_date,entry_count,rider_count,result
  )
  values(
    p_race_id,v_race.race_date,
    (select count(*) from public.youth_race_entries where race_id=p_race_id and status='completed'),
    v_finished+v_dnf+v_dns,
    jsonb_build_object(
      'race_id',p_race_id,'finished',v_finished,'dnf',v_dnf,'dns',v_dns,
      'results_only',true,'replay_available',false
    )
  );

  return (select result from public.youth_race_processing_log where race_id=p_race_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_youth_race_day_v1(p_game_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_race record;
  v_deadlines jsonb;
  v_auto_entries integer:=0;
  v_processed integer:=0;
begin
  perform public.ensure_youth_competition_memberships_v1(v_season);

  if not exists(
    select 1 from public.youth_races
    where season_number=v_season
      and metadata->>'calendar_source'='youth_hierarchy_v1'
  ) then
    perform public.seed_youth_race_calendar_for_season_v1(v_season);
  end if;

  insert into public.youth_academy_settings(
    academy_id,race_entry_decider,race_squad_decider
  )
  select a.id,'u16_head_coach','u16_head_coach'
  from public.youth_academies a
  where a.is_active=true
  on conflict(academy_id) do nothing;

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount
  )
  select a.id,v_season,100000,0,5000,'local',5000,5000
  from public.youth_academies a
  where a.is_active=true
  on conflict(academy_id,season_number) do nothing;

  v_deadlines:=private.process_youth_world_invitation_deadlines_v1(p_game_date);
  v_auto_entries:=private.auto_enter_youth_races_v1(p_game_date);

  perform private.process_youth_race_stages_v1(p_game_date);

  for v_race in
    select id from public.youth_races
    where status='scheduled'
      and coalesce(race_end_date,race_date)<=p_game_date
    order by coalesce(race_end_date,race_date),id
  loop
    perform private.simulate_youth_race_v1(v_race.id);
    update public.youth_race_invitations
    set status='expired',responded_on=coalesce(responded_on,p_game_date),updated_at=now()
    where race_id=v_race.id and status='pending';
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,
    'invitation_deadlines',v_deadlines,
    'auto_entries',v_auto_entries,
    'races_processed',v_processed,
    'results_only',true,
    'replay_available',false
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.youth_rider_available_for_race_v1(p_rider_id uuid, p_race_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then return false; end if;

  if not private.youth_race_rider_eligible_v1(p_rider_id,v_race.race_date) then
    return false;
  end if;

  if exists(select 1 from public.youth_training_camps tc where p_rider_id=any(tc.rider_ids)
    and tc.status='scheduled' and daterange(tc.starts_on,tc.ends_on,'[]') && daterange(v_race.race_date,coalesce(v_race.race_end_date,v_race.race_date),'[]')) then return false; end if;
  return not exists(
    select 1
    from public.youth_race_lineups l
    join public.youth_race_entries e on e.id=l.entry_id
    join public.youth_races other on other.id=e.race_id
    where l.youth_rider_id=p_rider_id
      and e.status='entered'
      and other.id<>p_race_id
      and daterange(
        other.race_date,coalesce(other.race_end_date,other.race_date),'[]'
      ) && daterange(
        v_race.race_date,coalesce(v_race.race_end_date,v_race.race_date),'[]'
      )
  );
end;
$function$
;

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
  if not public.user_has_premium_access_v1(v_user) then
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
$function$
;

CREATE OR REPLACE FUNCTION public.process_staff_courses()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current_game_date date;
  v_user_id uuid;
  r record;
begin
  v_current_game_date := public.get_current_game_date_date();

  if v_current_game_date is null then
    raise exception 'process_staff_courses: could not resolve current game date';
  end if;

  for r in
    select sc.*
    from public.staff_courses sc
    where sc.status = 'active'
      and sc.completes_on_game_date <= v_current_game_date
    order by sc.completes_on_game_date asc, sc.created_at asc
    for update skip locked
  loop
    update public.club_staff
    set
      expertise = least(100, greatest(0, coalesce(expertise, 0) + coalesce(r.expertise_gain, 0))),
      experience = least(100, greatest(0, coalesce(experience, 0) + coalesce(r.experience_gain, 0))),
      potential = least(100, greatest(0, coalesce(potential, 0) + coalesce(r.potential_gain, 0))),
      leadership = least(100, greatest(0, coalesce(leadership, 0) + coalesce(r.leadership_gain, 0))),
      efficiency = least(100, greatest(0, coalesce(efficiency, 0) + coalesce(r.efficiency_gain, 0))),
      loyalty = least(100, greatest(0, coalesce(loyalty, 0) + coalesce(r.loyalty_gain, 0))),
      notes =
        coalesce(notes, '{}'::jsonb)
        || jsonb_build_object(
          'staff_course_xp',
          jsonb_build_object(
            'last_course_id', r.id,
            'last_course_code', r.course_code,
            'last_course_title', r.course_title,
            'last_completed_game_date', v_current_game_date,
            'last_gains', jsonb_build_object(
              'expertise_gain', coalesce(r.expertise_gain, 0),
              'experience_gain', coalesce(r.experience_gain, 0),
              'potential_gain', coalesce(r.potential_gain, 0),
              'leadership_gain', coalesce(r.leadership_gain, 0),
              'efficiency_gain', coalesce(r.efficiency_gain, 0),
              'loyalty_gain', coalesce(r.loyalty_gain, 0)
            )
          )
        ),
      updated_at = now()
    where id = r.staff_id;

    update public.staff_courses
    set
      status = 'completed',
      completed_game_date = v_current_game_date,
      updated_at = now()
    where id = r.id;

    select c.owner_user_id
    into v_user_id
    from public.clubs c
    where c.id = r.club_id
      and c.deleted_at is null
      and coalesce(c.is_ai, false) = false
    limit 1;

    if v_user_id is not null then
      begin
        perform public.create_staff_course_completion_notification(
          v_user_id,
          r.club_id,
          r.staff_id,
          coalesce(r.metadata ->> 'staff_name', 'Staff member'),
          coalesce(r.metadata ->> 'role_type', ''),
          r.course_code,
          r.course_title,
          r.focus_label,
          v_current_game_date,
          r.expertise_gain,
          r.experience_gain,
          r.potential_gain,
          r.leadership_gain,
          r.efficiency_gain,
          r.loyalty_gain
        );
      exception when others then
        raise warning 'process_staff_courses: failed to create notification for staff course %: %', r.id, sqlerrm;
      end;
    end if;
  end loop;

  return;
end;
$function$
;
