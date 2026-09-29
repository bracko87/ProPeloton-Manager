-- National Team call-ups and 10-rider squad foundation v1.
-- National Championship participation remains a separate system.
-- "National Duty" begins only after a rider is in a confirmed national-team squad
-- and a competition duty window is later assigned.

alter table public.national_association_config
  add column if not exists max_active_callups smallint not null default 15
    check (max_active_callups between 10 and 30),
  add column if not exists callup_response_days smallint not null default 7
    check (callup_response_days between 1 and 30);

create table if not exists public.national_team_callups (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  cycle_key text not null default 'season_main',
  rider_id uuid not null references public.riders(id) on delete cascade,
  rider_name_snapshot text not null,
  country_code text not null,
  club_id_snapshot uuid references public.clubs(id) on delete set null,
  club_name_snapshot text,
  club_owner_user_id_snapshot uuid,
  sent_by_user_id uuid not null,
  status text not null
    check (status in (
      'pending',
      'accepted',
      'auto_accepted',
      'declined',
      'withdrawn',
      'not_selected',
      'expired'
    )),
  sent_on_game_date date not null,
  response_deadline date,
  responded_on_game_date date,
  responded_by_user_id uuid,
  response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(association_id,season_number,cycle_key,rider_id)
);

create index if not exists national_team_callups_assoc_cycle_status_idx
  on public.national_team_callups(association_id,season_number,cycle_key,status);

create index if not exists national_team_callups_owner_pending_idx
  on public.national_team_callups(club_owner_user_id_snapshot,status,response_deadline);

create table if not exists public.national_team_squads (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number > 0),
  cycle_key text not null default 'season_main',
  status text not null default 'draft'
    check (status in ('draft','confirmed','on_duty','completed','cancelled')),
  squad_size smallint not null default 10 check (squad_size > 0),
  confirmed_by_user_id uuid,
  confirmed_on_game_date date,
  duty_start_date date,
  duty_end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(association_id,season_number,cycle_key),
  check (
    duty_start_date is null
    or duty_end_date is null
    or duty_start_date <= duty_end_date
  )
);

create table if not exists public.national_team_squad_members (
  id uuid primary key default gen_random_uuid(),
  squad_id uuid not null references public.national_team_squads(id) on delete cascade,
  callup_id uuid not null references public.national_team_callups(id) on delete restrict,
  rider_id uuid not null references public.riders(id) on delete restrict,
  rider_name_snapshot text not null,
  club_id_snapshot uuid references public.clubs(id) on delete set null,
  club_name_snapshot text,
  squad_role text not null default 'squad'
    check (squad_role in ('squad','reserve')),
  created_at timestamptz not null default now(),
  unique(squad_id,rider_id),
  unique(squad_id,callup_id)
);

create index if not exists national_team_squad_members_rider_idx
  on public.national_team_squad_members(rider_id,squad_id);

drop trigger if exists national_team_callups_set_updated_at
  on public.national_team_callups;
create trigger national_team_callups_set_updated_at
before update on public.national_team_callups
for each row execute function private.ppm_set_updated_at_v1();

drop trigger if exists national_team_squads_set_updated_at
  on public.national_team_squads;
create trigger national_team_squads_set_updated_at
before update on public.national_team_squads
for each row execute function private.ppm_set_updated_at_v1();

