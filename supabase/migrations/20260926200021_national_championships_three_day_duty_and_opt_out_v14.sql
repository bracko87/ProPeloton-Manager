create or replace function public.freeze_national_championship_ranking_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  cfg public.national_championship_config%rowtype;
  v_eligible integer;
  v_direct integer;
  v_qualification_places integer;
  v_qualification_population integer;
  v_heat_count integer;
  v_heat integer;
  v_base_places integer;
  v_remainder integer;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status <> 'planned' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status',e.status,
      'already_processed',true
    );
  end if;

  if e.climate_status <> 'ready' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_climate',
      'climate_status',e.climate_status
    );
  end if;

  if e.route_status='missing_route' then
    return jsonb_build_object(
      'edition_id',e.id,
      'status','waiting_for_route'
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  insert into public.national_championship_ranking_snapshots(
    edition_id,rider_id,club_id,national_rank,raw_points,weighted_points,
    best_weighted_result,latest_result_date,overall_snapshot,
    rider_name_snapshot,country_code_snapshot
  )
  select
    e.id,p.rider_id,p.club_id,p.national_rank,p.raw_points,p.weighted_points,
    p.best_weighted_result,p.latest_result_date,p.overall,p.rider_name,p.country_code
  from public.preview_national_ranking_v1(e.country_code,e.ranking_snapshot_date) p;

  select count(*)::int into v_eligible
  from public.national_championship_ranking_snapshots
  where edition_id=e.id;

  if v_eligible <= cfg.final_field_size then
    v_direct:=v_eligible;
    v_qualification_places:=0;
    v_qualification_population:=0;
    v_heat_count:=0;
  else
    v_direct:=least(cfg.direct_qualifier_count,cfg.final_field_size);
    v_qualification_places:=cfg.final_field_size-v_direct;
    v_qualification_population:=v_eligible-v_direct;
    v_heat_count:=ceil(v_qualification_population::numeric/cfg.qualification_heat_max_size)::int;
  end if;

  if v_heat_count>0 then
    v_base_places:=floor(v_qualification_places::numeric/v_heat_count)::int;
    v_remainder:=mod(v_qualification_places,v_heat_count);

    for v_heat in 1..v_heat_count loop
      insert into public.national_championship_heats(
        edition_id,heat_number,qualification_date,qualifying_places
      )
      values(
        e.id,v_heat,e.qualification_date,
        v_base_places+case when v_heat<=v_remainder then 1 else 0 end
      );
    end loop;
  end if;

  if v_eligible <= cfg.final_field_size then
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,s.rider_id,s.club_id,s.national_rank,'direct','direct_qualified',
      s.national_rank,s.rider_name_snapshot,s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    where s.edition_id=e.id
    order by s.national_rank;
  else
    insert into public.national_championship_entries(
      edition_id,rider_id,club_id_snapshot,national_rank,entry_path,entry_status,
      heat_id,heat_number,seed_number,rider_name_snapshot,country_code_snapshot
    )
    select
      e.id,
      s.rider_id,
      s.club_id,
      s.national_rank,
      case when s.national_rank<=v_direct then 'direct' else 'qualification' end,
      case when s.national_rank<=v_direct then 'direct_qualified' else 'qualification_assigned' end,
      h.id,
      case when s.national_rank<=v_direct then null else q.heat_number end,
      s.national_rank,
      s.rider_name_snapshot,
      s.country_code_snapshot
    from public.national_championship_ranking_snapshots s
    left join lateral(
      select case
        when s.national_rank<=v_direct then null::integer
        else case
          when (floor(((s.national_rank-v_direct-1)::numeric)/v_heat_count)::int % 2)=0
            then ((s.national_rank-v_direct-1)%v_heat_count)+1
          else v_heat_count-((s.national_rank-v_direct-1)%v_heat_count)
        end
      end as heat_number
    ) q on true
    left join public.national_championship_heats h
      on h.edition_id=e.id and h.heat_number=q.heat_number
    where s.edition_id=e.id
    order by s.national_rank;
  end if;

  update public.national_championship_entries en
  set
    participation_decision=case
      when en.club_id_snapshot is null then 'auto_approved'
      when coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then 'auto_approved'
      else 'pending'
    end,
    participation_decision_at=case
      when en.club_id_snapshot is null
        or coalesce(root.is_ai,false)
        or root.owner_user_id is null
        then now()
      else null
    end,
    updated_at=now()
  from public.clubs rc
  left join public.clubs root_parent
    on root_parent.id=rc.parent_club_id
  cross join lateral(
    select
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then coalesce(root_parent.is_ai,false)
        else coalesce(rc.is_ai,false)
      end as is_ai,
      case when rc.club_type='developing' and rc.parent_club_id is not null
        then root_parent.owner_user_id
        else rc.owner_user_id
      end as owner_user_id
  ) root
  where en.edition_id=e.id
    and en.club_id_snapshot=rc.id;

  update public.national_championship_entries
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  where edition_id=e.id
    and club_id_snapshot is null;

  update public.national_championship_heats h
  set assigned_count=x.assigned_count,updated_at=now()
  from(
    select heat_id,count(*)::int assigned_count
    from public.national_championship_entries
    where edition_id=e.id and heat_id is not null
      and entry_status<>'withdrawn'
    group by heat_id
  ) x
  where h.id=x.heat_id;

  insert into public.national_championship_duties(
    edition_id,rider_id,duty_type,duty_date,heat_id,status,label,
    duty_start_date,duty_end_date
  )
  select
    e.id,
    en.rider_id,
    case when en.entry_path='direct' then 'final' else 'qualification' end,
    case when en.entry_path='direct' then e.final_date else e.qualification_date end,
    en.heat_id,
    'confirmed',
    case
      when en.entry_path='direct'
        then 'National Duty — '||e.country_code||' National Road Championship'
      else 'National Duty — '||e.country_code||' National Championship Qualification'
    end,
    e.duty_window_start_date,
    e.duty_window_end_date
  from public.national_championship_entries en
  where en.edition_id=e.id
  on conflict (edition_id,rider_id,duty_type) do update
    set duty_date=excluded.duty_date,
        heat_id=excluded.heat_id,
        label=excluded.label,
        status='confirmed',
        duty_start_date=excluded.duty_start_date,
        duty_end_date=excluded.duty_end_date,
        updated_at=now();

  update public.national_championship_editions
  set status='ranking_frozen',
      eligible_count=v_eligible,
      direct_qualifier_count=v_direct,
      qualification_places=v_qualification_places,
      qualification_heat_count=v_heat_count,
      updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'edition_id',e.id,
    'country_code',e.country_code,
    'eligible_count',v_eligible,
    'direct_qualifiers',v_direct,
    'qualification_population',v_qualification_population,
    'qualification_places',v_qualification_places,
    'heat_count',v_heat_count,
    'duty_window_start_date',e.duty_window_start_date,
    'duty_window_end_date',e.duty_window_end_date,
    'decision_deadline',e.participation_decision_deadline,
    'status','ranking_frozen'
  );
