begin;

insert into public.notification_types(code,name,source,icon_name,priority,is_active,preference_group)
select 'EQUIPMENT_MAINTENANCE_REMINDER','Equipment Maintenance Reminder','game','Wrench',1,true,'equipmentUpdates'
where not exists (
  select 1 from public.notification_types where code='EQUIPMENT_MAINTENANCE_REMINDER'
);

create or replace function public.equipment_process_maintenance_reminders_v1()
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  r record;
  v_created integer := 0;
  v_reset integer := 0;
  v_game_date date := coalesce(public.get_current_game_date_date(), current_date);
  v_event_key text;
begin
  update public.club_equipment_inventory ei
  set metadata=jsonb_set(coalesce(ei.metadata,'{}'::jsonb),'{maintenance_reminder_active}','false'::jsonb,true),
      updated_at=now()
  from public.equipment_premium_preferences pref
  join public.clubs c on c.id=pref.club_id
  where ei.club_id=pref.club_id
    and public.user_has_premium_access_v1(c.owner_user_id)
    and coalesce((ei.metadata->>'maintenance_reminder_active')::boolean,false)=true
    and ei.condition_percent>pref.maintenance_reminder_threshold;

  get diagnostics v_reset=row_count;

  for r in
    select ei.id equipment_id,ei.club_id,ei.display_name,ei.equipment_category,
           ei.condition_percent,pref.maintenance_reminder_threshold,c.owner_user_id
    from public.club_equipment_inventory ei
    join public.equipment_premium_preferences pref on pref.club_id=ei.club_id
    join public.clubs c on c.id=ei.club_id
    where c.deleted_at is null
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and public.user_has_premium_access_v1(c.owner_user_id)
      and ei.sold_game_date is null
      and ei.discarded_game_date is null
      and lower(coalesce(ei.status,'ready'))='ready'
      and ei.condition_percent<=pref.maintenance_reminder_threshold
      and coalesce((ei.metadata->>'maintenance_reminder_active')::boolean,false)=false
    order by ei.club_id,ei.condition_percent,ei.id
    for update of ei skip locked
  loop
    v_event_key:=format(
      'equipment_maintenance_reminder:%s:%s:%s',
      r.equipment_id,v_game_date,floor(r.condition_percent)::int
    );

    perform public.create_user_game_notification_v1(
      r.owner_user_id,
      'EQUIPMENT_MAINTENANCE_REMINDER',
      'Equipment needs maintenance',
      format('%s is at %s%% condition, below your %s%% maintenance reminder threshold.',
             coalesce(r.display_name,'Equipment'),round(r.condition_percent,1),
             r.maintenance_reminder_threshold),
      '/dashboard/equipment?tab=maintenance',
      jsonb_build_object(
        'equipment_id',r.equipment_id,'club_id',r.club_id,
        'display_name',r.display_name,'equipment_category',r.equipment_category,
        'condition_percent',r.condition_percent,'threshold',r.maintenance_reminder_threshold,
        'game_date',v_game_date
      ),
      v_event_key,null
    );

    update public.club_equipment_inventory
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'maintenance_reminder_active',true,
          'maintenance_reminder_last_game_date',v_game_date,
          'maintenance_reminder_last_condition',r.condition_percent,
          'maintenance_reminder_threshold',r.maintenance_reminder_threshold
        ),
        updated_at=now()
    where id=r.equipment_id;

    v_created:=v_created+1;
  end loop;

  return jsonb_build_object(
    'ok',true,'notifications_created',v_created,'reminders_rearmed',v_reset,'game_date',v_game_date
  );
end;
$function$;

revoke all on function public.equipment_process_maintenance_reminders_v1() from public,anon,authenticated;
grant execute on function public.equipment_process_maintenance_reminders_v1() to service_role;

do $$
begin
  if not exists(select 1 from cron.job where jobname='equipment-maintenance-reminders-v1') then
    perform cron.schedule(
      'equipment-maintenance-reminders-v1',
      '7,37 * * * *',
      'select public.equipment_process_maintenance_reminders_v1();'
    );
  end if;
end
$$;

create or replace function public.transfer_refresh_market_alerts_v1()
returns integer
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  s record;
  r record;
  v_count integer := 0;
  v_search text;
  v_role text;
  v_only_active boolean;
  v_hide_own boolean;
  v_fingerprint text;
