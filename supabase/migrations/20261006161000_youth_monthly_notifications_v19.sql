-- Youth Academy notification expansion:
-- 1) consistent Youth Academy artwork for all Youth notifications
-- 2) monthly recruitment summary
-- 3) monthly development summary
-- 4) Academy budget warning
-- 5) exact Youth Academy destinations for staff notifications

insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group,default_image_url
)
values
(
  'YOUTH_RECRUITMENT_MONTHLY_SUMMARY',
  'Youth Academy monthly recruitment summary',
  'game','graduation-cap',45,true,'teamUpdates',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
),
(
  'YOUTH_DEVELOPMENT_MONTHLY_SUMMARY',
  'Youth Academy monthly development summary',
  'game','graduation-cap',45,true,'teamUpdates',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
),
(
  'YOUTH_ACADEMY_BUDGET_WARNING',
  'Youth Academy budget warning',
  'game','graduation-cap',75,true,'financeAlerts',
  'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
)
on conflict(code) do update
set name=excluded.name,
    source=excluded.source,
    icon_name=excluded.icon_name,
    priority=excluded.priority,
    is_active=true,
    preference_group=excluded.preference_group,
    default_image_url=excluded.default_image_url;

update public.notification_types
set default_image_url=
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
where code like 'YOUTH_%';

