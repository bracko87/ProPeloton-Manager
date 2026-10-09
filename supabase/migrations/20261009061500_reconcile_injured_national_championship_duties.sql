-- Reconcile injuries against actual event dates and prevent a later duty
-- refresh from reinstating an unavailable rider's lock.
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

  if not public.national_championship_rider_available_for_event_v1(
    en.rider_id,v_event_date
  ) then
    raise exception 'Rider unavailable for National Championship event date %',v_event_date;
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
  v_unavailable_duties_cancelled integer:=0;
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

  -- A rider who became unavailable after confirmation must not retain a
  -- qualification/final duty that the entry readiness check rejects.
  update public.national_championship_duties d
  set status='cancelled',updated_at=now()
  from public.national_championship_entries en
  left join public.national_championship_heats h on h.id=en.heat_id
  join public.national_championship_editions e on e.id=en.edition_id
  where d.edition_id=en.edition_id
    and d.rider_id=en.rider_id
    and d.status='confirmed'
    and e.season_number=(select season_number from public.game_state where id=true)
    and not public.national_championship_rider_available_for_event_v1(
      en.rider_id,
      case when d.duty_type='qualification' then h.qualification_date
           else e.final_date end
    );
  get diagnostics v_unavailable_duties_cancelled=row_count;
  v_duties_cancelled:=v_duties_cancelled+v_unavailable_duties_cancelled;

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

