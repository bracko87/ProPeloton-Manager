-- National Championship lifecycle state machine and watchdog.
-- Ranking freezes at least 35 game days before the first event.
-- Only confirmed riders are locked/materialized in Race Preparation and race pages.
-- Qualification-derived finalists require a second confirmation for the final.
-- Results remain private until 30 minutes after replay completion.

update public.national_championship_config
set ranking_freeze_lead_days=greatest(coalesce(ranking_freeze_lead_days,35),35),
    updated_at=now()
where id=true;

insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,user_sensitive,
  incident_severity,expected_interval_minutes,stale_after_minutes,
  email_alerts_enabled,is_enabled,sort_order
)
values(
  'check:national_championship_lifecycle',
  'National Championship lifecycle',
  'Championship Operations',
  'Tracks ranking freeze, qualification-group creation, invitations, rider confirmations/locks, start lists, qualification-to-final handoff and final completion.',
  'business_check',null,true,'critical',5,15,true,true,403
)
on conflict(process_key) do update
set label=excluded.label,
    category=excluded.category,
    description=excluded.description,
    source_kind=excluded.source_kind,
    user_sensitive=excluded.user_sensitive,
    incident_severity=excluded.incident_severity,
    expected_interval_minutes=excluded.expected_interval_minutes,
    stale_after_minutes=excluded.stale_after_minutes,
    email_alerts_enabled=excluded.email_alerts_enabled,
    is_enabled=true,
    sort_order=excluded.sort_order,
    updated_at=now();

CREATE OR REPLACE FUNCTION public.national_championship_entry_confirmed_for_event_v1(p_entry_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select case
      when p_event_type='qualification' then
        en.heat_id=p_heat_id and en.entry_status='qualification_assigned'
        and en.participation_decision in ('approved','auto_approved')
        and public.national_championship_rider_available_for_event_v1(en.rider_id,h.qualification_date)
      when p_event_type='final' and en.entry_path='direct' then
        en.entry_status in ('direct_qualified','finalist')
        and en.participation_decision in ('approved','auto_approved')
        and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date)
      when p_event_type='final' and en.entry_path='qualification' then
        en.entry_status in ('qualified','finalist')
        and en.final_participation_decision in ('approved','auto_approved')
        and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date)
      else false end
    from public.national_championship_entries en
    join public.national_championship_editions e on e.id=en.edition_id
    left join public.national_championship_heats h on h.id=en.heat_id
    where en.id=p_entry_id
  ),false);
$function$;

CREATE OR REPLACE FUNCTION private.national_championship_commitment_conflict_v1(p_rider_id uuid, p_from date, p_until date, p_exclude_edition_id uuid DEFAULT NULL::uuid, p_exclude_duty_type text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
      select 1 from public.rider_commitment_windows w
      where w.rider_id=p_rider_id and w.blocked_from<=p_until and w.blocked_until>=p_from
    )
    or exists(
      select 1 from public.national_championship_duties d
      where d.rider_id=p_rider_id and d.status='confirmed'
        and coalesce(d.duty_start_date,d.duty_date)<=p_until
        and coalesce(d.duty_end_date,d.duty_date)>=p_from
        and not (d.edition_id is not distinct from p_exclude_edition_id
                 and d.duty_type is not distinct from p_exclude_duty_type)
    )
    or exists(
      select 1 from public.world_road_championship_duties d
      where d.rider_id=p_rider_id and d.status='confirmed'
        and d.duty_date between p_from and p_until
    );
$function$;

CREATE OR REPLACE FUNCTION private.ensure_national_championship_confirmed_duty_v1(p_entry_id uuid, p_duty_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  en public.national_championship_entries%rowtype;
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  cfg public.national_championship_config%rowtype;
  v_event_date date; v_days integer; v_from date; v_until date; v_label text;
begin
  select * into en from public.national_championship_entries where id=p_entry_id;
  if en.id is null then raise exception 'National Championship entry not found'; end if;
  select * into e from public.national_championship_editions where id=en.edition_id;
  select * into cfg from public.national_championship_config where id=true;

  if p_duty_type='qualification' then
    if en.entry_path<>'qualification' or en.participation_decision not in ('approved','auto_approved') then
      raise exception 'Qualification participation is not confirmed';
    end if;
    select * into h from public.national_championship_heats where id=en.heat_id;
    if h.id is null then raise exception 'Qualification heat not found'; end if;
    v_event_date:=h.qualification_date;
    v_label:=e.country_code||' National Championship — Qualification Group '||coalesce(en.heat_number,1);
  elsif p_duty_type='final' then
    if en.entry_path='direct' then
      if en.participation_decision not in ('approved','auto_approved') then raise exception 'Final participation is not confirmed'; end if;
    else
      if en.final_participation_decision not in ('approved','auto_approved') then raise exception 'Final participation is not confirmed'; end if;
    end if;
    v_event_date:=e.final_date;
    v_label:=e.country_code||' National Championship — Final';
  else
    raise exception 'Unsupported National Championship duty type';
  end if;

  v_days:=greatest(1,coalesce(cfg.duty_window_days,3));
  v_from:=v_event_date-((v_days-1)/2);
  v_until:=v_from+(v_days-1);

  if private.national_championship_commitment_conflict_v1(en.rider_id,v_from,v_until,e.id,p_duty_type) then
    raise exception 'Rider has another commitment overlapping the National Championship lock window % – %',v_from,v_until;
  end if;

  insert into public.national_championship_duties(
    edition_id,rider_id,duty_type,duty_date,heat_id,status,label,duty_start_date,duty_end_date
  ) values(
    e.id,en.rider_id,p_duty_type,v_event_date,
    case when p_duty_type='qualification' then en.heat_id else null end,
    'confirmed',v_label,v_from,v_until
  )
  on conflict (edition_id,rider_id,duty_type) do update
  set duty_date=excluded.duty_date,heat_id=excluded.heat_id,status='confirmed',
      label=excluded.label,duty_start_date=excluded.duty_start_date,
      duty_end_date=excluded.duty_end_date,updated_at=now();

  return jsonb_build_object('status','confirmed','edition_id',e.id,'rider_id',en.rider_id,
    'duty_type',p_duty_type,'event_date',v_event_date,'blocked_from',v_from,'blocked_until',v_until);
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_results_visible_v1(p_race_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
    select ops.results_published
      and ops.replay_status in ('ready','done','completed')
      and ops.replay_closed_at_real is not null
      and clock_timestamp() >= ops.replay_closed_at_real + interval '30 minutes'
    from public.race_operations_stage_status_v1 ops
    where ops.race_id=p_race_id order by ops.stage_number limit 1
  ),false);
$function$;

CREATE OR REPLACE FUNCTION public.set_my_national_championship_participation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid(); e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype; cfg public.national_championship_config%rowtype;
  v_owner uuid; v_game_date date:=public.get_current_game_date_date();
  v_before integer; v_after integer; v_duty jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into e from public.national_championship_editions where id=p_edition_id;
  select * into en from public.national_championship_entries where edition_id=p_edition_id and rider_id=p_rider_id for update;
  if e.id is null or en.id is null then raise exception 'National Championship entry not found'; end if;
  if en.club_id_snapshot is null then raise exception 'Clubless riders are automatically entered'; end if;
  select case when rc.club_type='developing' and rc.parent_club_id is not null then parent.owner_user_id else rc.owner_user_id end
  into v_owner from public.clubs rc left join public.clubs parent on parent.id=rc.parent_club_id where rc.id=en.club_id_snapshot;
  if v_owner is distinct from v_user then raise exception 'Not allowed to decide for this rider'; end if;
  if e.participation_decision_deadline is null or v_game_date>e.participation_decision_deadline then
    raise exception 'The National Championship participation decision deadline has passed';
  end if;
  if en.participation_decision<>'pending' then
    return jsonb_build_object('edition_id',e.id,'rider_id',en.rider_id,'participation_decision',en.participation_decision,'already_decided',true);
  end if;

  if p_approve then
    update public.national_championship_entries
    set participation_decision='approved',participation_decision_at=now(),participation_decision_user_id=v_user,updated_at=now()
    where id=en.id;
    v_duty:=private.ensure_national_championship_confirmed_duty_v1(
      en.id,case when en.entry_path='qualification' then 'qualification' else 'final' end);
    if en.entry_path='qualification' and en.heat_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',en.heat_id);
    elsif en.entry_path='direct' and e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
    end if;
    return jsonb_build_object('edition_id',e.id,'rider_id',en.rider_id,'participation_decision','approved','lock',v_duty);
  end if;

  select * into cfg from public.national_championship_config where id=true;
  select coalesce(morale,50) into v_before from public.riders where id=en.rider_id for update;
  v_after:=greatest(0,v_before-cfg.refusal_morale_penalty);
  update public.riders set morale=v_after,morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date) where id=en.rider_id;
  update public.national_championship_entries
  set participation_decision='rejected',participation_decision_at=now(),participation_decision_user_id=v_user,
      refusal_morale_delta=-cfg.refusal_morale_penalty,entry_status='withdrawn',updated_at=now()
  where id=en.id;
  update public.national_championship_duties set status='cancelled',updated_at=now()
  where edition_id=e.id and rider_id=en.rider_id and status='confirmed';
  delete from public.national_championship_rider_plans where edition_id=e.id and rider_id=en.rider_id;
  if en.entry_path='qualification' and en.heat_id is not null then
    perform public.national_championship_sync_race_participants_v1(e.id,'qualification',en.heat_id);
  elsif en.entry_path='direct' and e.final_race_id is not null then
    perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
  end if;
  return jsonb_build_object('edition_id',e.id,'rider_id',en.rider_id,'participation_decision','rejected',
    'morale_before',v_before,'morale_after',v_after,'morale_delta',-cfg.refusal_morale_penalty);
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_auto_approve_pending_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game_date date:=public.get_current_game_date_date(); r record; v_count integer:=0;
begin
  for r in
    select en.id,en.edition_id,en.rider_id,en.entry_path,en.heat_id
    from public.national_championship_entries en join public.national_championship_editions e on e.id=en.edition_id
    where en.participation_decision='pending' and e.participation_decision_deadline is not null
      and v_game_date>e.participation_decision_deadline
    order by e.participation_decision_deadline,en.national_rank
  loop
    begin
      update public.national_championship_entries set participation_decision='auto_approved',participation_decision_at=now(),updated_at=now() where id=r.id;
      perform private.ensure_national_championship_confirmed_duty_v1(r.id,case when r.entry_path='qualification' then 'qualification' else 'final' end);
      if r.entry_path='qualification' and r.heat_id is not null then
        perform public.national_championship_sync_race_participants_v1(r.edition_id,'qualification',r.heat_id);
      else
        perform public.national_championship_sync_race_participants_v1(r.edition_id,'final',null);
      end if;
      v_count:=v_count+1;
    exception when others then
      update public.national_championship_entries
      set participation_decision='rejected',participation_decision_at=now(),entry_status='withdrawn',updated_at=now()
      where id=r.id;
    end;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_open_final_confirmations_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game_date date:=public.get_current_game_date_date(); r record; v_opened integer:=0; v_auto integer:=0; v_owner uuid;