begin
  for s in
    select ss.* from public.transfer_saved_searches ss where ss.alerts_enabled=true
  loop
    v_search:=lower(btrim(coalesce(s.criteria_json->>'search','')));
    v_role:=lower(btrim(coalesce(s.criteria_json->>'role','all')));
    v_only_active:=coalesce((s.criteria_json->>'only_active')::boolean,true);
    v_hide_own:=coalesce((s.criteria_json->>'hide_own')::boolean,true);

    if s.market_type='transfer_list' then
      for r in
        select m.rider_id::uuid entity_id,
               coalesce(m.full_name,m.display_name,'Unknown rider')::text target_name,
               coalesce(m.asking_price,0)::numeric price_value,
               coalesce(m.status,'active')::text status_value,
               m.seller_club_id,
               null::timestamp without time zone expires_ts
        from public.get_transfer_market_listings(1,10000) m
        where (v_search='' or lower(coalesce(m.full_name,m.display_name,'')) like '%'||v_search||'%')
          and (v_role='all' or lower(coalesce(m.role,''))=v_role)
          and (not v_only_active or coalesce(m.status,'active')='active')
          and (not v_hide_own or m.seller_club_id<>s.club_id)
      loop
        v_fingerprint:=md5(r.price_value::text||':'||r.status_value);
        insert into public.transfer_market_alerts(
          club_id,saved_search_id,target_type,target_id,target_name,alert_type,message,match_fingerprint
        )
        values(
          s.club_id,s.id,'rider',r.entity_id,r.target_name,'new_match',
          format('Matching transfer listing available at %s cash.',to_char(r.price_value,'FM999,999,999')),
          v_fingerprint
        )
        on conflict do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;

    elsif s.market_type='free_agents' then
      for r in
        select fa.rider_id::uuid entity_id,
               coalesce(nullif(btrim(concat_ws(' ',fa.first_name,fa.last_name)),''),
                        fa.display_name,'Unknown rider')::text target_name,
               coalesce(fa.expected_salary_weekly,0)::numeric price_value,
               coalesce(fa.status,'available')::text status_value,
               fa.expires_on_game_date::timestamp without time zone expires_ts
        from public.get_free_agent_market_rows(1,10000) fa
        where (v_search='' or lower(coalesce(
                 nullif(btrim(concat_ws(' ',fa.first_name,fa.last_name)),''),
                 fa.display_name,'')) like '%'||v_search||'%')
          and (v_role='all' or lower(coalesce(fa.role,''))=v_role)
          and (not v_only_active or fa.status in ('available','open'))
      loop
        v_fingerprint:=md5(r.price_value::text||':'||r.status_value||':'||coalesce(r.expires_ts::text,''));
        insert into public.transfer_market_alerts(
          club_id,saved_search_id,target_type,target_id,target_name,alert_type,message,match_fingerprint
        )
        values(
          s.club_id,s.id,'rider',r.entity_id,r.target_name,'new_match',
          format('Matching free agent available. Expected salary: %s/week.',
                 to_char(r.price_value,'FM999,999,999')),
          v_fingerprint
        )
        on conflict do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;

    elsif s.market_type='staff' then
      for r in
        select sm.id::uuid entity_id,
               coalesce(sm.staff_name,nullif(btrim(concat_ws(' ',sm.first_name,sm.last_name)),''),
                        'Unknown staff')::text target_name,
               coalesce(sm.salary_weekly,0)::numeric price_value,
               case when sm.is_available then 'available' else 'unavailable' end::text status_value,
               sm.expires_at_game_ts expires_ts
        from public.get_staff_market_candidates_for_club(s.club_id,1,10000) sm
        where (v_search='' or lower(coalesce(
                 sm.staff_name,nullif(btrim(concat_ws(' ',sm.first_name,sm.last_name)),''),''))
                 like '%'||v_search||'%')
          and (v_role='all' or lower(coalesce(sm.role_type,''))=v_role)
          and (not v_only_active or sm.is_available)
      loop
        v_fingerprint:=md5(r.price_value::text||':'||r.status_value||':'||coalesce(r.expires_ts::text,''));
        insert into public.transfer_market_alerts(
          club_id,saved_search_id,target_type,target_id,target_name,alert_type,message,match_fingerprint
        )
        values(
          s.club_id,s.id,'staff',r.entity_id,r.target_name,'new_match',
          format('Matching staff candidate available at %s/week.',to_char(r.price_value,'FM999,999,999')),
          v_fingerprint
        )
        on conflict do nothing;
        if found then v_count:=v_count+1; end if;
      end loop;
    end if;
  end loop;

  return v_count;
end;
$function$;