create or replace function private.current_national_coach_context_v1(p_user_id uuid)
returns table(
  term_id uuid,
  association_id uuid,
  country_code text,
  season_number integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.association_id,
    a.country_code,
    t.season_number
  from public.national_coach_terms t
  join public.national_associations a
    on a.id=t.association_id
   and a.status='active'
  join public.game_state gs
    on gs.id=true
   and gs.season_number=t.season_number
  where t.user_id=p_user_id
    and t.status='active'
    and private.national_association_member_is_eligible_v1(
      t.association_id,
      p_user_id
    )
  order by
    case t.term_kind when 'elected' then 0 when 'replacement' then 1 else 2 end,
    t.created_at desc
  limit 1;
$$;

create or replace function public.send_national_team_callup_v1(
  p_rider_id uuid,
  p_cycle_key text default 'season_main'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_rider record;
  v_root_owner uuid;
  v_today date:=public.get_current_game_date_date();
  v_deadline date;
  v_response_days integer;
  v_max_callups integer;
  v_active_callups integer;
  v_status text;
  v_callup_id uuid;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if v_cycle='' or char_length(v_cycle)>80 then
    raise exception 'Invalid national-team cycle key.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can send national-team call-ups.';
  end if;

  select
    r.id,
    r.display_name,
    upper(r.country_code) as country_code,
    r.club_id,
    r.club_name,
    coalesce(r.club_is_ai,false) as club_is_ai,
    r.availability_status,
    c.owner_user_id as direct_owner,
    parent.owner_user_id as parent_owner
  into v_rider
  from public.rider_statistics_page_view r
  left join public.clubs c on c.id=r.club_id
  left join public.clubs parent on parent.id=c.parent_club_id
  where r.id=p_rider_id
  limit 1;

  if v_rider.id is null then
    raise exception 'Rider not found.';
  end if;

  if v_rider.country_code<>v_ctx.country_code then
    raise exception 'This rider is not eligible for your national team.';
  end if;

  select
    callup_response_days::integer,
    max_active_callups::integer
  into v_response_days,v_max_callups
  from public.national_association_config
  where id=true;

  select count(*)::integer
  into v_active_callups
  from public.national_team_callups c
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.status in ('pending','accepted','auto_accepted');

  if v_active_callups>=coalesce(v_max_callups,15) then
    raise exception 'Maximum provisional call-ups reached for this national-team cycle.';
  end if;

  v_root_owner:=coalesce(v_rider.parent_owner,v_rider.direct_owner);

  if v_rider.club_id is null or v_rider.club_is_ai then
    if coalesce(v_rider.availability_status,'fit')='fit' then
      v_status:='auto_accepted';
      v_deadline:=null;
    else
      raise exception 'The AI/free-agent rider is currently unavailable for call-up.';
    end if;
  else
    if v_root_owner is null then
      raise exception 'The rider club does not have a valid controlling manager.';
    end if;
    v_status:='pending';
    v_deadline:=v_today+coalesce(v_response_days,7);
  end if;

  insert into public.national_team_callups(
    association_id,season_number,cycle_key,rider_id,rider_name_snapshot,
    country_code,club_id_snapshot,club_name_snapshot,
    club_owner_user_id_snapshot,sent_by_user_id,status,
    sent_on_game_date,response_deadline,
    responded_on_game_date,responded_by_user_id
  )
  values(
    v_ctx.association_id,v_ctx.season_number,v_cycle,v_rider.id,
    coalesce(v_rider.display_name,v_rider.id::text),
    v_ctx.country_code,v_rider.club_id,v_rider.club_name,
    v_root_owner,v_uid,v_status,v_today,v_deadline,
    case when v_status='auto_accepted' then v_today else null end,
    null
  )
  on conflict(association_id,season_number,cycle_key,rider_id)
  do update
  set
    rider_name_snapshot=excluded.rider_name_snapshot,
    club_id_snapshot=excluded.club_id_snapshot,
    club_name_snapshot=excluded.club_name_snapshot,
    club_owner_user_id_snapshot=excluded.club_owner_user_id_snapshot,
    sent_by_user_id=excluded.sent_by_user_id,
    status=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.status
        else public.national_team_callups.status
      end,
    sent_on_game_date=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.sent_on_game_date
        else public.national_team_callups.sent_on_game_date
      end,
    response_deadline=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.response_deadline
        else public.national_team_callups.response_deadline
      end,
    responded_on_game_date=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.responded_on_game_date
        else public.national_team_callups.responded_on_game_date
      end,
    responded_by_user_id=
      case
        when public.national_team_callups.status in ('withdrawn','not_selected','expired')
          then excluded.responded_by_user_id
        else public.national_team_callups.responded_by_user_id
      end,
    updated_at=now()
  returning id,status,response_deadline
  into v_callup_id,v_status,v_deadline;

  if v_status='declined' then
    raise exception 'This rider has already declined the current call-up.';
  end if;

  return jsonb_build_object(
    'callup_id',v_callup_id,
    'rider_id',v_rider.id,
    'rider_name',v_rider.display_name,
    'status',v_status,
    'response_deadline',v_deadline,
    'cycle_key',v_cycle
  );
end;
$$;

create or replace function public.respond_to_national_team_callup_v1(
  p_callup_id uuid,
  p_accept boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_callup public.national_team_callups%rowtype;
  v_today date:=public.get_current_game_date_date();
  v_status text;
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
    update public.national_team_callups
    set status='expired',
        responded_on_game_date=v_today,
        response_note='No club response before deadline.',
        updated_at=now()
    where id=v_callup.id;

    raise exception 'The response deadline has passed. The call-up has expired.';
  end if;

  v_status:=case when p_accept then 'accepted' else 'declined' end;

  update public.national_team_callups
  set status=v_status,
      responded_on_game_date=v_today,
      responded_by_user_id=v_uid,
      response_note=nullif(btrim(coalesce(p_note,'')),''),
      updated_at=now()
  where id=v_callup.id;

  return jsonb_build_object(
    'callup_id',v_callup.id,
    'rider_id',v_callup.rider_id,
    'status',v_status,
    'responded_on',v_today
  );
end;
$$;

create or replace function public.expire_national_team_callups_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date:=public.get_current_game_date_date();
  v_count integer;
begin
  update public.national_team_callups
  set status='expired',
      responded_on_game_date=v_today,
      response_note='No club response before deadline.',
      updated_at=now()
  where status='pending'
    and response_deadline is not null
    and response_deadline<v_today;

  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

create or replace function public.confirm_national_team_squad_v1(
  p_cycle_key text,
  p_rider_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_today date:=public.get_current_game_date_date();
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
  v_required integer;
  v_distinct_count integer;
  v_valid_count integer;
  v_squad_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can confirm the national squad.';
  end if;

  select national_squad_size::integer
  into v_required
  from public.national_association_config
  where id=true;

  select count(distinct x)::integer
  into v_distinct_count
  from unnest(coalesce(p_rider_ids,array[]::uuid[])) x;

  if v_distinct_count<>coalesce(v_required,10) then
    raise exception 'The final national squad must contain exactly % distinct riders.',coalesce(v_required,10);
  end if;

  select count(*)::integer
  into v_valid_count
  from public.national_team_callups c
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.rider_id=any(p_rider_ids)
    and c.status in ('accepted','auto_accepted');

  if v_valid_count<>coalesce(v_required,10) then
    raise exception 'Every selected rider must have an accepted national-team call-up.';
  end if;

  insert into public.national_team_squads(
    association_id,season_number,cycle_key,status,squad_size,
    confirmed_by_user_id,confirmed_on_game_date
  )
  values(
    v_ctx.association_id,v_ctx.season_number,v_cycle,'confirmed',
    coalesce(v_required,10),v_uid,v_today
  )
  on conflict(association_id,season_number,cycle_key)
  do update
  set status='confirmed',
      squad_size=excluded.squad_size,
      confirmed_by_user_id=excluded.confirmed_by_user_id,
      confirmed_on_game_date=excluded.confirmed_on_game_date,
      updated_at=now()
  returning id into v_squad_id;

  delete from public.national_team_squad_members
  where squad_id=v_squad_id;

  insert into public.national_team_squad_members(
    squad_id,callup_id,rider_id,rider_name_snapshot,
    club_id_snapshot,club_name_snapshot,squad_role
  )
  select
    v_squad_id,c.id,c.rider_id,c.rider_name_snapshot,
    c.club_id_snapshot,c.club_name_snapshot,'squad'
  from public.national_team_callups c
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.rider_id=any(p_rider_ids)
    and c.status in ('accepted','auto_accepted');

  update public.national_team_callups c
  set status='not_selected',
      updated_at=now()
  where c.association_id=v_ctx.association_id
    and c.season_number=v_ctx.season_number
    and c.cycle_key=v_cycle
    and c.status in ('accepted','auto_accepted','pending')
    and not (c.rider_id=any(p_rider_ids));

  return jsonb_build_object(
    'squad_id',v_squad_id,
    'association_id',v_ctx.association_id,
    'season_number',v_ctx.season_number,
    'cycle_key',v_cycle,
    'status','confirmed',
    'squad_size',coalesce(v_required,10)
  );
end;
$$;

create or replace function public.get_my_national_team_callups_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
              then 'expired'
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
$$;

create or replace function public.get_my_national_coach_callups_v1(
  p_cycle_key text default 'season_main'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_cycle text:=btrim(coalesce(p_cycle_key,'season_main'));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    return jsonb_build_object('allowed',false,'callups','[]'::jsonb,'squad',null);
  end if;

  return jsonb_build_object(
    'allowed',true,
    'association_id',v_ctx.association_id,
    'season_number',v_ctx.season_number,
    'cycle_key',v_cycle,
    'callups',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'callup_id',c.id,
          'rider_id',c.rider_id,
          'rider_name',c.rider_name_snapshot,
          'club_id',c.club_id_snapshot,
          'club_name',c.club_name_snapshot,
          'status',c.status,
          'sent_on',c.sent_on_game_date,
          'response_deadline',c.response_deadline,
          'responded_on',c.responded_on_game_date
        )
        order by
          case c.status
            when 'accepted' then 0
            when 'auto_accepted' then 0
            when 'pending' then 1
            else 2
          end,
          c.rider_name_snapshot
      )
      from public.national_team_callups c
      where c.association_id=v_ctx.association_id
        and c.season_number=v_ctx.season_number
        and c.cycle_key=v_cycle
    ),'[]'::jsonb),
    'squad',(
      select jsonb_build_object(
        'squad_id',s.id,
        'status',s.status,
        'squad_size',s.squad_size,
        'confirmed_on',s.confirmed_on_game_date,
        'duty_start_date',s.duty_start_date,
        'duty_end_date',s.duty_end_date,
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
          where m.squad_id=s.id
        ),'[]'::jsonb)
      )
      from public.national_team_squads s
      where s.association_id=v_ctx.association_id
        and s.season_number=v_ctx.season_number
        and s.cycle_key=v_cycle
      limit 1
    )
  );
