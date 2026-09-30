-- National Association Squad selection workflow.
-- Coach selects a draft 10 first, locks the selection, invitations are sent automatically,
-- clubs have a response window, no-response auto-accepts at the deadline,
-- explicit declines reopen only the declined places for replacement.

create table if not exists public.national_team_selection_cycles (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  cycle_key text not null,
  status text not null default 'draft'
    check (status in ('draft','awaiting_responses','needs_replacement','ready_to_confirm','confirmed','cancelled')),
  selected_rider_ids uuid[] not null default '{}'::uuid[],
  locked_on_game_date date,
  response_deadline date,
  target_event_date date,
  final_squad_deadline date,
  replacement_round integer not null default 0 check (replacement_round >= 0),
  confirmed_squad_id uuid references public.national_team_squads(id) on delete set null,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (association_id,season_number,cycle_key)
);

create index if not exists idx_national_team_selection_cycles_status
  on public.national_team_selection_cycles(status,season_number);

alter table public.national_team_selection_cycles enable row level security;

drop policy if exists national_team_selection_cycles_read_member on public.national_team_selection_cycles;
create policy national_team_selection_cycles_read_member
on public.national_team_selection_cycles
for select
to authenticated
using (
  exists (
    select 1
    from public.national_association_memberships m
    where m.association_id=national_team_selection_cycles.association_id
      and m.user_id=auth.uid()
      and m.status='active'
  )
);

revoke all on public.national_team_selection_cycles from anon;
grant select on public.national_team_selection_cycles to authenticated;

create or replace function private.national_team_selection_target_event_date_v1(
  p_season_number integer,
  p_cycle_key text
)
returns date
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_group_id uuid;
  v_target date;
  v_cfg public.nations_competition_schedule_config%rowtype;
begin
  if coalesce(p_cycle_key,'') like 'nations:%' then
    begin
      v_group_id:=substring(p_cycle_key from 9)::uuid;
    exception when others then
      v_group_id:=null;
    end;

    if v_group_id is not null then
      select min(e.event_date)
      into v_target
      from public.nations_group_events e
      where e.group_id=v_group_id
        and e.event_date is not null;

      if v_target is not null then
        return v_target;
      end if;
    end if;
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id=true;

  if p_season_number=1 then
    return public.game_date_from_parts(
      p_season_number,
      coalesce(v_cfg.season1_earliest_preliminary_month,6),
      coalesce(v_cfg.season1_earliest_preliminary_day,1)
    );
  end if;

  return public.game_date_from_parts(
    p_season_number,
    coalesce(v_cfg.earliest_preliminary_month,2),
    coalesce(v_cfg.earliest_preliminary_day,15)
  );
end;
$function$;

revoke all on function private.national_team_selection_target_event_date_v1(integer,text)
from public,anon,authenticated;