create or replace function private.notify_youth_staff_v1(
  p_academy_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_key text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_user uuid;
  v_payload jsonb;
  v_staff_id uuid;
  v_staff public.club_staff%rowtype;
  v_action_url text := '/dashboard/youth-academy';
  v_responsibility text;
begin
  select c.owner_user_id
  into v_user
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where a.id=p_academy_id
    and not a.is_ai
    and c.deleted_at is null;

  if v_user is null then
    return;
  end if;

  v_payload :=
    jsonb_build_object(
      'academy_id',p_academy_id,
      'image_url',
      'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
    )
    || coalesce(p_payload,'{}'::jsonb);

  begin
    v_staff_id := coalesce(
      nullif(v_payload->>'staff_id','')::uuid,
      nullif(v_payload->>'cover_staff_id','')::uuid
    );
  exception
    when invalid_text_representation then
      v_staff_id := null;
  end;

  if v_staff_id is not null then
    select *
    into v_staff
    from public.club_staff
    where id=v_staff_id
    limit 1;

    if v_staff.id is not null then
      v_payload := v_payload || jsonb_build_object(
        'staff_name',v_staff.staff_name,
        'staff_role',v_staff.role_type,
        'staff_country_code',v_staff.country_code
      );
    end if;
  end if;

  v_responsibility:=coalesce(v_payload->>'responsibility','');

  if upper(coalesce(p_type,''))='YOUTH_STAFF_HANDOVER' then
    v_action_url:='/dashboard/youth-academy?tab=settings';
  elsif upper(coalesce(p_type,''))='YOUTH_STAFF_DECISION' then
    if v_responsibility like 'recruitment%' then
      v_action_url:='/dashboard/youth-academy?tab=scouting';
    elsif v_responsibility like 'race_%' then
      v_action_url:='/dashboard/youth-academy?tab=calendar';
    elsif v_responsibility like 'equipment%' then
      v_action_url:='/dashboard/youth-academy?tab=equipment';
    elsif v_responsibility like 'camp%' or v_responsibility like 'training%' then
      v_action_url:='/dashboard/youth-academy?tab=settings';
    end if;
  end if;

  perform public.create_user_game_notification_v1(
    v_user,p_type,p_title,p_message,v_action_url,
    v_payload,p_key,null
  );
end;
$function$;

create or replace function private.process_youth_academy_summary_notifications_v1(
  p_game_date date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_academy record;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_period_start date;
  v_period_end date;
  v_period_label text;
  v_season integer:=coalesce(public.get_current_season_number(),1);

  v_prospects integer;
  v_shortlisted integer;
  v_offers integer;
  v_accepted integer;
  v_rejected integer;
  v_best_prospect text;
  v_best_band text;

  v_riders_tracked integer;
  v_total_gain integer;
  v_top_name text;
  v_top_gain integer;
  v_avg_readiness integer;
  v_avg_fatigue integer;

  v_available bigint;
  v_available_percent integer;
  v_warning_threshold bigint;
  v_warning_reason text;

  v_monthly_recruitment integer:=0;
  v_monthly_development integer:=0;
  v_budget_warnings integer:=0;
begin
  if p_game_date is null then
    return jsonb_build_object('ok',false,'reason','missing_game_date');
  end if;

  if extract(day from p_game_date)::integer=1 then
    v_period_end:=date_trunc('month',p_game_date)::date;
    v_period_start:=(v_period_end-interval '1 month')::date;
    v_period_label:=
      'Season '||greatest(1,extract(year from v_period_start)::integer-1999)::text||
      ' · '||trim(to_char(v_period_start,'Mon'));

    for v_academy in
      select a.id,a.club_id,c.owner_user_id
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active
        and not a.is_ai
        and c.owner_user_id is not null
        and c.deleted_at is null
    loop
      select
        count(*)::integer,
        count(*) filter(where sr.status in ('shortlisted','approached','signed'))::integer
      into v_prospects,v_shortlisted
      from public.youth_scouting_reports sr
      where sr.academy_id=v_academy.id
        and sr.discovered_on>=v_period_start
        and sr.discovered_on<v_period_end;

      select
        count(*)::integer,
        count(*) filter(where o.status='accepted')::integer,
        count(*) filter(
          where o.status in ('academy_rejected','rider_rejected')
             or o.rider_decision='rejected'
             or o.source_academy_decision='rejected'
        )::integer
      into v_offers,v_accepted,v_rejected
      from public.youth_recruitment_offers o
      where o.offering_academy_id=v_academy.id
        and o.submitted_on>=v_period_start
        and o.submitted_on<v_period_end;

      v_best_prospect:=null;
      v_best_band:=null;
      select concat_ws(' ',sr.first_name,sr.last_name),sr.assessment_band
      into v_best_prospect,v_best_band
      from public.youth_scouting_reports sr
      where sr.academy_id=v_academy.id
        and sr.discovered_on>=v_period_start
        and sr.discovered_on<v_period_end
      order by private.youth_band_rank_v1(sr.assessment_band) desc,
               sr.confidence desc,
               sr.id
      limit 1;

      perform public.create_user_game_notification_v1(
        v_academy.owner_user_id,
        'YOUTH_RECRUITMENT_MONTHLY_SUMMARY',
        'Youth Academy recruitment summary · '||v_period_label,
        format(
          '%s: %s prospect(s) found, %s offer(s) submitted, %s accepted and %s rejected.',
          v_period_label,coalesce(v_prospects,0),coalesce(v_offers,0),
          coalesce(v_accepted,0),coalesce(v_rejected,0)
        ),
        '/dashboard/youth-academy?tab=scouting',
        jsonb_build_object(
          'academy_id',v_academy.id,
          'period_start',v_period_start,
          'period_end',v_period_end-1,
          'period_label',v_period_label,
          'prospects_found',coalesce(v_prospects,0),
          'shortlisted_count',coalesce(v_shortlisted,0),
          'offers_submitted',coalesce(v_offers,0),
          'accepted_count',coalesce(v_accepted,0),
          'rejected_count',coalesce(v_rejected,0),
          'best_prospect_name',v_best_prospect,
          'best_assessment_band',v_best_band,
          'image_url',
          'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
        ),
        'youth-recruitment-monthly:'||v_academy.id::text||':'||to_char(v_period_start,'YYYY-MM'),
        null
      );
      v_monthly_recruitment:=v_monthly_recruitment+1;

      select
        count(distinct w.youth_rider_id)::integer,
        coalesce(sum(coalesce(w.primary_delta,0)+coalesce(w.secondary_delta,0)),0)::integer
      into v_riders_tracked,v_total_gain
      from public.youth_development_weekly_runs w
      where w.academy_id=v_academy.id
        and w.processed_on>=v_period_start
        and w.processed_on<v_period_end;

      v_top_name:=null;
      v_top_gain:=null;
      select yr.display_name,
             sum(coalesce(w.primary_delta,0)+coalesce(w.secondary_delta,0))::integer
      into v_top_name,v_top_gain
      from public.youth_development_weekly_runs w
      join public.youth_riders yr on yr.id=w.youth_rider_id
      where w.academy_id=v_academy.id
        and w.processed_on>=v_period_start
        and w.processed_on<v_period_end
      group by yr.id,yr.display_name
      order by sum(coalesce(w.primary_delta,0)+coalesce(w.secondary_delta,0)) desc,
               yr.display_name
      limit 1;

      select
        coalesce(round(avg(r.readiness))::integer,0),
        coalesce(round(avg(r.fatigue))::integer,0)
      into v_avg_readiness,v_avg_fatigue
      from public.youth_riders r
      where r.academy_id=v_academy.id
        and r.status in ('academy','graduating');

      perform public.create_user_game_notification_v1(
        v_academy.owner_user_id,
        'YOUTH_DEVELOPMENT_MONTHLY_SUMMARY',
        'Youth Academy development summary · '||v_period_label,
        format(
          '%s: %s rider(s) tracked with +%s total skill points%s.',
          v_period_label,coalesce(v_riders_tracked,0),coalesce(v_total_gain,0),
          case
            when v_top_name is not null
              then '. Top improver: '||v_top_name||' (+'||coalesce(v_top_gain,0)::text||')'
            else ''
          end
        ),
        '/dashboard/youth-academy?tab=history',
        jsonb_build_object(
          'academy_id',v_academy.id,
          'period_start',v_period_start,
          'period_end',v_period_end-1,
          'period_label',v_period_label,
          'riders_tracked',coalesce(v_riders_tracked,0),
          'total_skill_gain',coalesce(v_total_gain,0),
          'top_improver_name',v_top_name,
          'top_improver_gain',coalesce(v_top_gain,0),
          'average_readiness',coalesce(v_avg_readiness,0),
          'average_fatigue',coalesce(v_avg_fatigue,0),
          'image_url',
          'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
        ),
        'youth-development-monthly:'||v_academy.id::text||':'||to_char(v_period_start,'YYYY-MM'),
        null
      );
      v_monthly_development:=v_monthly_development+1;
    end loop;
  end if;

  for v_academy in
    select a.id,a.club_id,c.owner_user_id
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active
      and not a.is_ai
      and c.owner_user_id is not null
      and c.deleted_at is null
  loop
    select *
    into v_budget
    from public.youth_academy_season_budgets b
    where b.academy_id=v_academy.id
      and b.season_number=v_season
    limit 1;

    if v_budget.academy_id is null then
      continue;
    end if;

    v_available:=greatest(
      0,
      coalesce(v_budget.season_budget,0)
      -coalesce(v_budget.spent_amount,0)
      -coalesce(v_budget.committed_amount,0)
    );
    v_available_percent:=case
      when coalesce(v_budget.season_budget,0)>0
        then greatest(
          0,
          round(v_available*100.0/v_budget.season_budget)::integer
        )
      else 0
    end;
    v_warning_threshold:=greatest(
      10000,
      ceil(coalesce(v_budget.season_budget,0)*0.10)::bigint
    );

    if v_available<=v_warning_threshold then
      v_warning_reason:=case
        when v_available=0
          then 'No uncommitted Academy budget remains.'
        when v_available_percent<=5
          then 'Available Academy budget is at or below 5% of the season budget.'
        else 'Available Academy budget is below the recommended reserve.'
      end;

      perform public.create_user_game_notification_v1(
        v_academy.owner_user_id,
        'YOUTH_ACADEMY_BUDGET_WARNING',
        'Youth Academy budget warning',
        format(
          'Only $%s remains available from the Season %s Youth Academy budget. Review commitments before approving additional spending.',
          to_char(v_available,'FM999G999G999G990'),v_season
        ),
        '/dashboard/youth-academy?tab=budget',
        jsonb_build_object(
          'academy_id',v_academy.id,
          'season_number',v_season,
          'season_budget',coalesce(v_budget.season_budget,0),
          'spent_amount',coalesce(v_budget.spent_amount,0),
          'committed_amount',coalesce(v_budget.committed_amount,0),
          'available_amount',v_available,
          'available_percent',v_available_percent,
          'warning_threshold',v_warning_threshold,
          'warning_reason',v_warning_reason,
          'image_url',
          'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Youth%20Academy%20Update.png'
        ),
        'youth-budget-warning:'||v_academy.id::text||':'||v_season::text||':'||
          extract(month from p_game_date)::integer::text,
        null
      );
      v_budget_warnings:=v_budget_warnings+1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'game_date',p_game_date,
    'monthly_recruitment_summaries',v_monthly_recruitment,
    'monthly_development_summaries',v_monthly_development,
    'budget_warnings',v_budget_warnings
  );
end;
$function$;

create or replace function public.process_youth_academy_game_day_v1(p_game_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
declare
  v_dev jsonb;
  v_academy record;
  v_camp record;
  v_races jsonb;
  v_payroll jsonb;
  v_notifications jsonb;
  v_rider record;
  v_ai_graduated integer:=0;
  v_ai_released integer:=0;
  v_human_pending integer:=0;
  v_pathway_expired integer:=0;
  v_can_develop boolean;
  v_scouting_reset integer:=0;
begin
  perform public.process_staff_courses();

  v_scouting_reset:=private.reset_youth_scouting_week_v1(p_game_date);

  update public.youth_temporary_responsibility_covers c
  set cleared_on=p_game_date,updated_at=now()
  where c.cleared_on is null
    and private.youth_available_role_v1(c.academy_id,c.original_role) is not null;

  for v_academy in
    select id from public.youth_academies where is_active and not is_ai
  loop
    perform private.run_youth_staff_decisions_v1(v_academy.id,p_game_date);
  end loop;

  for v_camp in
    select * from public.youth_training_camps
    where status='scheduled' and ends_on<=p_game_date
    for update
  loop
    update public.youth_riders
    set fatigue=greatest(0,least(100,fatigue+
          case v_camp.focus when 'freshness' then -8 when 'development' then 4 else -3 end)),
        readiness=least(100,readiness+case when v_camp.staff_score>=65 then 4 else 2 end),
        updated_at=now()
    where academy_id=v_camp.academy_id and id=any(v_camp.rider_ids)
      and status='academy';
    update public.youth_training_camps
    set status='completed' where id=v_camp.id;
  end loop;

  v_payroll:=private.process_youth_academy_weekly_payroll_v1(p_game_date);
  v_dev:=private.process_youth_development_week_v1(p_game_date);
  v_races:=public.process_youth_race_day_v1(p_game_date);
  v_notifications:=private.process_youth_academy_summary_notifications_v1(p_game_date);

  for v_rider in
    select r.id,r.academy_id,a.is_ai,a.club_id,r.hidden_potential
    from public.youth_riders r
    join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and extract(year from age(p_game_date,r.birth_date))::integer>=16
      and not exists(
        select 1 from public.youth_graduation_records g
        where g.youth_rider_id=r.id
      )
  loop
    insert into public.youth_graduation_records(
      youth_rider_id,academy_id,main_club_id,became_eligible_on,decision
    )
    values(v_rider.id,v_rider.academy_id,v_rider.club_id,p_game_date,'pending');
    update public.youth_riders
    set status='graduating',updated_at=now()
    where id=v_rider.id;

    if v_rider.is_ai then
      select exists(
        select 1 from public.clubs d
        where d.parent_club_id=v_rider.club_id
          and d.club_type='developing'
          and d.deleted_at is null
          and public.is_developing_team_access_active_v1(d.id)
          and (select count(*) from public.club_riders cr where cr.club_id=d.id)<8
      ) into v_can_develop;
      if v_can_develop and v_rider.hidden_potential>=64 then
        perform private.complete_youth_graduation_v1(
          v_rider.id,'developing_team',p_game_date,'ai_academy'
        );
        v_ai_graduated:=v_ai_graduated+1;
      else
        perform private.complete_youth_graduation_v1(
          v_rider.id,'release',p_game_date,'ai_academy'
        );
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
      and g.pathway_expires_on is not null
      and g.pathway_expires_on<=p_game_date
      and a.is_ai=false
  loop
    perform private.complete_youth_graduation_v1(
      v_rider.youth_rider_id,'release',p_game_date,'pathway_expiry'
    );
    v_pathway_expired:=v_pathway_expired+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,'scouting_reports_reset',v_scouting_reset,
    'payroll',v_payroll,'development',v_dev,'races',v_races,
    'notifications',v_notifications,
    'ai_graduated_to_developing',v_ai_graduated,
    'ai_released',v_ai_released,
    'human_graduation_decisions_created',v_human_pending,
    'expired_pathways_released',v_pathway_expired
  );
end;
$function$;
