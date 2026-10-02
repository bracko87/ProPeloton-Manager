-- Premium Youth Academy / U16 - Phase 4
-- Permanent Academy history, alumni records and optional U16 Head Coach race reports.

alter table public.youth_academy_settings
  add column if not exists race_report_frequency text not null default 'important_only'
    check(race_report_frequency in (
      'every_race','important_only','podium_exceptional','problems_only','never'
    ));

create table if not exists public.youth_race_reports(
  race_id uuid not null references public.youth_races(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  generated_on date not null,
  report_class text not null
    check(report_class in ('routine','important','exceptional','problem')),
  headline text not null,
  summary text not null,
  best_finish integer,
  podium_count integer not null default 0,
  dnf_count integer not null default 0,
  dns_count integer not null default 0,
  regional_points integer not null default 0,
  world_points integer not null default 0,
  fatigue_added integer not null default 0,
  development_events integer not null default 0,
  key_events jsonb not null default '[]'::jsonb,
  notified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(race_id,academy_id)
);

create index if not exists youth_race_reports_academy_date_idx
on public.youth_race_reports(academy_id,generated_on desc);

alter table public.youth_race_reports enable row level security;

insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group,default_image_url
)
values(
  'YOUTH_RACE_REPORT',
  'Youth Academy Race Report',
  'game',
  'graduation-cap',
  55,
  true,
  'races',
  null
)
on conflict(code) do update
set name=excluded.name,
    source=excluded.source,
    icon_name=excluded.icon_name,
    priority=excluded.priority,
    is_active=true,
    preference_group=excluded.preference_group;

create or replace function private.build_youth_race_report_v1(
  p_race_id uuid,
  p_academy_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
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
  from public.youth_academy_settings s
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

  if v_should_notify and v_owner is not null and v_academy.is_ai=false then
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
    'notification_created',v_should_notify and v_owner is not null and v_academy.is_ai=false,
    'notification_id',v_notification_id
  );
end;
$function$;

create or replace function private.generate_youth_race_reports_for_race_v1(
  p_race_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_entry record;
  v_count integer:=0;
begin
  for v_entry in
    select distinct e.academy_id
    from public.youth_race_entries e
    where e.race_id=p_race_id and e.status='completed'
  loop
    perform private.build_youth_race_report_v1(p_race_id,v_entry.academy_id);
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('race_id',p_race_id,'reports_generated',v_count);
end;
$function$;

create or replace function private.trg_generate_youth_race_reports_v1()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
begin
  if new.status='completed'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    perform private.generate_youth_race_reports_for_race_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_generate_youth_race_reports_v1 on public.youth_races;
create trigger trg_generate_youth_race_reports_v1
after insert or update of status
on public.youth_races
for each row execute function private.trg_generate_youth_race_reports_v1();

-- Backfill internal reports for races completed before this migration.
do $$
declare
  v_race record;
begin
  for v_race in
    select id from public.youth_races where status='completed'
  loop
    perform private.generate_youth_race_reports_for_race_v1(v_race.id);
  end loop;
end $$;

create or replace function public.update_my_youth_race_report_frequency_v1(
  p_frequency text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_frequency not in (
    'every_race','important_only','podium_exceptional','problems_only','never'
  ) then
    raise exception 'Invalid Youth Race Reports frequency';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy not found'; end if;

  update public.youth_academy_settings
  set race_report_frequency=p_frequency,updated_at=now()
  where academy_id=v_academy_id;

  return jsonb_build_object('race_report_frequency',p_frequency);
end;
$function$;

revoke all on function public.update_my_youth_race_report_frequency_v1(text)
from public,anon;
grant execute on function public.update_my_youth_race_report_frequency_v1(text)
to authenticated;

create or replace function public.get_my_youth_academy_history_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
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
  left join public.youth_academy_settings s on s.academy_id=a.id
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
        )
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
$function$;

revoke all on function public.get_my_youth_academy_history_v1()
from public,anon;
grant execute on function public.get_my_youth_academy_history_v1()
to authenticated;