create or replace function private.refresh_national_team_selection_cycle_v1(
  p_association_id uuid,
  p_season_number integer,
  p_cycle_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row public.national_team_selection_cycles%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_selected_count integer:=0;
  v_accepted_count integer:=0;
  v_pending_count integer:=0;
  v_declined_count integer:=0;
  v_next_status text;
begin
  select * into v_row
  from public.national_team_selection_cycles
  where association_id=p_association_id
    and season_number=p_season_number
    and cycle_key=p_cycle_key
  for update;

  if v_row.id is null then
    return jsonb_build_object('exists',false);
  end if;

  if v_row.status in ('confirmed','cancelled') then
    return jsonb_build_object(
      'exists',true,
      'status',v_row.status,
      'selection_id',v_row.id
    );
  end if;

  -- No response by the call-up deadline means the rider is treated as accepted.
  update public.national_team_callups c
  set status='auto_accepted',
      responded_on_game_date=v_today,
      response_note='No club response before deadline; National Team duty auto-accepted.',
      updated_at=now()
  where c.association_id=p_association_id
    and c.season_number=p_season_number
    and c.cycle_key=p_cycle_key
    and c.rider_id=any(v_row.selected_rider_ids)
    and c.status='pending'
    and c.response_deadline is not null
    and c.response_deadline<v_today;

  v_selected_count:=coalesce(cardinality(v_row.selected_rider_ids),0);

  select
    count(*) filter(where c.status in ('accepted','auto_accepted'))::integer,
    count(*) filter(where c.status='pending')::integer,
    count(*) filter(where c.status='declined')::integer
  into v_accepted_count,v_pending_count,v_declined_count
  from public.national_team_callups c
  where c.association_id=p_association_id
    and c.season_number=p_season_number
    and c.cycle_key=p_cycle_key
    and c.rider_id=any(v_row.selected_rider_ids);

  v_next_status:=
    case
      when v_declined_count>0 then 'needs_replacement'
      when v_selected_count=10 and v_accepted_count=10 then 'ready_to_confirm'
      when v_selected_count=10 and v_pending_count>0 then 'awaiting_responses'
      else 'draft'
    end;

  update public.national_team_selection_cycles
  set status=v_next_status,
      response_deadline=(
        select max(c.response_deadline)
        from public.national_team_callups c
        where c.association_id=p_association_id
          and c.season_number=p_season_number
          and c.cycle_key=p_cycle_key
          and c.rider_id=any(v_row.selected_rider_ids)
          and c.status='pending'
      ),
      updated_at=now()
  where id=v_row.id;

  return jsonb_build_object(
    'exists',true,
    'selection_id',v_row.id,
    'status',v_next_status,
    'selected_count',v_selected_count,
    'accepted_count',v_accepted_count,
    'pending_count',v_pending_count,
    'declined_count',v_declined_count
  );
end;
$function$;

revoke all on function private.refresh_national_team_selection_cycle_v1(uuid,integer,text)
from public,anon,authenticated;

create or replace function public.get_my_national_team_squad_workspace_v1(
  p_cycle_key text default 'season_main'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_today date:=public.get_current_game_date_date();
  v_response_days integer:=7;
  v_target date;
  v_final_deadline date;
  v_selection public.national_team_selection_cycles%rowtype;
  v_squad public.national_team_squads%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    return jsonb_build_object(
      'allowed',false,
      'reason','not_active_national_coach'
    );
  end if;

  if v_cycle='' or char_length(v_cycle)>80 then
    raise exception 'Invalid National Team cycle key.';
  end if;

  select coalesce(callup_response_days,7)::integer
  into v_response_days
  from public.national_association_config
  where id=true;

  v_target:=private.national_team_selection_target_event_date_v1(v_ctx.season_number,v_cycle);
  v_final_deadline:=case
    when v_target is null then null
    else v_target-3
  end;

  insert into public.national_team_selection_cycles(
    association_id,season_number,cycle_key,status,selected_rider_ids,
    target_event_date,final_squad_deadline,created_by_user_id,updated_by_user_id
  )
  values(
    v_ctx.association_id,v_ctx.season_number,v_cycle,'draft','{}'::uuid[],
    v_target,v_final_deadline,v_uid,v_uid
  )
  on conflict(association_id,season_number,cycle_key) do update
  set target_event_date=excluded.target_event_date,
      final_squad_deadline=excluded.final_squad_deadline,
      updated_at=now();

  perform private.refresh_national_team_selection_cycle_v1(
    v_ctx.association_id,v_ctx.season_number,v_cycle
  );

  select * into v_selection
  from public.national_team_selection_cycles
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle;

  select * into v_squad
  from public.national_team_squads
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle
  limit 1;

  return jsonb_build_object(
    'allowed',true,
    'association_id',v_ctx.association_id,
    'country_code',v_ctx.country_code,
    'season_number',v_ctx.season_number,
    'cycle_key',v_cycle,
    'current_game_date',v_today,
    'timeline',jsonb_build_object(
      'target_event_date',v_selection.target_event_date,
      'recommended_selection_lock_date',
        case
          when v_selection.target_event_date is null then null
          else v_selection.target_event_date-(coalesce(v_response_days,7)*2)
        end,
      'callup_response_days',coalesce(v_response_days,7),
      'response_deadline',v_selection.response_deadline,
      'final_squad_deadline',v_selection.final_squad_deadline
    ),
    'selection',jsonb_build_object(
      'selection_id',v_selection.id,
      'status',v_selection.status,
      'selected_rider_ids',to_jsonb(v_selection.selected_rider_ids),
      'selected_count',coalesce(cardinality(v_selection.selected_rider_ids),0),
      'locked_on',v_selection.locked_on_game_date,
      'response_deadline',v_selection.response_deadline,
      'replacement_round',v_selection.replacement_round
    ),
    'callups',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'callup_id',c.id,
          'rider_id',c.rider_id,
          'rider_name',c.rider_name_snapshot,
          'club_id',c.club_id_snapshot,
          'club_name',c.club_name_snapshot,
          'club_owner_user_id',c.club_owner_user_id_snapshot,
          'status',c.status,
          'sent_on',c.sent_on_game_date,
          'response_deadline',c.response_deadline,
          'responded_on',c.responded_on_game_date,
          'selected',c.rider_id=any(v_selection.selected_rider_ids)
        )
        order by
          case c.status
            when 'accepted' then 0
            when 'auto_accepted' then 0
            when 'pending' then 1
            when 'declined' then 2
            else 3
          end,
          c.rider_name_snapshot
      )
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
    ),'[]'::jsonb),
    'squad',
      case
        when v_squad.id is null then null
        else jsonb_build_object(
          'squad_id',v_squad.id,
          'status',v_squad.status,
          'squad_size',v_squad.squad_size,
          'confirmed_on',v_squad.confirmed_on_game_date,
          'duty_start_date',v_squad.duty_start_date,
          'duty_end_date',v_squad.duty_end_date,
          'members',coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'rider_id',m.rider_id,
                'rider_name',m.rider_name_snapshot,
                'club_id',m.club_id_snapshot,
                'club_name',m.club_name_snapshot,
                'squad_role',m.squad_role
              )
              order by m.rider_name_snapshot
            )
            from public.national_team_squad_members m
            where m.squad_id=v_squad.id
          ),'[]'::jsonb)
        )
      end,
    'riders',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rider_id',r.id,
          'rider_name',r.display_name,
          'image_url',r.image_url,
          'country_code',r.country_code,
          'role',r.role::text,
          'age_years',extract(year from age(v_today,r.birth_date))::integer,
          'club_id',r.club_id,
          'club_name',r.club_name,
          'club_is_ai',r.club_is_ai,
          'availability_status',r.availability_status,
          'fatigue',r.fatigue,
          'season_points',r.season_points_overall,
          'season_points_sprint',r.season_points_sprint,
          'season_points_climbing',r.season_points_climbing,
          'national_rank',rk.national_rank,
          'overall_range',jsonb_build_object(
            'min',lower(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_ctx.season_number
            )),
            'max',upper(private.national_coach_masked_overall_bounds_v1(
              r.id,r.overall::integer,v_ctx.season_number
            ))-1
          ),
          'skills',jsonb_build_object(
            'sprint',r.sprint,
            'climbing',r.climbing,
            'time_trial',r.time_trial,
            'endurance',r.endurance,
            'flat',r.flat,
            'recovery',r.recovery,
            'resistance',r.resistance,
            'race_iq',r.race_iq,
            'teamwork',r.teamwork
          ),
          'selection_scores',jsonb_build_object(
            'overall',
              round((
                r.flat*0.12+
                r.climbing*0.14+
                r.time_trial*0.12+
                r.sprint*0.10+
                r.endurance*0.14+
                r.recovery*0.10+
                r.resistance*0.10+
                r.race_iq*0.10+
                r.teamwork*0.08
              )::numeric,1),
            'flat',
              round((
                r.flat*0.35+
                r.sprint*0.20+
                r.endurance*0.20+
                r.race_iq*0.15+
                r.teamwork*0.10
              )::numeric,1),
            'climbing',
              round((
                r.climbing*0.40+
                r.endurance*0.25+
                r.recovery*0.15+
                r.race_iq*0.10+
                r.teamwork*0.10
              )::numeric,1),
            'time_trial',
              round((
                r.time_trial*0.45+
                r.flat*0.20+
                r.endurance*0.20+
                r.resistance*0.15
              )::numeric,1)
          ),
          'race_condition',jsonb_build_object(
            'race_sharpness',rc.race_sharpness,
            'last_raced_on',rc.last_raced_on,
            'race_days_last_14',rc.race_days_last_14
          ),
          'selected',r.id=any(v_selection.selected_rider_ids)
        )
        order by rk.national_rank nulls last,r.season_points_overall desc nulls last,r.display_name
      )
      from public.rider_statistics_page_view r
      left join public.rider_race_condition rc on rc.rider_id=r.id
      left join lateral (
        select p.national_rank
        from public.preview_national_ranking_v1(v_ctx.country_code,v_today) p
        where p.rider_id=r.id
        limit 1
      ) rk on true
      where upper(r.country_code)=v_ctx.country_code
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_national_team_squad_workspace_v1(text)
from public,anon;
grant execute on function public.get_my_national_team_squad_workspace_v1(text)
to authenticated;