begin
  for r in
    select en.id entry_id,en.edition_id,en.rider_id,en.rider_name_snapshot,en.club_id_snapshot,en.entry_path,en.entry_status,
      e.country_code,e.final_date,coalesce(e.final_participation_decision_deadline,e.final_date-7) deadline,e.final_race_id
    from public.national_championship_entries en join public.national_championship_editions e on e.id=en.edition_id
    where en.entry_path='qualification' and en.final_participation_decision='not_open'
      and en.participation_decision in ('approved','auto_approved')
      and en.entry_status in ('qualified','finalist') and e.final_date>v_game_date
    order by e.final_date,e.country_code,en.national_rank
  loop
    v_owner:=null;
    if r.club_id_snapshot is not null then
      select case when c.club_type='developing' and c.parent_club_id is not null then p.owner_user_id else c.owner_user_id end
      into v_owner from public.clubs c left join public.clubs p on p.id=c.parent_club_id where c.id=r.club_id_snapshot;
    end if;
    if v_owner is null then
      update public.national_championship_entries set final_participation_decision='auto_approved',final_participation_decision_at=now(),updated_at=now() where id=r.entry_id;
      begin
        perform private.ensure_national_championship_confirmed_duty_v1(r.entry_id,'final');
        perform public.national_championship_sync_race_participants_v1(r.edition_id,'final',null);
        v_auto:=v_auto+1;
      exception when others then
        update public.national_championship_entries set final_participation_decision='rejected',
          final_participation_decision_at=now(),entry_status='withdrawn',updated_at=now() where id=r.entry_id;
      end;
    else
      update public.national_championship_entries set final_participation_decision='pending',updated_at=now() where id=r.entry_id;
      perform public.ppm_create_user_notification_direct_v1(
        v_owner,'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
        r.rider_name_snapshot||' qualified for the National Championship final',
        r.rider_name_snapshot||' qualified for the '||r.country_code||' National Championship final on '||r.final_date||
        '. Please approve or refuse final participation before '||r.deadline||
        '. If approved, the rider is locked from '||(r.final_date-1)||' through '||(r.final_date+1)||
        ' and cannot participate in another race during that Championship lock window.',
        '/dashboard/national-ranking?tab=duty',
        jsonb_build_object('edition_id',r.edition_id,'country_code',r.country_code,'rider_id',r.rider_id,
          'rider_name',r.rider_name_snapshot,'final_date',r.final_date,'final_race_id',r.final_race_id,
          'final_decision_deadline',r.deadline,'lock_window_start',r.final_date-1,'lock_window_end',r.final_date+1,
          'action_path','/dashboard/national-ranking?tab=duty'),
        'national-final-confirmation:'||r.edition_id::text||':'||r.rider_id::text);
      update public.national_championship_entries set final_decision_notified_at=coalesce(final_decision_notified_at,now()) where id=r.entry_id;
      v_opened:=v_opened+1;
    end if;
  end loop;
  return jsonb_build_object('final_confirmations_opened',v_opened,'final_confirmations_auto_approved',v_auto);
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_auto_approve_final_pending_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_game_date date:=public.get_current_game_date_date(); r record; v_count integer:=0;
begin
  for r in
    select en.id,en.edition_id,en.rider_id,e.final_date
    from public.national_championship_entries en join public.national_championship_editions e on e.id=en.edition_id
    where en.final_participation_decision='pending'
      and v_game_date>coalesce(e.final_participation_decision_deadline,e.final_date-7)
  loop
    begin
      update public.national_championship_entries set final_participation_decision='auto_approved',
        final_participation_decision_at=now(),updated_at=now() where id=r.id;
      perform private.ensure_national_championship_confirmed_duty_v1(r.id,'final');
      perform public.national_championship_sync_race_participants_v1(r.edition_id,'final',null);
      v_count:=v_count+1;
    exception when others then
      update public.national_championship_entries set final_participation_decision='rejected',
        final_participation_decision_at=now(),entry_status='withdrawn',updated_at=now() where id=r.id;
    end;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_national_championship_final_participation_v1(p_edition_id uuid, p_rider_id uuid, p_approve boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid:=auth.uid(); e public.national_championship_editions%rowtype; en public.national_championship_entries%rowtype;
  v_owner uuid; v_game_date date:=public.get_current_game_date_date(); v_penalty integer; v_before integer; v_after integer; v_duty jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select * into e from public.national_championship_editions where id=p_edition_id;
  select * into en from public.national_championship_entries where edition_id=p_edition_id and rider_id=p_rider_id for update;
  if e.id is null or en.id is null then raise exception 'National Championship finalist not found'; end if;
  if en.entry_path<>'qualification' or en.entry_status not in ('qualified','finalist') then
    raise exception 'This rider does not require a second National Championship final confirmation';
  end if;
  if en.final_participation_decision<>'pending' then
    return jsonb_build_object('edition_id',e.id,'rider_id',en.rider_id,'final_participation_decision',en.final_participation_decision,'already_decided',true);
  end if;
  if v_game_date>coalesce(e.final_participation_decision_deadline,e.final_date-7) then
    raise exception 'The National Championship final confirmation deadline has passed';
  end if;
  select case when c.club_type='developing' and c.parent_club_id is not null then p.owner_user_id else c.owner_user_id end
  into v_owner from public.clubs c left join public.clubs p on p.id=c.parent_club_id where c.id=en.club_id_snapshot;
  if v_owner is distinct from v_user then raise exception 'Not allowed to decide for this rider'; end if;

  if p_approve then
    update public.national_championship_entries set final_participation_decision='approved',
      final_participation_decision_at=now(),final_participation_decision_user_id=v_user,updated_at=now() where id=en.id;
    v_duty:=private.ensure_national_championship_confirmed_duty_v1(en.id,'final');
  else
    select greatest(1,abs(coalesce(refusal_morale_penalty,2))) into v_penalty from public.national_championship_config where id=true;
    select coalesce(morale,50) into v_before from public.riders where id=en.rider_id for update;
    v_after:=greatest(0,v_before-v_penalty);
    update public.riders set morale=v_after,morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date) where id=en.rider_id;
    update public.national_championship_entries set final_participation_decision='rejected',
      final_participation_decision_at=now(),final_participation_decision_user_id=v_user,
      final_refusal_morale_delta=-v_penalty,entry_status='withdrawn',updated_at=now() where id=en.id;
    update public.national_championship_duties set status='cancelled',updated_at=now()
    where edition_id=e.id and rider_id=en.rider_id and duty_type='final' and status='confirmed';
  end if;
  perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
  return jsonb_build_object('edition_id',e.id,'rider_id',en.rider_id,
    'final_participation_decision',case when p_approve then 'approved' else 'rejected' end,'lock',v_duty);
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_notify_selection_v1(p_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.national_championship_editions%rowtype; x record; v_count integer:=0; v_country_name text; v_event_date date;
begin
  select * into e from public.national_championship_editions where id=p_edition_id;
  if e.id is null then return 0; end if;
  select coalesce(c.name,e.country_code) into v_country_name from public.countries c where upper(c.code)=upper(e.country_code) limit 1;
  v_country_name:=coalesce(v_country_name,e.country_code);
  for x in
    select en.rider_id,en.rider_name_snapshot,en.entry_path,en.heat_number,en.participation_decision,
      h.qualification_date,root.owner_user_id
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root on root.id=case when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id else rc.id end
    where en.edition_id=e.id and en.participation_decision='pending' and root.owner_user_id is not null
  loop
    v_event_date:=case when x.entry_path='qualification' then x.qualification_date else e.final_date end;
    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_name_snapshot||' selected for National Championship',
      x.rider_name_snapshot||' is selected for the '||v_country_name||' National Championship. '||
      case when x.entry_path='qualification'
        then 'Qualification Group '||coalesce(x.heat_number,1)||' races on '||x.qualification_date||
             '. The first '||coalesce(x.qualifying_places,0)||' rider(s) from this group advance to the final on '||e.final_date||'. '
        else 'No qualification is required; the final is on '||e.final_date||'. ' end||
      'Approve or refuse participation before '||e.participation_decision_deadline||
      '. If approved, the rider is locked from '||(v_event_date-1)||' through '||(v_event_date+1)||
      ' and cannot participate in another race during that Championship lock window.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object('edition_id',e.id,'country_code',e.country_code,'country_name',v_country_name,
        'rider_id',x.rider_id,'rider_name',x.rider_name_snapshot,'entry_path',x.entry_path,'heat_number',x.heat_number,
        'qualification_date',x.qualification_date,'qualifying_places',x.qualifying_places,'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'lock_window_start',v_event_date-1,'lock_window_end',v_event_date+1,
        'action_path','/dashboard/national-ranking?tab=duty',
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.freeze_national_championship_ranking_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  r record;
begin
  v_result:=public.freeze_national_championship_ranking_base_v1(p_edition_id);

  if coalesce(v_result->>'status','')<>'ranking_frozen'
     and coalesce((v_result->>'already_processed')::boolean,false) is not true then
    return v_result;
  end if;

  -- Pending invitations must never block a rider. The base builder creates the
  -- structural entries first; only confirmed/automatic acceptances keep a duty.
  update public.national_championship_duties d
  set status='cancelled',updated_at=now()
  from public.national_championship_entries en
  where en.edition_id=p_edition_id
    and d.edition_id=en.edition_id
    and d.rider_id=en.rider_id
    and d.status='confirmed'
    and en.participation_decision not in ('approved','auto_approved');

  update public.national_championship_entries en
  set entry_status='withdrawn',
      participation_decision='rejected',
      participation_decision_at=coalesce(en.participation_decision_at,now()),
      updated_at=now()
  from public.national_championship_heats h
  where en.edition_id=p_edition_id
    and en.heat_id=h.id
    and en.entry_status='qualification_assigned'
    and not public.national_championship_rider_available_for_event_v1(en.rider_id,h.qualification_date);

  for r in
    select en.id,en.entry_path
    from public.national_championship_entries en
    where en.edition_id=p_edition_id
      and en.entry_status<>'withdrawn'
      and en.participation_decision in ('approved','auto_approved')
    order by en.national_rank
  loop
    begin
      perform private.ensure_national_championship_confirmed_duty_v1(
        r.id,case when r.entry_path='qualification' then 'qualification' else 'final' end
      );
    exception when others then
      update public.national_championship_entries
      set entry_status='withdrawn',
          participation_decision='rejected',
          participation_decision_at=now(),
          updated_at=now()
      where id=r.id;
      update public.national_championship_duties
      set status='cancelled',updated_at=now()
      where edition_id=p_edition_id
        and rider_id=(select rider_id from public.national_championship_entries where id=r.id)
        and status='confirmed';
    end;
  end loop;

  update public.national_championship_heats h
  set assigned_count=(
        select count(*)::int
        from public.national_championship_entries en
        where en.heat_id=h.id and en.entry_status='qualification_assigned'
      ),
      updated_at=now()
  where h.edition_id=p_edition_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_process_qualification_results_base_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  h record;
  v_stage_id uuid;
  v_result_count integer;
  v_processed integer:=0;
  v_completed_editions uuid[]:='{}'::uuid[];
  q record;
begin
  for h in
    select
      heat.*,
      e.country_code,
      e.final_date,
      e.final_race_id,
      e.status edition_status
    from public.national_championship_heats heat
    join public.national_championship_editions e on e.id=heat.edition_id
    where heat.status='ready'
      and heat.race_id is not null
      and e.status in ('qualification_pending','qualification_completed','final_ready')
    order by heat.qualification_date,heat.edition_id,heat.heat_number
  loop
    select s.id into v_stage_id
    from public.race_stages s
    where s.race_id=h.race_id
    order by s.stage_number
    limit 1;

    if v_stage_id is null then continue; end if;

    if not exists(
      select 1
      from public.race_stage_simulation_runs sr
      where sr.stage_id=v_stage_id and sr.status='completed'
    ) then
      continue;
    end if;

    select count(*)::int into v_result_count
    from public.race_stage_results rs
    where rs.stage_id=v_stage_id and rs.rider_id is not null;

    if v_result_count=0 then continue; end if;

    insert into public.national_championship_result_history(
      edition_id,event_type,heat_id,rider_id,club_id_snapshot,rank,status,
      rider_name_snapshot,club_name_snapshot,country_code_snapshot,race_id
    )
    select
      h.edition_id,'qualification',h.id,rs.rider_id,en.club_id_snapshot,
      coalesce(rs.rank,9999),rs.status,
      coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,r.first_name||' '||r.last_name),
      coalesce(c.name,rs.team_name_snapshot),
      en.country_code_snapshot,h.race_id
    from public.race_stage_results rs
    join public.national_championship_entries en
      on en.edition_id=h.edition_id
     and en.rider_id=rs.rider_id
     and en.heat_id=h.id
    join public.riders r on r.id=rs.rider_id
    left join public.clubs c on c.id=en.club_id_snapshot
    where rs.stage_id=v_stage_id
    on conflict do nothing;

    with finished as (
      select
        rs.rider_id,
        row_number() over(order by rs.rank nulls last,rs.id) finish_order
      from public.race_stage_results rs
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
        and lower(coalesce(rs.status,'finished'))='finished'
    )
    update public.national_championship_entries en
    set entry_status=case
          when f.finish_order is not null
           and f.finish_order<=h.qualifying_places
            then 'qualified'
          else 'eliminated'
        end,
        updated_at=now()
    from public.race_stage_results rs
    left join finished f on f.rider_id=rs.rider_id
    where en.edition_id=h.edition_id
      and en.heat_id=h.id
      and en.rider_id=rs.rider_id
      and rs.stage_id=v_stage_id
      and en.entry_status='qualification_assigned';

    update public.national_championship_duties
    set status='completed',updated_at=now()
    where edition_id=h.edition_id
      and heat_id=h.id
      and duty_type='qualification'
      and status='confirmed';

    insert into public.national_championship_rider_plans(
      edition_id,rider_id,event_type,heat_id,equipment_setup_id,
      phase_1_command,phase_2_command,phase_3_command,phase_4_command,
      updated_by_user_id
    )
    select
      qp.edition_id,qp.rider_id,'final',null,qp.equipment_setup_id,
      qp.phase_1_command,qp.phase_2_command,qp.phase_3_command,qp.phase_4_command,
      qp.updated_by_user_id
    from public.national_championship_rider_plans qp
    join public.national_championship_entries en
      on en.edition_id=qp.edition_id
     and en.rider_id=qp.rider_id
     and en.entry_status='qualified'
    where qp.edition_id=h.edition_id
      and qp.event_type='qualification'
      and en.heat_id=h.id
    on conflict (edition_id,rider_id,event_type) do nothing;

    update public.national_championship_heats
    set status='completed',updated_at=now()
    where id=h.id;

    for q in
      select
        en.rider_id,en.rider_name_snapshot,root.owner_user_id
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=h.edition_id
        and en.heat_id=h.id
        and en.entry_status='qualified'
        and root.owner_user_id is not null
    loop
      perform public.ppm_create_user_notification_direct_v1(
        q.owner_user_id,
        'NATIONAL_CHAMPIONSHIP_QUALIFIED',
        q.rider_name_snapshot||' qualified for the National Championship final',
        q.rider_name_snapshot||' finished inside the qualifying places in National Qualification Group '||
          h.heat_number||' and earned a place in the '||h.country_code||
          ' National Championship final on '||h.final_date||'. A new final participation confirmation is required before the rider is locked for the final.',
        '/dashboard/national-ranking?tab=duty',
        jsonb_build_object(
          'edition_id',h.edition_id,
          'country_code',h.country_code,
          'rider_id',q.rider_id,
          'rider_name',q.rider_name_snapshot,
          'heat_number',h.heat_number,
          'final_date',h.final_date,
          'action_path','/dashboard/national-ranking?tab=duty'
        ),
        'national-championship-qualified:'||h.edition_id::text||':'||q.rider_id::text
      );
    end loop;

    if not exists(
      select 1
      from public.national_championship_heats pending
      where pending.edition_id=h.edition_id
        and pending.status<>'completed'
    ) then
      update public.national_championship_entries
      set entry_status='finalist',updated_at=now()
      where edition_id=h.edition_id
        and entry_status='qualified';

      update public.national_championship_editions
      set status='final_ready',updated_at=now()
      where id=h.edition_id
        and status in ('qualification_pending','qualification_completed');

      perform public.national_championship_sync_race_participants_v1(
        h.edition_id,'final',null
      );

      v_completed_editions:=array_append(v_completed_editions,h.edition_id);
    end if;

    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'qualification_heats_processed',v_processed,
    'finals_unlocked_for_editions',to_jsonb(v_completed_editions)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_sync_race_participants_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer := 0;
  v_team_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id = p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  if p_event_type = 'qualification' then
    select * into h
    from public.national_championship_heats
    where id = p_heat_id and edition_id = e.id;

    if h.id is null or h.race_id is null then
      raise exception 'Qualification heat/race not found for edition %', p_edition_id;
    end if;

    v_race_id := h.race_id;
  elsif p_event_type = 'final' then
    v_race_id := e.final_race_id;
    if v_race_id is null then
      raise exception 'Final race is not created for edition %', p_edition_id;
    end if;
  else
    raise exception 'Invalid national championship event type: %', p_event_type;
  end if;

  select s.id into v_stage_id
  from public.race_stages s
  where s.race_id = v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship race % has no stage', v_race_id;
  end if;

  if exists (
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id = v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  /*
   * Create a zero-cost, organizer-managed preparation shell for each real club
   * represented in the event. No staff, assets or club supplies are attached.
   * The shell exists only so the universal race engine can read rider equipment
   * and rider-specific tactics through its normal stage-plan adapters.
   */
  insert into public.race_preparations (
    race_id,
    club_id,
    status,
    startlist_status,
    setup_window_opens_on,
    rider_submission_deadline_on,
    submitted_at,
    rider_count,
    staff_count,
    participation_cost_cash,
    travel_cost_cash,
    staff_travel_cost_cash,
    asset_transport_cost_cash,
    supplies_cost_cash,
    operations_cost_cash,
    total_cost_cash,
    cost_breakdown_json,
    team_policies_snapshot_json,
    validation_snapshot_json,
    engine_payload_json,
    metadata,
    participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted',
    'submitted',
    e.ranking_snapshot_date,
    case when p_event_type='qualification' then e.qualification_date else e.final_date end,
    now(),
    x.rider_count,
    0,
    0,0,0,0,0,0,0,
    jsonb_build_object('national_championship',true,'organizer_paid',true),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'national_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'national_championship',true,
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
    ),
    x.club_id
  from (
    select
      en.club_id_snapshot as club_id,
      count(*)::int as rider_count
    from public.national_championship_entries en
    where en.edition_id = e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
      and en.club_id_snapshot is not null
      and (
        (p_event_type='qualification'
          and en.heat_id = p_heat_id
          and en.entry_status='qualification_assigned')
        or
        (p_event_type='final'
          and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
      )
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata || excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json || excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        updated_at=now();

  /*
   * The universal race engine expects canonical selected riders on each
   * preparation. National Championships use the club only as a technical
   * preparation owner; sporting identity stays rider-only.
   */
  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id = rp.id
    and rp.race_id = v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
    and not exists (
      select 1
      from public.national_championship_entries en
      where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and (
          (p_event_type='qualification'
            and en.heat_id=p_heat_id
            and en.entry_status='qualification_assigned')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
        )
    );

  insert into public.race_preparation_riders (
    race_preparation_id,
    rider_id,
    start_number,
    race_role,
    default_equipment_setup_id,
    availability_snapshot_json,
    rider_snapshot_json,
    bonus_snapshot_json,
    metadata
  )
  select
    rp.id,
    en.rider_id,
    en.national_rank,
    'free_role',
    plan.equipment_setup_id,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'national_rank',en.national_rank,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'event_type',p_event_type
    )
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        metadata=public.race_preparation_riders.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans (
    race_preparation_id,
    race_id,
    stage_id,
    stage_number,
    stage_date,
    status,
    opens_on_game_date,
    locks_on_game_date,
    submitted_at,
    stage_objective,
    team_strategy,
    risk_level,
    stage_profile_snapshot_json,
    bonus_snapshot_json,
    engine_stage_payload_json,
    metadata,
    rider_equipment_json,
    rider_roles_json,
    team_tactic_json,
    rider_supplies_json,
    rider_individual_tactics_json,
    last_saved_at,
    last_saved_game_ts
  )
  select
    rp.id,
    v_race_id,
    v_stage_id,
    1,
    s.stage_date,
    'submitted',
    e.ranking_snapshot_date,
    s.stage_date,
    now(),
    'balanced',
    'balanced',
    'normal',
    to_jsonb(s),
    '{}'::jsonb,
    jsonb_build_object('national_championship',true),
    jsonb_build_object(
      'national_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  select
    sp.id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    plan.equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'national_rank',en.national_rank,
      'event_type',p_event_type
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('national_championship',true)
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        equipment_setup_id=excluded.equipment_setup_id,
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json || excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata || excluded.metadata,
        updated_at=now();

  /*
   * Apply saved per-rider commands to the universal stage-plan JSON.
   */
  update public.race_stage_plans sp
  set rider_individual_tactics_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',coalesce(plan.phase_1_command,'ride_naturally')),
            'phase_2',jsonb_build_object('command',coalesce(plan.phase_2_command,'ride_naturally')),
            'phase_3',jsonb_build_object('command',coalesce(plan.phase_3_command,'ride_naturally')),
            'phase_4',jsonb_build_object('command',coalesce(plan.phase_4_command,'ride_naturally'))
          )
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_roles_json = coalesce((
        select jsonb_object_agg(en.rider_id::text,to_jsonb('free_role'::text))
        from public.national_championship_entries en
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_equipment_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          case when plan.equipment_setup_id is null then 'null'::jsonb
               else to_jsonb(plan.equipment_setup_id::text) end
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object('source','organizer','standardized',true)
        )
        from public.national_championship_entries en
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      metadata=coalesce(sp.metadata,'{}'::jsonb) || jsonb_build_object(
        'national_championship',true,
        'individual_only',true,
        'team_commands_enabled',false
      ),
      updated_at=now()
  from public.race_preparations rp
  where sp.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and sp.stage_id=v_stage_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false);

  /*
   * Rebuild the canonical participant snapshot after preparation triggers.
   */
  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams (
    race_id,
    team_id,
    status,
    team_name_snapshot,
    logo_url_snapshot,
    country_code_snapshot,
    ranking_snapshot,
    submitted_at,
    accepted_at
  )
  select
    v_race_id,
    en.rider_id,
    'accepted',
    en.rider_name_snapshot,
    null,
    en.country_code_snapshot,
    en.national_rank,
    now(),
    now()
  from public.national_championship_entries en
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  insert into public.race_participant_riders (
    race_id,
    team_id,
    rider_id,
    rider_name_snapshot,
    team_name_snapshot,
    country_code_snapshot,
    age_snapshot,
    is_young_rider,
    start_number,
    role_snapshot,
    overall_snapshot,
    can_view_exact_overall,
    overall_range_label
  )
  select
    v_race_id,
    en.rider_id,
    en.rider_id,
    en.rider_name_snapshot,
    en.rider_name_snapshot,
    en.country_code_snapshot,
    greatest(
      0,
      extract(year from age(
        case when p_event_type='qualification' then e.qualification_date else e.final_date end,
        r.birth_date
      ))::int
    ),
    extract(year from age(
      case when p_event_type='qualification' then e.qualification_date else e.final_date end,
      r.birth_date
    ))::int <= 21,
    en.national_rank,
    r.role::text,
    r.overall,
    true,
    null
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'event_type',p_event_type,
    'heat_id',p_heat_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_national_championship_event_page_v2(p_edition_id uuid, p_event_type text, p_heat_number integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_base jsonb;
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_has_entries boolean:=false;
  v_participants jsonb:='[]'::jsonb;
  v_results jsonb:='[]'::jsonb;
  v_viewer_has_participant boolean:=false;
  v_current_game_date date:=public.get_current_game_date_date();
  v_preview_date date;
  v_generic_jersey constant text :=
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/AI%20Teams%20Kits/Genkit53.png';
begin
  v_base:=public.get_national_championship_event_page_v1(
    p_edition_id,p_event_type,p_heat_number
  );

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National Championship edition not found';
  end if;

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where edition_id=e.id
      and heat_number=p_heat_number
    limit 1;
  end if;

  v_race_id:=nullif(v_base->>'race_id','')::uuid;

  if v_race_id is not null then
    select s.id
    into v_stage_id
    from public.race_stages s
    where s.race_id=v_race_id
    order by s.stage_number
    limit 1;
  end if;

  select exists(
    select 1
    from public.national_championship_entries en
    where en.edition_id=e.id
  )
  into v_has_entries;

  v_preview_date:=least(v_current_game_date,e.ranking_snapshot_date);

  if p_event_type='qualification' then
    if v_has_entries then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          en.rider_id,
          en.rider_name_snapshot as rider_name,
          en.national_rank,
          en.seed_number,
          en.club_id_snapshot as club_id,
          coalesce(c.name,'Free Agent') as team_name,
          en.country_code_snapshot as country_code,
          en.entry_status,
          en.participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            case when en.club_id_snapshot is null then v_generic_jersey else v_generic_jersey end
          ) as jersey_url
        from public.national_championship_entries en
        left join public.clubs c on c.id=en.club_id_snapshot
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=en.club_id_snapshot
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=en.club_id_snapshot
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where en.edition_id=e.id
          and en.heat_number=p_heat_number
          and coalesce(en.participation_decision,'pending')<>'rejected'
          and en.entry_status<>'withdrawn'
      ) x;
    else
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          p.rider_id,
          p.rider_name,
          p.national_rank,
          p.national_rank as seed_number,
          p.club_id,
          coalesce(c.name,'Free Agent') as team_name,
          p.country_code,
          'projected'::text as entry_status,
          'projected'::text as participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.preview_national_ranking_v1(e.country_code,v_preview_date) p
        left join public.clubs c on c.id=p.club_id
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=p.club_id
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=p.club_id
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where case
          when (floor(((p.national_rank-1)::numeric)/greatest(e.qualification_heat_count,1))::int % 2)=0
            then ((p.national_rank-1)%greatest(e.qualification_heat_count,1))+1
          else greatest(e.qualification_heat_count,1)-((p.national_rank-1)%greatest(e.qualification_heat_count,1))
        end=p_heat_number
      ) x;
    end if;
  elsif p_event_type='final' then
    if v_has_entries then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          en.rider_id,
          en.rider_name_snapshot as rider_name,
          en.national_rank,
          en.seed_number,
          en.club_id_snapshot as club_id,
          coalesce(c.name,'Free Agent') as team_name,
          en.country_code_snapshot as country_code,
          en.entry_status,
          en.participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.national_championship_entries en
        left join public.clubs c on c.id=en.club_id_snapshot
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=en.club_id_snapshot
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=en.club_id_snapshot
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        where en.edition_id=e.id
          and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date)
          and coalesce(en.participation_decision,'pending')<>'rejected'
      ) x;
    elsif coalesce(e.qualification_heat_count,0)=0 then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.national_rank),'[]'::jsonb)
      into v_participants
      from (
        select
          p.rider_id,
          p.rider_name,
          p.national_rank,
          p.national_rank as seed_number,
          p.club_id,
          coalesce(c.name,'Free Agent') as team_name,
          p.country_code,
          'projected'::text as entry_status,
          'projected'::text as participation_decision,
          coalesce(
            nullif(tk.config->>'image_url',''),
            nullif(aik.jersey_url,''),
            v_generic_jersey
          ) as jersey_url
        from public.preview_national_ranking_v1(e.country_code,v_preview_date) p
        left join public.clubs c on c.id=p.club_id
        left join lateral (
          select tk1.config
          from public.team_kits tk1
          where tk1.team_id=p.club_id
          order by
            case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
            tk1.updated_at desc
          limit 1
        ) tk on true
        left join lateral (
          select a.jersey_url
          from public.ai_team_kit_previews a
          where a.club_id=p.club_id
            and coalesce(a.is_active,true)
          order by a.updated_at desc
          limit 1
        ) aik on true
        order by p.national_rank
        limit e.final_field_size
      ) x;
    else
      v_participants:='[]'::jsonb;
    end if;
  end if;


  if not v_has_entries then
    v_participants:='[]'::jsonb;
  else
    select coalesce(jsonb_agg(p.value order by (p.value->>'national_rank')::int),'[]'::jsonb)
    into v_participants
    from jsonb_array_elements(v_participants) p(value)
    join public.national_championship_entries en
      on en.edition_id=e.id
     and en.rider_id=(p.value->>'rider_id')::uuid
    where public.national_championship_entry_confirmed_for_event_v1(
      en.id,p_event_type,case when p_event_type='qualification' then h.id else null end
    );
  end if;

  if v_stage_id is not null then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.rank nulls last,x.rider_name),'[]'::jsonb)
    into v_results
    from (
      select
        rs.rank,
        rs.rider_id,
        coalesce(rs.rider_name_snapshot,en.rider_name_snapshot,r.display_name,
          trim(coalesce(r.first_name,'')||' '||coalesce(r.last_name,''))) as rider_name,
        en.club_id_snapshot as club_id,
        coalesce(c.name,rs.team_name_snapshot,'Free Agent') as team_name,
        coalesce(en.country_code_snapshot,r.country_code,e.country_code) as country_code,
        rs.elapsed_seconds,
        rs.gap_seconds,
        rs.status,
        coalesce(
          nullif(tk.config->>'image_url',''),
          nullif(aik.jersey_url,''),
          v_generic_jersey
        ) as jersey_url
      from public.race_stage_results rs
      left join public.national_championship_entries en
        on en.edition_id=e.id
       and en.rider_id=rs.rider_id
      left join public.riders r on r.id=rs.rider_id
      left join public.clubs c on c.id=en.club_id_snapshot
      left join lateral (
        select tk1.config
        from public.team_kits tk1
        where tk1.team_id=en.club_id_snapshot
        order by
          case when tk1.name='home' then 0 when tk1.name='default' then 1 else 2 end,
          tk1.updated_at desc
        limit 1
      ) tk on true
      left join lateral (
        select a.jersey_url
        from public.ai_team_kit_previews a
        where a.club_id=en.club_id_snapshot
          and coalesce(a.is_active,true)
        order by a.updated_at desc
        limit 1
      ) aik on true
      where rs.stage_id=v_stage_id
        and rs.rider_id is not null
    ) x;
  end if;

  if v_race_id is null or not public.national_championship_results_visible_v1(v_race_id) then
    v_results:='[]'::jsonb;
  end if;

  if v_has_entries then
    select exists(
      select 1
      from public.national_championship_entries en
      left join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs root
        on root.id=case
          when rc.club_type='developing' and rc.parent_club_id is not null
            then rc.parent_club_id
          else rc.id
        end
      where en.edition_id=e.id
        and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,case when p_event_type='qualification' then h.id else null end)
        and root.owner_user_id=auth.uid()
        and coalesce(en.participation_decision,'pending')<>'rejected'
        and (
          (p_event_type='qualification'
            and en.heat_number=p_heat_number
            and en.entry_status<>'withdrawn')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
        )
    )
    into v_viewer_has_participant;
  end if;

  return v_base || jsonb_build_object(
    'current_game_date',v_current_game_date,
    'ranking_freeze_date',e.ranking_snapshot_date,
    'participation_decision_deadline',e.participation_decision_deadline,
    'final_participation_decision_deadline',e.final_participation_decision_deadline,
    'qualifying_places',case when p_event_type='qualification' then h.qualifying_places else null end,
    'generated_stage_id',v_stage_id,
    'participants',v_participants,
    'participants_known',
      case
        when not v_has_entries then false
        when p_event_type='final'
         and coalesce(e.qualification_heat_count,0)>0
         and jsonb_array_length(v_participants)=0
        then false
        else true
      end,
    'results',v_results,
    'viewer_has_participant',v_viewer_has_participant,
    'generated_stage',case
      when v_stage_id is null then null
      else (
        select jsonb_build_object(
          'id',s.id,
          'race_id',s.race_id,
          'stage_number',s.stage_number,
          'stage_date',s.stage_date,
          'name',s.name,
          'start_city',coalesce(nullif(s.start_city_name,''),s.start_city),
          'finish_city',coalesce(nullif(s.finish_city_name,''),s.finish_city),
          'planned_start_time_label',s.planned_start_time_label,
          'planned_start_hour_number',s.planned_start_hour_number,
          'planned_start_minute',s.planned_start_minute,
          'terrain_type',s.terrain_type,
          'profile_type',s.profile_type,
          'distance_km',s.distance_km,
          'elevation_gain_m',s.elevation_gain_m,
          'flat_pct',s.flat_pct,
          'hilly_pct',s.hilly_pct,
          'mountain_pct',s.mountain_pct,
          'cobbled_pct',s.cobbled_pct,
          'weather_snapshot',coalesce(s.weather_snapshot,'{}'::jsonb),
          'weather_summary',s.weather_summary,
          'weather_cancelled',s.weather_cancelled,
          'weather_cancellation_reason',s.weather_cancellation_reason
        )
        from public.race_stages s
        where s.id=v_stage_id
      )
    end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_national_championship_race_plan_workspace_v2(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid, p_preview_rider_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club_id uuid;
  v_edition public.national_championship_editions%rowtype;
  v_heat public.national_championship_heats%rowtype;
  v_event_date date;
  v_event_key text;
  v_plan public.national_special_race_plans%rowtype;
  v_real_riders jsonb:='[]'::jsonb;
  v_preview_riders jsonb:='[]'::jsonb;
  v_race_id uuid;
  v_stage_id uuid;
  v_prep_id uuid;
  v_entries_exist boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if p_event_type not in ('qualification','final') then raise exception 'Invalid event type.'; end if;

  select c.id into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid
    and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at limit 1;
  if v_club_id is null then raise exception 'Main club not found.'; end if;

  select * into v_edition from public.national_championship_editions where id=p_edition_id;
  if v_edition.id is null then raise exception 'National Championship edition not found.'; end if;

  select exists(select 1 from public.national_championship_entries en where en.edition_id=v_edition.id) into v_entries_exist;

  if p_event_type='qualification' then
    select * into v_heat from public.national_championship_heats
    where id=p_heat_id and edition_id=v_edition.id;
    if v_heat.id is null then raise exception 'Qualification heat not found.'; end if;
    v_event_date:=v_heat.heat_date;
    v_race_id:=v_heat.race_id;
    v_event_key:=v_edition.id::text||':qualification:'||v_heat.id::text;
  else
    v_event_date:=v_edition.final_date;
    v_race_id:=v_edition.final_race_id;
    v_event_key:=v_edition.id::text||':final';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rider_id',en.rider_id,
    'rider_name',coalesce(
      nullif(concat_ws(' ',nullif(btrim(r.first_name),''),nullif(btrim(r.last_name),'')),''),
      en.rider_name_snapshot
    ),
    'club_name',c.name,
    'role',r.role::text,
    'fatigue',coalesce(r.fatigue,0),
    'race_sharpness',rc.race_sharpness,
    'national_rank',en.national_rank
  ) order by en.national_rank),'[]'::jsonb)
  into v_real_riders
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.rider_race_condition rc on rc.rider_id=r.id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=v_edition.id
    and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,case when p_event_type='qualification' then p_heat_id else null end)
    and public.universal_race_resource_owner_club_v1(en.club_id_snapshot)=v_club_id
    and (
      (p_event_type='qualification' and en.heat_id=p_heat_id and en.entry_status in ('qualification_assigned','qualified','finalist'))
      or
      (p_event_type='final' and en.entry_status in ('direct_qualified','qualified','finalist'))
    );

  if not v_entries_exist and jsonb_array_length(v_real_riders)=0 and cardinality(coalesce(p_preview_rider_ids,'{}'::uuid[]))>0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'rider_id',r.id,
      'rider_name',coalesce(nullif(concat_ws(' ',nullif(btrim(r.first_name),''),nullif(btrim(r.last_name),'')),''),r.display_name),
      'club_name',c.name,
      'role',r.role::text,
      'fatigue',coalesce(r.fatigue,0),
      'race_sharpness',rc.race_sharpness,
      'national_rank',pr.national_rank
    ) order by pr.national_rank),'[]'::jsonb)
    into v_preview_riders
    from public.riders r
    join public.club_riders cr on cr.rider_id=r.id
    join public.clubs c on c.id=cr.club_id
    left join public.rider_race_condition rc on rc.rider_id=r.id
    left join lateral (
      select p.national_rank
      from public.preview_national_ranking_v1(v_edition.country_code,least(public.get_current_game_date_date(),v_edition.ranking_snapshot_date)) p
      where p.rider_id=r.id limit 1
    ) pr on true
    where r.id=any(p_preview_rider_ids)
      and public.universal_race_resource_owner_club_v1(cr.club_id)=v_club_id
      and upper(r.country_code)=upper(v_edition.country_code);
  end if;

  if jsonb_array_length(v_real_riders)=0 and jsonb_array_length(v_preview_riders)=0 then
    raise exception 'No managed riders are assigned to this National Championship event.';
  end if;

  select * into v_plan
  from public.national_special_race_plans p
  where p.plan_kind='national_ranking'
    and p.event_key=v_event_key
    and p.owner_scope_key='club:'||v_club_id::text
  limit 1;

  if v_race_id is not null then
    select s.id into v_stage_id from public.race_stages s where s.race_id=v_race_id order by s.stage_number limit 1;
    select rp.id into v_prep_id
    from public.race_preparations rp
    where rp.race_id=v_race_id
      and public.universal_race_resource_owner_club_v1(rp.club_id)=v_club_id
    order by rp.updated_at desc limit 1;
  end if;

  return jsonb_build_object(
    'kind','national_ranking',
    'edition_id',v_edition.id,
    'event_type',p_event_type,
    'heat_id',case when p_event_type='qualification' then v_heat.id else null end,
    'event_key',v_event_key,
    'event_date',v_event_date,
    'country_code',v_edition.country_code,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'race_preparation_id',v_prep_id,
    'plan_status',coalesce(v_plan.status,'not_created'),
    'preview_only',jsonb_array_length(v_real_riders)=0,
    'riders',case when jsonb_array_length(v_real_riders)>0 then v_real_riders else v_preview_riders end,
    'staff_locked',true,
    'assets_locked',true,
    'cost_total',0,
    'setup_window_opens_on',v_event_date-15,
    'rider_submission_deadline_on',v_event_date
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_unified_race_preparation_special_events_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_club_id uuid;
  v_ctx record;
  v_team_events jsonb:='[]'::jsonb;
  v_individual_events jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select gs.season_number
  into v_season
  from public.game_state gs
  where gs.id=true;

  select c.id
  into v_club_id
  from public.clubs c
  where c.owner_user_id=v_uid
    and c.parent_club_id is null
    and (c.club_type='main' or c.club_type is null)
  order by c.created_at
  limit 1;

  select *
  into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is not null then
    select coalesce(jsonb_agg(x.payload order by x.event_date,x.race_day),'[]'::jsonb)
    into v_team_events
    from (
      select
        e.event_date,
        e.race_day,
        jsonb_build_object(
          'kind','national_team',
          'event_id',e.id,
          'season_number',ed.season_number,
          'round_label',r.round_label,
          'round_type',r.round_type,
          'group_label',g.group_label,
          'race_day',e.race_day,
          'race_type',e.race_type,
          'event_date',e.event_date,
          'event_status',e.status,
          'race_id',e.race_id,
          'stage_id',e.stage_id,
          'host_country_code',e.host_country_code,
          'setup_window_opens_on',e.event_date-15,
          'lineup_deadline_on',e.event_date-3,
          'test_override',private.national_race_preparation_test_override_enabled_v1(
            e.id,v_ctx.association_id
          ),
          'special_plan_status',coalesce((
            select p.status
            from public.national_special_race_plans p
            where p.plan_kind='national_team'
              and p.event_key=e.id::text
              and p.owner_scope_key='association:'||v_ctx.association_id::text
            limit 1
          ),'not_created'),
          'can_manage',true,
          'association_id',v_ctx.association_id,
          'country_code',v_ctx.country_code,
          'selection_cycle',(
            select jsonb_build_object(
              'status',sc.status,
              'selected_count',cardinality(sc.selected_rider_ids),
              'locked_on',sc.locked_on_game_date,
              'response_deadline',sc.response_deadline,
              'final_squad_deadline',sc.final_squad_deadline
            )
            from public.national_team_selection_cycles sc
            where sc.association_id=v_ctx.association_id
              and sc.season_number=ed.season_number
              and sc.cycle_key=e.cycle_key
            order by sc.updated_at desc
            limit 1
          ),
          'squad',(
            select jsonb_build_object(
              'squad_id',s.id,
              'status',s.status,
              'squad_size',s.squad_size,
              'confirmed_on',s.confirmed_on_game_date,
              'members',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',sm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_name',sm.club_name_snapshot,
                    'squad_role',sm.squad_role
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_squad_members sm
                where sm.squad_id=s.id
              ),'[]'::jsonb)
            )
            from public.national_team_squads s
            where s.association_id=v_ctx.association_id
              and s.season_number=ed.season_number
              and s.cycle_key=e.cycle_key
              and s.status in ('confirmed','on_duty','completed')
            order by s.updated_at desc
            limit 1
          ),
          'lineup',(
            select jsonb_build_object(
              'lineup_id',l.id,
              'status',l.status,
              'submitted_on',l.submitted_on_game_date,
              'rider_ids',coalesce((
                select jsonb_agg(lm.rider_id order by sm.rider_name_snapshot)
                from public.national_team_lineup_members lm
                join public.national_team_squad_members sm
                  on sm.id=lm.squad_member_id
                where lm.lineup_id=l.id
              ),'[]'::jsonb),
              'riders',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',lm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_name',sm.club_name_snapshot
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_lineup_members lm
                join public.national_team_squad_members sm
                  on sm.id=lm.squad_member_id
                where lm.lineup_id=l.id
              ),'[]'::jsonb)
            )
            from public.national_team_squads s
            join public.national_team_lineups l
              on l.squad_id=s.id
             and l.race_day=e.race_day
             and l.status<>'cancelled'
            where s.association_id=v_ctx.association_id
              and s.season_number=ed.season_number
              and s.cycle_key=e.cycle_key
            order by l.updated_at desc
            limit 1
          ),
          'race_preparation',(
            select jsonb_build_object(
              'race_preparation_id',rp.id,
              'status',rp.status,
              'startlist_status',rp.startlist_status,
              'stage_plan_id',sp.id,
              'team_strategy',sp.team_strategy,
              'team_tactic_json',sp.team_tactic_json,
              'rider_roles_json',sp.rider_roles_json,
              'last_saved_at',sp.last_saved_at
            )
            from public.race_preparations rp
            left join public.race_stage_plans sp
              on sp.race_preparation_id=rp.id
             and sp.stage_number=1
            where rp.race_id=e.race_id
              and rp.metadata->>'association_id'=v_ctx.association_id::text
            order by rp.updated_at desc
            limit 1
          ),
          'route',(
            select jsonb_build_object(
              'stage_name',rs.name,
              'start_city',coalesce(rs.start_city_name,rs.start_city),
              'finish_city',coalesce(rs.finish_city_name,rs.finish_city),
              'distance_km',rs.distance_km,
              'terrain_type',rs.terrain_type,
              'profile_type',rs.profile_type
            )
            from public.race_stages rs
            where rs.id=e.stage_id
          )
        ) payload
      from public.nations_competition_entries ce
      join public.nations_competition_editions ed on ed.id=ce.edition_id
      join public.nations_group_entries nge on nge.competition_entry_id=ce.id
      join public.nations_competition_groups g on g.id=nge.group_id
      join public.nations_competition_rounds r on r.id=g.round_id
      join public.nations_group_events e on e.group_id=g.id
      where ce.association_id=v_ctx.association_id
        and ed.season_number=v_season
        and ce.status<>'withdrawn'
        and nge.status<>'withdrawn'
        and e.status<>'cancelled'
        and e.event_date is not null
        and e.event_date>=v_today-3
    ) x;
  end if;

  if v_club_id is not null then
    select coalesce(jsonb_agg(x.payload order by x.event_date,x.heat_number nulls last),'[]'::jsonb)
    into v_individual_events
    from (
      select
        d.edition_id,
        d.duty_type,
        d.heat_id,
        d.duty_date as event_date,
        h.heat_number,
        jsonb_build_object(
          'kind','national_individual',
          'event_key',
            d.edition_id::text||':'||d.duty_type||':'||coalesce(d.heat_id::text,'final'),
          'edition_id',d.edition_id,
          'season_number',ed.season_number,
          'country_code',ed.country_code,
          'event_type',d.duty_type,
          'event_date',d.duty_date,
          'status',d.status,
          'heat_id',d.heat_id,
          'heat_number',h.heat_number,
          'race_id',case when d.duty_type='final' then ed.final_race_id else h.race_id end,
          'setup_window_opens_on',d.duty_date-15,
          'can_manage',false,
          'special_plan_status',coalesce((
            select p.status
            from public.national_special_race_plans p
            where p.plan_kind='national_ranking'
              and p.event_key=case
                when d.duty_type='qualification'
                  then d.edition_id::text||':qualification:'||coalesce(d.heat_id::text,'')
                else d.edition_id::text||':final'
              end
              and p.owner_scope_key='club:'||v_club_id::text
            limit 1
          ),'not_created'),
          'riders',jsonb_agg(
            jsonb_build_object(
              'rider_id',d.rider_id,
              'rider_name',coalesce(ne.rider_name_snapshot,ri.display_name),
              'entry_status',ne.entry_status,
              'participation_decision',ne.participation_decision,
              'final_participation_decision',ne.final_participation_decision
            )
            order by coalesce(ne.rider_name_snapshot,ri.display_name)
          )
        ) payload
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      left join public.national_championship_heats h on h.id=d.heat_id
      join public.national_championship_entries ne
        on ne.edition_id=d.edition_id
       and ne.rider_id=d.rider_id
      join public.riders ri on ri.id=d.rider_id
      join public.club_riders cr
        on cr.rider_id=d.rider_id
       and cr.club_id=v_club_id
      where ed.season_number=v_season
        and d.status not in ('cancelled','withdrawn')
        and d.duty_date>=v_today-3
      group by
        d.edition_id,d.duty_type,d.heat_id,d.duty_date,h.heat_number,
        ed.season_number,ed.country_code,ed.final_race_id,h.race_id,d.status
    ) x;
  end if;

  -- Temporary visual preview for the active National Coach while the real
  -- National Championship ranking freeze has not created rider duties yet.
  -- Show every rider from the manager's club that is present in the preview
  -- National Ranking. Real duties replace this automatically once generated.
  if v_ctx.association_id is not null
     and v_club_id is not null
     and jsonb_array_length(v_individual_events)=0
     and not exists (
       select 1
       from public.national_championship_entries en
       join public.national_championship_editions ee on ee.id=en.edition_id
       where ee.season_number=v_season
         and upper(ee.country_code)=upper(v_ctx.country_code)
     ) then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kind','national_individual',
          'event_key',ed.id::text||':final:test-preview',
          'edition_id',ed.id,
          'season_number',ed.season_number,
          'country_code',ed.country_code,
          'event_type','final',
          'event_date',ed.final_date,
          'status','test_preview',
          'heat_id',null,
          'heat_number',null,
          'race_id',ed.final_race_id,
          'setup_window_opens_on',ed.final_date-15,
          'can_manage',false,
          'is_preview',true,
          'special_plan_status',coalesce((
            select p.status
            from public.national_special_race_plans p
            where p.plan_kind='national_ranking'
              and p.event_key=ed.id::text||':final'
              and p.owner_scope_key='club:'||v_club_id::text
            limit 1
          ),'not_created'),
          'riders',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'rider_id',pr.rider_id,
                'rider_name',pr.rider_name,
                'entry_status','preview',
                'participation_decision','preview',
                'final_participation_decision','preview'
              )
              order by pr.national_rank
            )
            from public.preview_national_ranking_v1(
              ed.country_code,
              ed.ranking_snapshot_date
            ) pr
            where pr.club_id=v_club_id
          ),'[]'::jsonb)
        )
        order by ed.final_date
      ),
      '[]'::jsonb
    )
    into v_individual_events
    from public.national_championship_editions ed
    where ed.season_number=v_season
      and ed.country_code=v_ctx.country_code
      and ed.final_date>=v_today
      and ed.status in ('planned','ranking_frozen','qualification_active','qualification_complete','final_ready')
      and exists (
        select 1
        from public.preview_national_ranking_v1(
          ed.country_code,
          ed.ranking_snapshot_date
        ) pr
        where pr.club_id=v_club_id
      );
  end if;

  return jsonb_build_object(
    'current_game_date',v_today,
    'season_number',v_season,
    'is_national_coach',v_ctx.association_id is not null,
    'national_team_events',v_team_events,
    'national_individual_events',v_individual_events
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_lifecycle_overview_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with ctx as (
  select public.get_current_game_date_date() game_date,
         (select season_number from public.game_state where id=true limit 1) season_number
),
base as (
  select
    e.*,
    case when coalesce(e.qualification_heat_count,0)>0
      then e.qualification_window_start_date else e.final_date end first_event_date
  from public.national_championship_editions e,ctx
  where e.season_number=ctx.season_number
),
counts as (
  select
    e.*,
    (select count(*)::int from public.national_championship_ranking_snapshots s where s.edition_id=e.id) snapshot_count,
    (select count(*)::int from public.national_championship_entries en where en.edition_id=e.id) entry_count,
    (select count(*)::int from public.national_championship_heats h where h.edition_id=e.id) heat_count_actual,
    (select count(*)::int from public.national_championship_heats h where h.edition_id=e.id and h.status='completed') heat_count_completed,
    (
      select count(*)::int
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs p on p.id=rc.parent_club_id
      where en.edition_id=e.id
        and case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end is not null
    ) human_invite_expected,
    (
      select count(*)::int
      from public.national_championship_entries en
      join public.clubs rc on rc.id=en.club_id_snapshot
      left join public.clubs p on p.id=rc.parent_club_id
      where en.edition_id=e.id
        and case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end is not null
        and exists(
          select 1
          from public.notifications n
          join public.user_notifications un on un.notification_id=n.id
          where un.user_id=case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end
            and un.deleted_at is null
            and n.payload_json->>'event_key'='national-championship-selection:'||e.id::text||':'||en.rider_id::text
        )
    ) human_invite_sent,
    (select count(*)::int from public.national_championship_entries en where en.edition_id=e.id and en.participation_decision='pending') initial_pending,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id
        and public.national_championship_entry_confirmed_for_event_v1(
          en.id,
          case when en.entry_path='qualification' then 'qualification' else 'final' end,
          en.heat_id
        )
    ) initial_confirmed,
    (
      select count(*)::int
      from public.national_championship_duties d
      join public.national_championship_entries en on en.edition_id=d.edition_id and en.rider_id=d.rider_id
      where d.edition_id=e.id and d.status='confirmed'
        and d.duty_type=case when en.entry_path='qualification' then 'qualification' else 'final' end
    ) initial_duties,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and en.participation_decision in ('approved','auto_approved')
    ) final_confirmation_expected,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and en.final_participation_decision='not_open'
    ) final_not_open,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and en.final_participation_decision='pending'
    ) final_pending,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id
        and public.national_championship_entry_confirmed_for_event_v1(en.id,'final',null)
    ) final_confirmed,
    (
      select count(*)::int
      from public.national_championship_duties d
      where d.edition_id=e.id and d.duty_type='final' and d.status='confirmed'
    ) final_duties,
    (
      select count(*)::int
      from public.national_championship_entries en
      where en.edition_id=e.id and en.entry_path='qualification'
        and en.entry_status in ('qualified','finalist')
        and exists(
          select 1 from public.notifications n
          join public.user_notifications un on un.notification_id=n.id
          join public.clubs rc on rc.id=en.club_id_snapshot
          left join public.clubs p on p.id=rc.parent_club_id
          where un.user_id=case when rc.club_type='developing' and rc.parent_club_id is not null then p.owner_user_id else rc.owner_user_id end
            and un.deleted_at is null
            and n.payload_json->>'event_key'='national-final-confirmation:'||e.id::text||':'||en.rider_id::text
        )
    ) final_notifications_sent,
    (
      select count(*)::int
      from public.race_participant_riders rr
      where rr.race_id=e.final_race_id
    ) final_startlist_actual
  from base e
),
status_rows as (
  select
    c.*,
    case
      when c.schedule_draw_status='locked' and c.climate_status='ready' and c.route_status='ready' then 'complete'
      when ctx.game_date<c.ranking_snapshot_date then 'waiting'
      else 'overdue'
    end schedule_step,
    case
      when c.status<>'planned' and c.snapshot_count>0 and c.entry_count>0 then 'complete'
      when ctx.game_date<c.ranking_snapshot_date then 'waiting'
      else 'overdue'
    end freeze_step,
    case
      when coalesce(c.qualification_heat_count,0)=0 then 'not_required'
      when c.heat_count_actual=coalesce(c.qualification_heat_count,0) then 'complete'
      when ctx.game_date<c.ranking_snapshot_date then 'waiting'
      else 'overdue'
    end groups_step,
    case
      when c.entry_count=0 then case when ctx.game_date<c.ranking_snapshot_date then 'waiting' else 'overdue' end
      when c.human_invite_sent<c.human_invite_expected then 'overdue'
      when c.initial_pending>0 and ctx.game_date<=c.participation_decision_deadline then 'open'
      when c.initial_pending>0 then 'overdue'
      else 'complete'
    end invitation_step,
    case
      when c.entry_count=0 then 'waiting'
      when c.initial_confirmed=c.initial_duties then 'complete'
      else 'overdue'
    end lock_step,
    case
      when coalesce(c.qualification_heat_count,0)=0 then 'not_required'
      when c.heat_count_completed=coalesce(c.qualification_heat_count,0) then 'complete'
      when c.qualification_window_start_date is null then
        case when ctx.game_date<c.ranking_snapshot_date then 'waiting' else 'overdue' end
      when ctx.game_date<c.qualification_window_start_date then 'scheduled'
      when ctx.game_date<=c.qualification_window_end_date then 'in_progress'
      else 'overdue'
    end qualification_step,
    case
      when coalesce(c.qualification_heat_count,0)=0 then 'not_required'
      when c.heat_count_completed<coalesce(c.qualification_heat_count,0) then 'waiting'
      when c.final_not_open>0 then 'overdue'
      when c.final_pending>0 and ctx.game_date<=coalesce(c.final_participation_decision_deadline,c.final_date-7) then 'open'
      when c.final_pending>0 then 'overdue'
      else 'complete'
    end final_confirmation_step,
    case
      when c.status='completed' then 'complete'
      when ctx.game_date<c.final_date then
        case when c.final_race_id is null then 'waiting'
             when c.final_startlist_actual=c.final_confirmed then 'ready'
             else 'incomplete' end
      when c.final_startlist_actual=c.final_confirmed then 'ready'
      else 'overdue'
    end final_startlist_step,
    case
      when c.status='completed' and c.champion_rider_id is not null then 'complete'
      when ctx.game_date<=c.final_date then 'waiting'
      else 'overdue'
    end result_step,
    ctx.game_date
  from counts c cross join ctx
),
evaluated as (
  select
    s.*,
    (
      (case when s.first_event_date is not null and s.ranking_snapshot_date>s.first_event_date-30 then 1 else 0 end)
      +(case when s.schedule_step='overdue' then 1 else 0 end)
      +(case when s.freeze_step='overdue' then 1 else 0 end)
      +(case when s.groups_step='overdue' then 1 else 0 end)
      +(case when s.invitation_step='overdue' then 1 else 0 end)
      +(case when s.lock_step='overdue' then 1 else 0 end)
      +(case when s.qualification_step='overdue' then 1 else 0 end)
      +(case when s.final_confirmation_step='overdue' then 1 else 0 end)
      +(case when s.final_startlist_step='overdue' then 1 else 0 end)
      +(case when s.result_step='overdue' then 1 else 0 end)
      +(case when s.status<>'planned' and s.snapshot_count<>s.entry_count then 1 else 0 end)
    )::int issue_count
  from status_rows s
)
select jsonb_build_object(
  'game_date',(select game_date from ctx),
  'summary',jsonb_build_object(
    'edition_count',count(*),
    'issue_count',coalesce(sum(issue_count),0),
    'editions_with_issues',count(*) filter(where issue_count>0),
    'awaiting_ranking_freeze',count(*) filter(where freeze_step='waiting'),
    'invitation_windows_open',count(*) filter(where invitation_step='open'),
    'qualification_rounds_active',count(*) filter(where qualification_step='in_progress'),
    'final_confirmations_open',count(*) filter(where final_confirmation_step='open')
  ),
  'editions',coalesce(jsonb_agg(
    jsonb_build_object(
      'edition_id',id,'country_code',country_code,'edition_status',status,
      'first_event_date',first_event_date,'ranking_freeze_date',ranking_snapshot_date,
      'response_deadline',participation_decision_deadline,
      'qualification_window_start',qualification_window_start_date,
      'qualification_window_end',qualification_window_end_date,
      'final_confirmation_deadline',final_participation_decision_deadline,
      'final_date',final_date,'qualification_heat_count',qualification_heat_count,
      'qualification_places',qualification_places,'qualifying_places_per_group',case
        when coalesce(qualification_heat_count,0)>0
          then ceil(coalesce(qualification_places,0)::numeric/qualification_heat_count)::int
        else null end,
      'schedule',schedule_step,'ranking_freeze',freeze_step,'groups',groups_step,
      'invitations',invitation_step,'rider_locks',lock_step,
      'qualification',qualification_step,'final_confirmation',final_confirmation_step,
      'final_startlist',final_startlist_step,'results',result_step,
      'confirmed_initial_riders',initial_confirmed,'initial_pending',initial_pending,
      'final_confirmed_riders',final_confirmed,'final_pending',final_pending,
      'issue_count',issue_count,
      'current_step',case
        when result_step='complete' then 'completed'
        when final_startlist_step in ('ready','overdue','incomplete') and game_date>=final_date then 'final'
        when final_confirmation_step in ('open','overdue') then 'final_confirmation'
        when qualification_step in ('in_progress','overdue') then 'qualification'
        when invitation_step in ('open','overdue') then 'invitation_responses'
        when freeze_step='complete' then 'field_created'
        when freeze_step='waiting' then 'waiting_for_ranking_freeze'
        else 'attention_required' end
    )
    order by issue_count desc,ranking_snapshot_date,country_code
  ),'[]'::jsonb)
)
from evaluated;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_lifecycle_reconcile_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_runtime jsonb;
  r record;
  v_duties_fixed integer:=0;
  v_duties_cancelled integer:=0;
  v_startlists_synced integer:=0;