create or replace function public.transfer_get_scout_analyst_intelligence_v1(
  p_club_id uuid,p_rider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_report record;
  v_analyst record;
  v_quality numeric:=0;
  v_confidence numeric:=20;
  v_tier text:='basic';
  v_confidence_label text;
begin
  select sr.precision_score,sr.precision_tier,sr.report_json,sr.scout_staff_id
  into v_report
  from public.rider_scout_reports sr
  where sr.club_id=p_club_id and sr.rider_id=p_rider_id
  order by sr.created_at_game_ts desc nulls last,sr.created_at desc
  limit 1;

  select cs.id,cs.staff_name,
         greatest(0,least(100,
           coalesce(cs.expertise,50)*0.35+coalesce(cs.experience,50)*0.20+
           coalesce(cs.efficiency,50)*0.25+coalesce(cs.potential,50)*0.10+
           coalesce(cs.leadership,50)*0.05+coalesce(cs.loyalty,50)*0.05
         )) quality
  into v_analyst
  from public.club_staff cs
  where cs.club_id=p_club_id and cs.role_type='scout_analyst'
    and coalesce(cs.is_active,false)=true
  order by
    (coalesce(cs.expertise,50)*0.35+coalesce(cs.experience,50)*0.20+
     coalesce(cs.efficiency,50)*0.25+coalesce(cs.potential,50)*0.10+
     coalesce(cs.leadership,50)*0.05+coalesce(cs.loyalty,50)*0.05) desc,
    cs.id
  limit 1;

  v_quality:=coalesce(v_analyst.quality,0);

  if v_report.precision_score is not null then
    v_confidence:=v_report.precision_score;
    v_tier:=coalesce(v_report.precision_tier,'basic');
  elsif v_analyst.id is not null then
    v_confidence:=35+greatest(-5,least(15,(v_quality-50)*0.30));
    v_tier:=case
      when v_quality>=85 then 'elite'
      when v_quality>=70 then 'strong'
      when v_quality>=55 then 'solid'
      else 'basic'
    end;
  end if;

  if v_analyst.id is not null and v_report.precision_score is not null then
    v_confidence:=v_confidence+greatest(-4,least(8,(v_quality-50)*0.16));
  end if;

  v_confidence:=round(greatest(0,least(100,v_confidence)),1);
  v_confidence_label:=case
    when v_confidence>=90 then 'elite'
    when v_confidence>=75 then 'strong'
    when v_confidence>=60 then 'good'
    when v_confidence>=40 then 'fair'
    else 'limited'
  end;

  return jsonb_build_object(
    'has_scout_report',v_report.precision_score is not null,
    'precision_score',v_report.precision_score,
    'precision_tier',coalesce(v_report.precision_tier,v_tier),
    'overall_label',v_report.report_json->'overall'->>'label',
    'potential_label',v_report.report_json->'potential'->>'label',
    'analyst_staff_id',v_analyst.id,
    'analyst_name',v_analyst.staff_name,
    'analyst_quality',case when v_analyst.id is null then null else round(v_quality,1) end,
    'analysis_confidence_pct',v_confidence,
    'analysis_confidence_label',v_confidence_label
  );
end;
$function$;

revoke all on function public.transfer_get_scout_analyst_intelligence_v1(uuid,uuid)
from public,anon,authenticated;
grant execute on function public.transfer_get_scout_analyst_intelligence_v1(uuid,uuid) to service_role;

create or replace function public.transfer_get_target_comparison_v1(p_rider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path='public','auth','pg_temp'
as $function$
declare
  v_club_id uuid;
  v_role text;
  v_overall numeric;
  v_salary numeric;
  v_role_count integer:=0;
  v_overall_rank integer;
  v_salary_rank integer;
  v_scout jsonb;
begin
  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id=auth.uid() and c.club_type='main' and c.deleted_at is null
  limit 1;

  if v_club_id is null then raise exception 'Main club not found.'; end if;

  select r.role,r.overall,r.salary into v_role,v_overall,v_salary
  from public.riders r where r.id=p_rider_id;

  select count(*) into v_role_count
  from public.club_roster cr join public.riders r on r.id=cr.rider_id
  where cr.club_id=v_club_id and r.role=v_role;

  select 1+count(*) into v_overall_rank
  from public.club_roster cr join public.riders r on r.id=cr.rider_id
  where cr.club_id=v_club_id and coalesce(r.overall,0)>coalesce(v_overall,0);

  select 1+count(*) into v_salary_rank
  from public.club_roster cr join public.riders r on r.id=cr.rider_id
  where cr.club_id=v_club_id and coalesce(r.salary,0)>coalesce(v_salary,0);

  v_scout:=public.transfer_get_scout_analyst_intelligence_v1(v_club_id,p_rider_id);

  return jsonb_build_object(
    'club_id',v_club_id,'rider_id',p_rider_id,'role_count',v_role_count,
    'overall_rank',v_overall_rank,'salary_rank',v_salary_rank,
    'would_be_highest_paid_in_role',not exists(
      select 1 from public.club_roster cr join public.riders r on r.id=cr.rider_id
      where cr.club_id=v_club_id and r.role=v_role and coalesce(r.salary,0)>coalesce(v_salary,0)
    ),
    'role_duplication_warning',v_role_count>=4,
    'scout_intelligence',v_scout
  );
end;
$function$;

create or replace function public.transfer_list_rider_shortlist_v2(p_club_id uuid)
returns table(
  shortlist_id uuid,rider_id uuid,rider_name text,country_code text,role text,
  age_years integer,overall_label text,potential_label text,current_club_id uuid,
  current_club_name text,source_type text,source_id uuid,notes text,added_at timestamptz,
  availability_type text,listing_id uuid,transfer_price numeric,expected_salary_weekly numeric,
  expires_on_game_date date,availability_label text,is_scouted boolean
)
language plpgsql
stable
security definer
set search_path='public','auth','pg_temp'
as $function$
declare
  v_club_id uuid;
begin
  v_club_id:=public.transfer_assert_owned_main_club_v1(p_club_id);

  return query
  select
    s.id,s.target_id,
    coalesce(nullif(btrim(concat_ws(' ',r.first_name,r.last_name)),''),
             r.display_name,cr.display_name,s.target_name,'Unknown rider')::text,
    coalesce(r.country_code,cr.country_code)::text,
    coalesce(r.role,cr.assigned_role)::text,
    coalesce(cr.age_years,
      extract(year from age(coalesce(public.get_current_game_date_date(),current_date),r.birth_date))::integer),
    coalesce(
      sr.report_json->'overall'->>'label',
      case
        when coalesce(r.overall,cr.overall) is null then null
        when coalesce(r.overall,cr.overall)<40 then '0-40'
        when coalesce(r.overall,cr.overall)<60 then '40-60'
        when coalesce(r.overall,cr.overall)<80 then '60-80'
        else '80-100'
      end
    )::text,
    (sr.report_json->'potential'->>'label')::text,
    cr.club_id,c.name::text,coalesce(s.source_type,'external_profile')::text,s.source_id,s.notes,s.created_at,
    case when tl.id is not null then 'transfer_list'
         when fa.id is not null then 'free_agent'
         else 'not_available' end::text,
    tl.id,tl.asking_price::numeric,fa.expected_salary_weekly::numeric,
    coalesce(tl.expires_on_game_date,fa.expires_on_game_date),
    case when tl.id is not null then 'Transfer listed'
         when fa.id is not null then 'Free Agent'
         else 'Not currently available' end::text,
    (sr.id is not null)
  from public.transfer_shortlist s
  left join public.riders r on r.id=s.target_id
  left join lateral(
    select roster.club_id,roster.display_name,roster.assigned_role,roster.age_years,
           roster.overall,roster.country_code
    from public.club_roster roster
    where roster.rider_id=s.target_id
    order by case when roster.club_id=v_club_id then 0 else 1 end,roster.club_id
    limit 1
  ) cr on true
  left join public.clubs c on c.id=cr.club_id
  left join lateral(
    select rep.id,rep.report_json
    from public.rider_scout_reports rep
    where rep.club_id=v_club_id and rep.rider_id=s.target_id
    order by rep.created_at_game_ts desc nulls last,rep.created_at desc
    limit 1
  ) sr on true
  left join lateral(
    select l.id,l.asking_price,l.expires_on_game_date
    from public.rider_transfer_listings l
    where l.rider_id=s.target_id and l.status in ('listed','active','open')
    order by l.listed_on_game_date desc nulls last limit 1
  ) tl on true
  left join lateral(
    select f.id,f.expected_salary_weekly,f.expires_on_game_date
    from public.rider_free_agents f
    where f.rider_id=s.target_id and f.status in ('available','open')
    order by f.created_at desc limit 1
  ) fa on true
  where s.club_id=v_club_id and s.target_type='rider' and s.removed_at is null
  order by s.created_at desc;
end;
$function$;

commit;