create or replace function public.save_my_national_team_selection_draft_v1(
  p_cycle_key text,
  p_rider_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_ids uuid[];
  v_count integer:=0;
  v_valid integer:=0;
  v_row public.national_team_selection_cycles%rowtype;
  v_locked_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can edit National Team selection.';
  end if;

  select coalesce(array_agg(distinct x order by x),'{}'::uuid[])
  into v_ids
  from unnest(coalesce(p_rider_ids,'{}'::uuid[])) x;

  v_count:=coalesce(cardinality(v_ids),0);
  if v_count>10 then
    raise exception 'National Team selection can contain at most 10 riders.';
  end if;

  select count(*)::integer
  into v_valid
  from public.rider_statistics_page_view r
  where r.id=any(v_ids)
    and upper(r.country_code)=v_ctx.country_code;

  if v_valid<>v_count then
    raise exception 'Every selected rider must be eligible for this National Team.';
  end if;

  select * into v_row
  from public.national_team_selection_cycles
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle
  for update;

  if v_row.id is null then
    insert into public.national_team_selection_cycles(
      association_id,season_number,cycle_key,status,selected_rider_ids,
      target_event_date,final_squad_deadline,created_by_user_id,updated_by_user_id
    )
    values(
      v_ctx.association_id,v_ctx.season_number,v_cycle,'draft',v_ids,
      private.national_team_selection_target_event_date_v1(v_ctx.season_number,v_cycle),
      private.national_team_selection_target_event_date_v1(v_ctx.season_number,v_cycle)-3,
      v_uid,v_uid
    )
    returning * into v_row;
  else
    if v_row.status='confirmed' then
      raise exception 'The final National Team squad is already confirmed and locked.';
    end if;

    if v_row.status='awaiting_responses' then
      raise exception 'The locked selection is awaiting club responses. Only declined places can be replaced.';
    end if;

    if v_row.status='ready_to_confirm' then
      raise exception 'All selected riders are accepted. Confirm the final squad instead of changing it.';
    end if;

    if v_row.status='needs_replacement' then
      select coalesce(array_agg(c.rider_id order by c.rider_id),'{}'::uuid[])
      into v_locked_ids
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
        and c.rider_id=any(v_row.selected_rider_ids)
        and c.status in ('accepted','auto_accepted','pending');

      if not coalesce(v_locked_ids,'{}'::uuid[]) <@ v_ids then
        raise exception 'Accepted or still-pending riders are locked. Replace only declined rider places.';
      end if;
    end if;

    update public.national_team_selection_cycles
    set selected_rider_ids=v_ids,
        status='draft',
        response_deadline=null,
        replacement_round=case
          when v_row.status='needs_replacement' then v_row.replacement_round+1
          else v_row.replacement_round
        end,
        updated_by_user_id=v_uid,
        updated_at=now()
    where id=v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'selection_id',v_row.id,
    'status',v_row.status,
    'selected_rider_ids',to_jsonb(v_row.selected_rider_ids),
    'selected_count',coalesce(cardinality(v_row.selected_rider_ids),0),
    'replacement_round',v_row.replacement_round
  );