end;
$$;

create or replace function public.set_my_national_championship_participation_v1(
  p_edition_id uuid,
  p_rider_id uuid,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  cfg public.national_championship_config%rowtype;
  v_owner uuid;
  v_game_date date;
  v_before integer;
  v_after integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found';
  end if;

  select * into en
  from public.national_championship_entries
  where edition_id=e.id and rider_id=p_rider_id
  for update;

  if en.id is null then
    raise exception 'National championship entry not found';
  end if;

  if en.club_id_snapshot is null then
    raise exception 'Clubless riders are automatically entered';
  end if;

  select case
    when rc.club_type='developing' and rc.parent_club_id is not null
      then parent.owner_user_id
    else rc.owner_user_id
  end
  into v_owner
  from public.clubs rc
  left join public.clubs parent on parent.id=rc.parent_club_id
  where rc.id=en.club_id_snapshot;

  if v_owner is distinct from v_user then
    raise exception 'Not allowed to decide for this rider';
  end if;

  select public.get_current_game_date_date() into v_game_date;

  if e.participation_decision_deadline is null
     or v_game_date > e.participation_decision_deadline
  then
    raise exception 'The National Championship participation decision deadline has passed';
  end if;

  if en.participation_decision<>'pending' then
    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'participation_decision',en.participation_decision,
      'already_decided',true
    );
  end if;

  if p_approve then
    update public.national_championship_entries
    set participation_decision='approved',
        participation_decision_at=now(),
        participation_decision_user_id=v_user,
        updated_at=now()
    where id=en.id;

    return jsonb_build_object(
      'edition_id',e.id,
      'rider_id',en.rider_id,
      'participation_decision','approved',
      'duty_window_start_date',e.duty_window_start_date,
      'duty_window_end_date',e.duty_window_end_date
    );
  end if;

  select * into cfg
  from public.national_championship_config
  where id=true;

  select coalesce(morale,50) into v_before
  from public.riders
  where id=en.rider_id
  for update;

  v_after:=greatest(0,v_before-cfg.refusal_morale_penalty);

  update public.riders
  set morale=v_after,
      morale_updated_on=greatest(coalesce(morale_updated_on,v_game_date),v_game_date)
  where id=en.rider_id;

  update public.national_championship_entries
  set participation_decision='rejected',
      participation_decision_at=now(),
      participation_decision_user_id=v_user,
      refusal_morale_delta=-cfg.refusal_morale_penalty,
      entry_status='withdrawn',
      updated_at=now()
  where id=en.id;

  update public.national_championship_duties
  set status='cancelled',updated_at=now()
  where edition_id=e.id
    and rider_id=en.rider_id
    and status='confirmed';

  delete from public.national_championship_rider_plans
  where edition_id=e.id and rider_id=en.rider_id;

  update public.national_championship_heats h
  set assigned_count=(
        select count(*)::int
        from public.national_championship_entries x
        where x.heat_id=h.id
          and x.entry_status='qualification_assigned'
      ),
      updated_at=now()
  where h.edition_id=e.id;

  if en.entry_path='qualification' and en.heat_id is not null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,'qualification',en.heat_id
    );
  elsif en.entry_path='direct' and e.final_race_id is not null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,'final',null
    );
  end if;

  return jsonb_build_object(
    'edition_id',e.id,
    'rider_id',en.rider_id,
    'participation_decision','rejected',
    'morale_before',v_before,
    'morale_after',v_after,
    'morale_delta',-cfg.refusal_morale_penalty
  );