end;
$$;

alter table public.national_team_callups enable row level security;
alter table public.national_team_squads enable row level security;
alter table public.national_team_squad_members enable row level security;

revoke all on public.national_team_callups from anon,authenticated;
revoke all on public.national_team_squads from anon,authenticated;
revoke all on public.national_team_squad_members from anon,authenticated;

revoke all on function public.send_national_team_callup_v1(uuid,text)
from public,anon,authenticated;
grant execute on function public.send_national_team_callup_v1(uuid,text)
to authenticated;

revoke all on function public.respond_to_national_team_callup_v1(uuid,boolean,text)
from public,anon,authenticated;
grant execute on function public.respond_to_national_team_callup_v1(uuid,boolean,text)
to authenticated;

revoke all on function public.confirm_national_team_squad_v1(text,uuid[])
from public,anon,authenticated;
grant execute on function public.confirm_national_team_squad_v1(text,uuid[])
to authenticated;

revoke all on function public.get_my_national_team_callups_v1()
from public,anon,authenticated;
grant execute on function public.get_my_national_team_callups_v1()
to authenticated;

revoke all on function public.get_my_national_coach_callups_v1(text)
from public,anon,authenticated;
grant execute on function public.get_my_national_coach_callups_v1(text)
to authenticated;

revoke all on function public.expire_national_team_callups_v1()
from public,anon,authenticated;
grant execute on function public.expire_national_team_callups_v1()
to service_role;