end;
$function$;

revoke all on function public.save_my_national_team_selection_draft_v1(text,uuid[])
from public,anon;
grant execute on function public.save_my_national_team_selection_draft_v1(text,uuid[])
to authenticated;

create or replace function public.lock_my_national_team_selection_v1(
  p_cycle_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_row public.national_team_selection_cycles%rowtype;
  v_rider_id uuid;
  v_callup jsonb;
  v_callup_status text;
  v_owner uuid;
  v_rider_name text;
  v_club_name text;
  v_deadline date;
  v_count integer;
  v_refresh jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can lock National Team selection.';
  end if;

  select * into v_row
  from public.national_team_selection_cycles
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle
  for update;

  if v_row.id is null then
    raise exception 'Create the 10-rider selection first.';
  end if;

  if v_row.status='confirmed' then
    raise exception 'The final National Team squad is already confirmed.';
  end if;

  v_count:=coalesce(cardinality(v_row.selected_rider_ids),0);
  if v_count<>10 then
    raise exception 'Select exactly 10 riders before locking the selection.';
  end if;

  if exists(
    select 1
    from public.national_team_callups c
    where c.association_id=v_ctx.association_id
      and c.season_number=v_ctx.season_number
      and c.cycle_key=v_cycle
      and c.rider_id=any(v_row.selected_rider_ids)
      and c.status='declined'
  ) then
    raise exception 'Replace declined riders before locking the selection again.';
  end if;

  foreach v_rider_id in array v_row.selected_rider_ids
  loop
    if not exists(
      select 1
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
        and c.rider_id=v_rider_id
        and c.status in ('pending','accepted','auto_accepted')
    ) then
      v_callup:=public.send_national_team_callup_v1(v_rider_id,v_cycle);
      v_callup_status:=v_callup->>'status';

      if v_callup_status='pending' then
        select c.club_owner_user_id_snapshot,c.rider_name_snapshot,c.club_name_snapshot,c.response_deadline
        into v_owner,v_rider_name,v_club_name,v_deadline
        from public.national_team_callups c
        where c.id=(v_callup->>'callup_id')::uuid;

        if v_owner is not null then
          perform public.ppm_create_user_notification_direct_v1(
            v_owner,
            'NATIONAL_TEAM_CALLUP_RECEIVED',
            'National Team call-up received',
            coalesce(v_rider_name,'Your rider')||' has been selected by the National Coach. Please respond before the deadline.',
            '/dashboard/national-association',
            jsonb_build_object(
              'callup_id',v_callup->>'callup_id',
              'rider_id',v_rider_id,
              'rider_name',v_rider_name,
              'club_name',v_club_name,
              'country_code',v_ctx.country_code,
              'season_number',v_ctx.season_number,
              'cycle_key',v_cycle,
              'response_deadline',v_deadline
            ),
            'national-team-callup:'||(v_callup->>'callup_id')
          );
        end if;
      end if;
    end if;
  end loop;

  update public.national_team_selection_cycles
  set locked_on_game_date=public.get_current_game_date_date(),
      status='awaiting_responses',
      updated_by_user_id=v_uid,
      updated_at=now()
  where id=v_row.id;

  v_refresh:=private.refresh_national_team_selection_cycle_v1(
    v_ctx.association_id,v_ctx.season_number,v_cycle
  );

  return jsonb_build_object(
    'selection_id',v_row.id,
    'status',v_refresh->>'status',
    'selected_count',10,
    'locked_on',public.get_current_game_date_date(),
    'response_deadline',(
      select max(c.response_deadline)
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
        and c.rider_id=any(v_row.selected_rider_ids)
        and c.status='pending'
    )
  );
end;
$function$;

revoke all on function public.lock_my_national_team_selection_v1(text)
from public,anon;
grant execute on function public.lock_my_national_team_selection_v1(text)
to authenticated;

create or replace function public.confirm_my_national_team_selection_v1(
  p_cycle_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_row public.national_team_selection_cycles%rowtype;
  v_result jsonb;
  v_squad_id uuid;
  v_owner uuid;
  v_callup_id uuid;
  v_rider_name text;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can confirm the National Team squad.';
  end if;

  perform private.refresh_national_team_selection_cycle_v1(
    v_ctx.association_id,v_ctx.season_number,v_cycle
  );

  select * into v_row
  from public.national_team_selection_cycles
  where association_id=v_ctx.association_id
    and season_number=v_ctx.season_number
    and cycle_key=v_cycle
  for update;

  if v_row.id is null or v_row.status<>'ready_to_confirm' then
    raise exception 'The selection is not ready to confirm. All 10 riders must be accepted or auto-accepted.';
  end if;

  v_result:=public.confirm_national_team_squad_v1(v_cycle,v_row.selected_rider_ids);
  v_squad_id:=(v_result->>'squad_id')::uuid;

  update public.national_team_selection_cycles
  set status='confirmed',
      confirmed_squad_id=v_squad_id,
      updated_by_user_id=v_uid,
      updated_at=now()
  where id=v_row.id;

  for v_owner,v_callup_id,v_rider_name in
    select distinct c.club_owner_user_id_snapshot,c.id,c.rider_name_snapshot
    from public.national_team_callups c
    where c.association_id=v_ctx.association_id
      and c.season_number=v_ctx.season_number
      and c.cycle_key=v_cycle
      and c.rider_id=any(v_row.selected_rider_ids)
      and c.club_owner_user_id_snapshot is not null
  loop
    perform public.ppm_create_user_notification_direct_v1(
      v_owner,
      'NATIONAL_TEAM_SQUAD_CONFIRMED',
      'National Team squad confirmed',
      coalesce(v_rider_name,'Your rider')||' is confirmed in the 10-rider National Team squad.',
      '/dashboard/national-association',
      jsonb_build_object(
        'squad_id',v_squad_id,
        'callup_id',v_callup_id,
        'rider_name',v_rider_name,
        'country_code',v_ctx.country_code,
        'season_number',v_ctx.season_number,
        'cycle_key',v_cycle
      ),
      'national-team-squad-confirmed:'||v_squad_id::text||':'||v_callup_id::text
    );
  end loop;

  return v_result || jsonb_build_object(
    'selection_id',v_row.id,
    'selection_status','confirmed'
  );
end;
$function$;

revoke all on function public.confirm_my_national_team_selection_v1(text)
from public,anon;
grant execute on function public.confirm_my_national_team_selection_v1(text)
to authenticated;

create or replace function public.respond_to_national_team_callup_v1(
  p_callup_id uuid,
  p_accept boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_callup public.national_team_callups%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_status text;
  v_coach_user_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_callup
  from public.national_team_callups
  where id=p_callup_id
  for update;

  if v_callup.id is null then
    raise exception 'National-team call-up not found.';
  end if;

  if v_callup.club_owner_user_id_snapshot<>v_uid then
    raise exception 'You do not control the club responsible for this call-up.';
  end if;

  if v_callup.status<>'pending' then
    raise exception 'This call-up is no longer awaiting a club decision.';
  end if;

  if v_callup.response_deadline is not null
     and v_today>v_callup.response_deadline then
    v_status:='auto_accepted';

    update public.national_team_callups
    set status=v_status,
        responded_on_game_date=v_today,
        response_note='No club response before deadline; National Team duty auto-accepted.',
        updated_at=now()
    where id=v_callup.id;
  else
    v_status:=case when p_accept then 'accepted' else 'declined' end;

    update public.national_team_callups
    set status=v_status,
        responded_on_game_date=v_today,
        responded_by_user_id=v_uid,
        response_note=nullif(btrim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=v_callup.id;
  end if;

  perform private.refresh_national_team_selection_cycle_v1(
    v_callup.association_id,v_callup.season_number,v_callup.cycle_key
  );

  select t.user_id
  into v_coach_user_id
  from public.national_coach_terms t
  where t.association_id=v_callup.association_id
    and t.season_number=v_callup.season_number
    and t.status='active'
  order by t.created_at desc
  limit 1;

  if v_coach_user_id is not null then
    perform public.ppm_create_user_notification_direct_v1(
      v_coach_user_id,
      'NATIONAL_TEAM_CALLUP_RESPONSE',
      'National Team call-up response',
      coalesce(v_callup.rider_name_snapshot,'A selected rider')||' is now '||
        replace(v_status,'_',' ')||'.',
      '/dashboard/national-association/squad',
      jsonb_build_object(
        'callup_id',v_callup.id,
        'rider_id',v_callup.rider_id,
        'rider_name',v_callup.rider_name_snapshot,
        'club_name',v_callup.club_name_snapshot,
        'status',v_status,
        'season_number',v_callup.season_number,
        'cycle_key',v_callup.cycle_key
      ),
      'national-team-callup-response:'||v_callup.id::text||':'||v_status
    );
  end if;

  return jsonb_build_object(
    'callup_id',v_callup.id,
    'rider_id',v_callup.rider_id,
    'status',v_status,
    'responded_on',v_today,
    'deadline_auto_accepted',v_status='auto_accepted'
  );
end;
$function$;

revoke all on function public.respond_to_national_team_callup_v1(uuid,boolean,text)
from public,anon;
grant execute on function public.respond_to_national_team_callup_v1(uuid,boolean,text)
to authenticated;

create or replace function public.get_my_national_team_callups_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'callup_id',c.id,
        'association_id',c.association_id,
        'association_name',a.name,
        'country_code',a.country_code,
        'season_number',c.season_number,
        'cycle_key',c.cycle_key,
        'rider_id',c.rider_id,
        'rider_name',c.rider_name_snapshot,
        'club_id',c.club_id_snapshot,
        'club_name',c.club_name_snapshot,
        'status',
          case
            when c.status='pending'
             and c.response_deadline is not null
             and c.response_deadline<v_today
              then 'auto_accepted'
            else c.status
          end,
        'sent_on',c.sent_on_game_date,
        'response_deadline',c.response_deadline,
        'responded_on',c.responded_on_game_date,
        'can_respond',
          c.status='pending'
          and (c.response_deadline is null or v_today<=c.response_deadline)
      )
      order by c.sent_on_game_date desc,c.created_at desc
    )
    from public.national_team_callups c
    join public.national_associations a on a.id=c.association_id
    where c.club_owner_user_id_snapshot=v_uid
  ),'[]'::jsonb);