end;
$$;

revoke execute on function public.set_my_national_championship_participation_v1(uuid,uuid,boolean)
  from public,anon;
grant execute on function public.set_my_national_championship_participation_v1(uuid,uuid,boolean)
  to authenticated;

create or replace function public.national_championship_auto_approve_pending_v1()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_game_date date;
  v_count integer;
begin
  select public.get_current_game_date_date() into v_game_date;

  update public.national_championship_entries en
  set participation_decision='auto_approved',
      participation_decision_at=now(),
      updated_at=now()
  from public.national_championship_editions e
  where e.id=en.edition_id
    and en.participation_decision='pending'
    and e.participation_decision_deadline is not null
    and v_game_date > e.participation_decision_deadline;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

revoke execute on function public.national_championship_auto_approve_pending_v1()
  from public,anon,authenticated;

create or replace function public.national_championship_notify_selection_v1(
  p_edition_id uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    return 0;
  end if;

  for x in
    select
      en.rider_id,
      en.rider_name_snapshot,
      en.entry_path,
      en.heat_number,
      en.participation_decision,
      root.owner_user_id
    from public.national_championship_entries en
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root
      on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null
          then rc.parent_club_id
        else rc.id
      end
    where en.edition_id=e.id
      and root.owner_user_id is not null
  loop
    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_name_snapshot||' selected for National Duty',
      x.rider_name_snapshot||
        ' is selected for the '||e.country_code||
        ' National Road Championship window from '||
        e.duty_window_start_date||' to '||e.duty_window_end_date||
        '. The rider is blocked from club races on all three days. '||
        case
          when x.entry_path='qualification'
            then 'Qualification heat '||coalesce(x.heat_number,1)||
                 ' is on '||e.qualification_date||' and the final is on '||e.final_date||'. '
          else 'The rider is directly qualified for the final on '||e.final_date||'. '
        end||
        'Open National Ranking to approve or refuse participation before '||
        e.participation_decision_deadline||'. Refusing releases the rider for club duty but reduces morale.',
      '/dashboard/national-ranking?country='||e.country_code,
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',e.qualification_date,
        'final_date',e.final_date,
        'duty_window_start_date',e.duty_window_start_date,
        'duty_window_end_date',e.duty_window_end_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'participation_decision',x.participation_decision,
        'action_path','/dashboard/national-ranking?country='||e.country_code
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.get_overlapping_committed_riders(
  p_rider_ids uuid[],
  p_start_date date,
  p_days integer
)
returns table(
  rider_id uuid,
  source_type text,
  source_id uuid,
  blocked_from date,
  blocked_until date,
  status_code text
)
language sql
stable
set search_path = ''
as $$
  with req as(
    select
      (p_start_date-1) as requested_from_with_buffer,
      ((p_start_date+(p_days-1))+1) as requested_until_with_buffer,
      p_start_date as requested_from_exact,
      (p_start_date+(p_days-1)) as requested_until_exact
  )
  select
    rcw.rider_id,
    rcw.source_type,
    rcw.source_id,
    rcw.blocked_from,
    rcw.blocked_until,
    'already_in_overlapping_activity'::text
  from public.rider_commitment_windows rcw
  cross join req
  where rcw.rider_id=any(coalesce(p_rider_ids,'{}'::uuid[]))
    and not(
      rcw.blocked_until<req.requested_from_with_buffer
      or rcw.blocked_from>req.requested_until_with_buffer
    )

  union all

  select
    nd.rider_id,
    'national_duty'::text,
    nd.id,
    coalesce(nd.duty_start_date,nd.duty_date),
    coalesce(nd.duty_end_date,nd.duty_date),
    'national_duty'::text
  from public.national_championship_duties nd
  cross join req
  where nd.rider_id=any(coalesce(p_rider_ids,'{}'::uuid[]))
    and nd.status='confirmed'
    and coalesce(nd.duty_start_date,nd.duty_date)<=req.requested_until_exact
    and coalesce(nd.duty_end_date,nd.duty_date)>=req.requested_from_exact;
$$;

create or replace function public.get_race_preparation_blocked_resources_v1(
  p_club_id uuid,
  p_race_id uuid,
  p_exclude_race_preparation_id uuid default null
)
returns table(
  resource_type text,
  resource_id uuid,
  asset_key text,
  asset_slot_key text,
  blocking_race_preparation_id uuid,
  blocking_race_id uuid,
  blocking_race_name text,
  blocking_start_date date,
  blocking_end_date date
)
language sql
stable
security definer
set search_path = 'public'
as $$
with target_race as(
  select r.id,r.start_date::date start_date,
         coalesce(r.end_date::date,r.start_date::date) end_date
  from public.races r
  where r.id=p_race_id
),
overlapping_preps as(
  select rp.id race_preparation_id,rp.race_id,r.name race_name,
         r.start_date::date start_date,
         coalesce(r.end_date::date,r.start_date::date) end_date
  from public.race_preparations rp
  join public.races r on r.id=rp.race_id
  cross join target_race tr
  where rp.club_id=p_club_id
    and rp.id is distinct from p_exclude_race_preparation_id
    and rp.race_id<>p_race_id
    and(
      coalesce(rp.status,'') in ('submitted','locked','sent_to_engine')
      or coalesce(rp.startlist_status,'') in ('submitted','locked','sent_to_engine')
    )
    and r.start_date::date<=tr.end_date
    and coalesce(r.end_date::date,r.start_date::date)>=tr.start_date
)
select 'rider'::text,rpr.rider_id,null::text,null::text,
       op.race_preparation_id,op.race_id,op.race_name,op.start_date,op.end_date
from overlapping_preps op
join public.race_preparation_riders rpr on rpr.race_preparation_id=op.race_preparation_id

union all

select 'staff'::text,rps.staff_id,null::text,null::text,
       op.race_preparation_id,op.race_id,op.race_name,op.start_date,op.end_date
from overlapping_preps op
join public.race_preparation_staff rps on rps.race_preparation_id=op.race_preparation_id

union all

select 'asset'::text,rpa.asset_id,rpa.asset_key,rpa.asset_slot_key,
       op.race_preparation_id,op.race_id,op.race_name,op.start_date,op.end_date
from overlapping_preps op
join public.race_preparation_assets rpa on rpa.race_preparation_id=op.race_preparation_id

union all

select
  'rider'::text,
  nd.rider_id,
  null::text,
  null::text,
  null::uuid,
  case
    when nd.duty_type='qualification' then h.race_id
    when nd.duty_type='final' then e.final_race_id
    else e.final_race_id
  end,
  nd.label,
  coalesce(nd.duty_start_date,nd.duty_date),
  coalesce(nd.duty_end_date,nd.duty_date)
from public.national_championship_duties nd
join public.national_championship_editions e on e.id=nd.edition_id
left join public.national_championship_heats h on h.id=nd.heat_id
cross join target_race tr
where nd.status='confirmed'
  and coalesce(nd.duty_start_date,nd.duty_date)<=tr.end_date
  and coalesce(nd.duty_end_date,nd.duty_date)>=tr.start_date
  and coalesce(
        case
          when nd.duty_type='qualification' then h.race_id
          when nd.duty_type='final' then e.final_race_id
        end,
        '00000000-0000-0000-0000-000000000000'::uuid
      ) is distinct from p_race_id;
$$;