begin
  begin
    v_runtime:=public.process_national_championship_runtime_v2();
  exception when others then
    v_runtime:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  -- Notification creation is idempotent by event_key, so a missed delivery row is repaired.
  for r in
    select e.id
    from public.national_championship_editions e
    where e.season_number=(select season_number from public.game_state where id=true)
      and e.status<>'planned'
  loop
    perform public.national_championship_notify_selection_v1(r.id);
  end loop;

  -- A pending/refused invitation must never hold a rider lock.
  update public.national_championship_duties d
  set status='cancelled',updated_at=now()
  from public.national_championship_entries en
  where d.edition_id=en.edition_id and d.rider_id=en.rider_id and d.status='confirmed'
    and (
      (d.duty_type='qualification' and en.participation_decision not in ('approved','auto_approved'))
      or
      (d.duty_type='final' and (
        (en.entry_path='direct' and en.participation_decision not in ('approved','auto_approved'))
        or
        (en.entry_path='qualification' and en.final_participation_decision not in ('approved','auto_approved'))
      ))
    );
  get diagnostics v_duties_cancelled=row_count;

  for r in
    select en.id,
      case
        when en.entry_path='qualification' and en.entry_status='qualification_assigned' then 'qualification'
        when en.entry_path='direct' and en.entry_status in ('direct_qualified','finalist') then 'final'
        else null end duty_type
    from public.national_championship_entries en
    join public.national_championship_editions e on e.id=en.edition_id
    where e.season_number=(select season_number from public.game_state where id=true)
      and en.participation_decision in ('approved','auto_approved')
  loop
    if r.duty_type is not null then
      begin
        perform private.ensure_national_championship_confirmed_duty_v1(r.id,r.duty_type);
        v_duties_fixed:=v_duties_fixed+1;
      exception when others then null;
      end;
    end if;
  end loop;

  for r in
    select en.id
    from public.national_championship_entries en
    join public.national_championship_editions e on e.id=en.edition_id
    where e.season_number=(select season_number from public.game_state where id=true)
      and en.entry_path='qualification'
      and en.entry_status in ('qualified','finalist')
      and en.final_participation_decision in ('approved','auto_approved')
  loop
    begin
      perform private.ensure_national_championship_confirmed_duty_v1(r.id,'final');
      v_duties_fixed:=v_duties_fixed+1;
    exception when others then null;
    end;
  end loop;

  -- Sync only start lists whose materialized participant count differs from confirmed entries.
  for r in
    select h.edition_id,h.id heat_id
    from public.national_championship_heats h
    where h.race_id is not null
      and (
        (select count(*) from public.race_participant_riders rr where rr.race_id=h.race_id)
        <>
        (select count(*) from public.national_championship_entries en
         where en.edition_id=h.edition_id
           and public.national_championship_entry_confirmed_for_event_v1(en.id,'qualification',h.id))
      )
  loop
    begin
      perform public.national_championship_sync_race_participants_v1(r.edition_id,'qualification',r.heat_id);
      v_startlists_synced:=v_startlists_synced+1;
    exception when others then null;
    end;
  end loop;

  for r in
    select e.id
    from public.national_championship_editions e
    where e.final_race_id is not null
      and e.season_number=(select season_number from public.game_state where id=true)
      and (
        (select count(*) from public.race_participant_riders rr where rr.race_id=e.final_race_id)
        <>
        (select count(*) from public.national_championship_entries en
         where en.edition_id=e.id
           and public.national_championship_entry_confirmed_for_event_v1(en.id,'final',null))
      )
  loop
    begin
      perform public.national_championship_sync_race_participants_v1(r.id,'final',null);
      v_startlists_synced:=v_startlists_synced+1;
    exception when others then null;
    end;
  end loop;

  return jsonb_build_object(
    'runtime',v_runtime,
    'duties_reconciled',v_duties_fixed,
    'invalid_duties_cancelled',v_duties_cancelled,
    'startlists_synced',v_startlists_synced
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.national_championship_lifecycle_watchdog_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_repair jsonb;
  v_overview jsonb;
  v_issue_count integer:=0;
begin
  v_repair:=public.national_championship_lifecycle_reconcile_v1();
  v_overview:=public.national_championship_lifecycle_overview_v1();
  v_issue_count:=coalesce((v_overview#>>'{summary,issue_count}')::integer,0);

  perform public.log_system_business_check_v1(
    'check:national_championship_lifecycle',
    case when v_issue_count>0 then 'error' else 'success' end,
    case when v_issue_count>0
      then format('%s National Championship lifecycle issue(s) remain after automatic reconciliation.',v_issue_count)
      else 'National Championship lifecycle transitions are healthy.' end,
    jsonb_build_object('repair',v_repair,'lifecycle',v_overview)
  );

  if v_issue_count>0 then
    perform public.raise_system_incident_v1(
      'check:national_championship_lifecycle','critical',
      'National Championship lifecycle requires attention',
      format('%s lifecycle checkpoint issue(s) remain across ranking freeze, invitations, rider locks, start lists, qualification handoff or final completion.',v_issue_count),
      'business:national-championship-lifecycle',
      jsonb_build_object('repair',v_repair,'lifecycle',v_overview)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:national-championship-lifecycle',
      'National Championship lifecycle checkpoints are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_issue_count>0 then 'attention_required' else 'healthy' end,
    'issue_count',v_issue_count,'repair',v_repair,'lifecycle',v_overview
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_system_health_watchdog_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_championship jsonb;
  v_lifecycle jsonb;
  v_draw jsonb;
begin
  v_base:=public.run_system_health_watchdog_base_v1();

  begin
    v_championship:=public.championship_operations_health_check_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:championship_operations',
      'critical',
      'Championship health check failed',
      sqlerrm,
      'business:championship-operations-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_championship:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  begin
    v_lifecycle:=public.national_championship_lifecycle_watchdog_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:national_championship_lifecycle',
      'critical',
      'National Championship lifecycle health check failed',
      sqlerrm,
      'business:national-championship-lifecycle-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_lifecycle:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  begin
    v_draw:=public.championship_calendar_draw_health_check_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:championship_calendar_draw',
      'critical',
      'Championship calendar draw health check failed',
      sqlerrm,
      'business:championship-calendar-draw-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_draw:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  return coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object(
      'race_and_championship_operations',v_championship,
      'national_championship_lifecycle',v_lifecycle,
      'championship_calendar_draw',v_draw
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_system_health_overview_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_app_admin_v1() then raise exception 'Administrator access required' using errcode='42501'; end if;
 with pr as (
   select p.*,lr.status latest_status,lr.started_at latest_started_at,lr.finished_at latest_finished_at,
     lr.duration_ms latest_duration_ms,lr.summary latest_summary,lr.error_message latest_error_message,
     cj.active cron_active,
     (select count(*)::int from public.system_incidents i where i.process_key=p.process_key and i.status in ('open','acknowledged')) open_incidents
   from public.system_monitor_processes p
   left join lateral(select * from public.system_monitor_runs r where r.process_key=p.process_key order by r.started_at desc limit 1) lr on true
   left join cron.job cj on p.source_kind='cron' and cj.jobname=p.source_ref
   where p.is_enabled
 )
 select jsonb_build_object(
   'summary',jsonb_build_object(
     'open_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged')),
     'critical_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='critical'),
     'high_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='high'),
     'warning_incidents',(select count(*) from public.system_incidents where status in ('open','acknowledged') and severity='warning'),
     'monitored_processes',(select count(*) from public.system_monitor_processes where is_enabled),
     'user_sensitive_processes',(select count(*) from public.system_monitor_processes where is_enabled and user_sensitive),
     'alert_email',(select alert_email from public.system_health_config_v1 where id=true)
   ),
   'processes',coalesce((select jsonb_agg(jsonb_build_object(
     'process_key',process_key,'label',label,'category',category,'description',description,'source_kind',source_kind,'source_ref',source_ref,
     'user_sensitive',user_sensitive,'incident_severity',incident_severity,'expected_interval_minutes',expected_interval_minutes,
     'stale_after_minutes',stale_after_minutes,'latest_status',latest_status,'latest_started_at',latest_started_at,
     'latest_finished_at',latest_finished_at,'latest_duration_ms',latest_duration_ms,'latest_summary',latest_summary,
     'latest_error_message',latest_error_message,'cron_active',cron_active,'open_incidents',open_incidents
   ) order by sort_order,label) from pr),'[]'::jsonb),
   'incidents',coalesce((select jsonb_agg(jsonb_build_object(
     'id',i.id,'process_key',i.process_key,'process_label',p.label,'category',p.category,'severity',i.severity,'status',i.status,
     'title',i.title,'message',i.message,'details',i.details,'first_seen_at',i.first_seen_at,'last_seen_at',i.last_seen_at,
     'occurrence_count',i.occurrence_count,'last_emailed_at',i.last_emailed_at,'acknowledged_at',i.acknowledged_at,
     'resolved_at',i.resolved_at,'resolution_note',i.resolution_note,
     'is_unread',not exists(select 1 from public.system_incident_admin_reads rr where rr.incident_id=i.id and rr.admin_user_id=auth.uid())
   ) order by case i.severity when 'critical' then 1 when 'high' then 2 else 3 end,i.last_seen_at desc)
   from public.system_incidents i join public.system_monitor_processes p on p.process_key=i.process_key
   where i.status in ('open','acknowledged')),'[]'::jsonb)
 ) into result;
 return result || jsonb_build_object('national_championship_lifecycle',public.national_championship_lifecycle_overview_v1());
end;
$function$;

CREATE OR REPLACE FUNCTION control_center_private.build_admin_module_snapshot(p_module_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_module_key='world-nations-hosts' then
    return control_center_private.build_world_nations_hosts_snapshot_v1();
  end if;

  if p_module_key='system-health' then
    return control_center_private.build_admin_module_snapshot_legacy_v48(p_module_key)
      || jsonb_build_object(
        'national_championship_lifecycle',
        public.national_championship_lifecycle_overview_v1()
      );
  end if;

  return control_center_private.build_admin_module_snapshot_legacy_v48(p_module_key);
end;
$function$;