end;
$function$;

revoke all on function public.get_my_national_team_callups_v1()
from public,anon;
grant execute on function public.get_my_national_team_callups_v1()
to authenticated;

create or replace function public.process_national_team_selection_deadlines_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_row record;
  v_processed integer:=0;
begin
  for v_row in
    select association_id,season_number,cycle_key
    from public.national_team_selection_cycles
    where status in ('awaiting_responses','needs_replacement')
  loop
    perform private.refresh_national_team_selection_cycle_v1(
      v_row.association_id,v_row.season_number,v_row.cycle_key
    );
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object('processed',v_processed);
end;
$function$;

revoke all on function public.process_national_team_selection_deadlines_v1()
from public,anon,authenticated;

create or replace function public.process_daily_tick()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_season int; v_month smallint; v_day smallint; v_paused boolean; v_date date;
begin
  select season_number,month_number,day_number,is_paused
    into v_season,v_month,v_day,v_paused
  from public.game_state
  where id=true;

  if coalesce(v_paused,false) then return; end if;

  v_date:=public.get_current_game_date_date();

  begin perform public.run_retirement_daily_jobs(); exception when others then raise warning 'run_retirement_daily_jobs failed: %',sqlerrm; end;
  begin perform public.process_due_rider_contract_starts_v1(v_date,null,null,null); exception when others then raise warning 'process_due_rider_contract_starts_v1 failed: %',sqlerrm; end;
  begin perform public.process_developing_team_age_limits_v1(v_date); exception when others then raise warning 'process_developing_team_age_limits_v1 failed: %',sqlerrm; end;
  begin perform public.notify_developing_team_window_open(); exception when others then raise warning 'notify_developing_team_window_open failed: %',sqlerrm; end;
  begin perform public.prepare_next_season_race_calendar_if_due_v1(); exception when others then raise warning 'prepare_next_season_race_calendar_if_due_v1 failed: %',sqlerrm; end;
  begin perform public.process_daily_training_camp_activities(); exception when others then raise warning 'process_daily_training_camp_activities failed: %',sqlerrm; end;
  begin perform public.process_daily_regular_training(); exception when others then raise warning 'process_daily_regular_training failed: %',sqlerrm; end;
  begin perform public.process_daily_training_camps(); exception when others then raise warning 'process_daily_training_camps failed: %',sqlerrm; end;
  begin perform public.process_weekly_rider_development(); exception when others then raise warning 'process_weekly_rider_development failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_rider_wages_guarded_v1(); exception when others then raise warning 'finance_process_weekly_rider_wages_guarded_v1 failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning 'finance_process_weekly_team_policy_costs failed: %',sqlerrm; end;
  begin perform public.finance_process_team_policy_nonrecurring_costs_v1(); exception when others then raise warning 'finance_process_team_policy_nonrecurring_costs_v1 failed: %',sqlerrm; end;
  begin perform public.process_daily_fatigue(); exception when others then raise warning 'process_daily_fatigue failed: %',sqlerrm; end;
  begin perform public.process_daily_health_cases(); exception when others then raise warning 'process_daily_health_cases failed: %',sqlerrm; end;
  begin perform public.process_daily_morale_v1(); exception when others then raise warning 'process_daily_morale_v1 failed: %',sqlerrm; end;
  begin perform public.process_staff_courses(); exception when others then raise warning 'process_staff_courses failed: %',sqlerrm; end;
  begin perform public.staff_market_run_daily_refresh(150,72); exception when others then raise warning 'staff_market_run_daily_refresh failed: %',sqlerrm; end;
  begin perform public.complete_due_rider_scout_tasks(); exception when others then raise warning 'complete_due_rider_scout_tasks failed: %',sqlerrm; end;
  begin perform public.create_staff_contract_expiry_notifications(); exception when others then raise warning 'create_staff_contract_expiry_notifications failed: %',sqlerrm; end;
  begin perform public.run_daily_market_jobs_detailed(); exception when others then raise warning 'run_daily_market_jobs_detailed failed: %',sqlerrm; end;
  begin perform public.process_daily_coach_training_plans_v1(v_date); exception when others then raise warning 'process_daily_coach_training_plans_v1 failed: %',sqlerrm; end;
  begin perform public.apply_team_policy_rider_support_v1(v_date); exception when others then raise warning 'apply_team_policy_rider_support_v1 failed: %',sqlerrm; end;
  begin perform public.process_national_team_selection_deadlines_v1(); exception when others then raise warning 'process_national_team_selection_deadlines_v1 failed: %',sqlerrm; end;

  begin
    perform public.ensure_rider_skill_weekly_snapshots_v1(v_date);
  exception when others then
    raise warning 'ensure_rider_skill_weekly_snapshots_v1 failed: %',sqlerrm;
  end;
end;
$function$;
