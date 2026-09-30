-- National Association UX support: overview dashboard data, private Team Chat and permanent history.

create table if not exists public.national_association_chat_messages (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  membership_id uuid not null references public.national_association_memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  game_date date not null default public.get_current_game_date_date(),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists national_association_chat_messages_assoc_idx
  on public.national_association_chat_messages(association_id, created_at desc);

alter table public.national_association_chat_messages enable row level security;
revoke all on table public.national_association_chat_messages from public,anon,authenticated;

create table if not exists public.national_association_chat_presence (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  membership_id uuid not null references public.national_association_memberships(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid references public.clubs(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(association_id,user_id)
);

create index if not exists national_association_chat_presence_active_idx
  on public.national_association_chat_presence(association_id,last_active_at desc);

alter table public.national_association_chat_presence enable row level security;
revoke all on table public.national_association_chat_presence from public,anon,authenticated;

create or replace function private.current_national_association_membership_v1(p_user_id uuid)
returns table(
  membership_id uuid,
  association_id uuid,
  club_id uuid,
  country_code text,
  association_name text
)
language sql
stable
security definer
set search_path=''
as $function$
  select
    m.id,
    m.association_id,
    m.club_id,
    a.country_code,
    a.name
  from public.national_association_memberships m
  join public.national_associations a on a.id=m.association_id
  where m.user_id=p_user_id
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,p_user_id)
  order by m.created_at desc
  limit 1;
$function$;

revoke all on function private.current_national_association_membership_v1(uuid)
from public,anon,authenticated;

create or replace function public.get_my_national_association_chat_v1(
  p_limit integer default 150
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_limit integer:=greatest(1,least(coalesce(p_limit,150),300));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_association_membership_v1(v_uid);

  if v_ctx.membership_id is null then
    return jsonb_build_object(
      'is_member',false,
      'association_id',null,
      'association_name',null,
      'messages','[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'is_member',true,
    'association_id',v_ctx.association_id,
    'association_name',v_ctx.association_name,
    'messages',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at asc)
      from (
        select
          m.id as message_id,
          m.club_id,
          coalesce(c.name,'Association member') as club_name,
          m.game_date,
          m.message,
          m.created_at,
          m.user_id=v_uid as is_mine
        from public.national_association_chat_messages m
        left join public.clubs c on c.id=m.club_id
        where m.association_id=v_ctx.association_id
        order by m.created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

create or replace function public.get_my_national_association_chat_presence_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_my record;
  v_participants jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_association_membership_v1(v_uid);

  if v_ctx.membership_id is null then
    return jsonb_build_object(
      'is_member',false,
      'joined',false,
      'participants','[]'::jsonb
    );
  end if;

  select
    p.joined_at,
    p.last_active_at,
    p.last_active_at+interval '10 minutes' as expires_at
  into v_my
  from public.national_association_chat_presence p
  where p.association_id=v_ctx.association_id
    and p.user_id=v_uid
    and p.last_active_at>now()-interval '10 minutes'
  limit 1;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'user_id',p.user_id,
      'club_id',p.club_id,
      'club_name',coalesce(c.name,'Association member'),
      'joined_at',p.joined_at,
      'last_active_at',p.last_active_at,
      'is_me',p.user_id=v_uid
    )
    order by p.last_active_at desc,coalesce(c.name,'Association member')
  ),'[]'::jsonb)
  into v_participants
  from public.national_association_chat_presence p
  left join public.clubs c on c.id=p.club_id
  where p.association_id=v_ctx.association_id
    and p.last_active_at>now()-interval '10 minutes';

  return jsonb_build_object(
    'is_member',true,
    'joined',v_my.last_active_at is not null,
    'joined_at',v_my.joined_at,
    'last_active_at',v_my.last_active_at,
    'expires_at',v_my.expires_at,
    'timeout_minutes',10,
    'participants',v_participants
  );
end;
$function$;

create or replace function public.join_my_national_association_chat_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_now timestamptz:=now();
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_association_membership_v1(v_uid);

  if v_ctx.membership_id is null then
    raise exception 'National Association membership is required.';
  end if;

  insert into public.national_association_chat_presence(
    association_id,membership_id,user_id,club_id,
    joined_at,last_active_at,updated_at
  )
  values(
    v_ctx.association_id,v_ctx.membership_id,v_uid,v_ctx.club_id,
    v_now,v_now,v_now
  )
  on conflict(association_id,user_id) do update
  set membership_id=excluded.membership_id,
      club_id=excluded.club_id,
      joined_at=v_now,
      last_active_at=v_now,
      updated_at=v_now;

  return jsonb_build_object(
    'joined',true,
    'joined_at',v_now,
    'last_active_at',v_now,
    'expires_at',v_now+interval '10 minutes',
    'timeout_minutes',10
  );
end;
$function$;

create or replace function public.touch_my_national_association_chat_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_now timestamptz:=now();
  v_presence public.national_association_chat_presence%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_association_membership_v1(v_uid);

  if v_ctx.membership_id is null then
    return jsonb_build_object('joined',false,'reason','membership_required');
  end if;

  select * into v_presence
  from public.national_association_chat_presence p
  where p.association_id=v_ctx.association_id
    and p.user_id=v_uid
  limit 1
  for update;

  if not found or v_presence.last_active_at<=v_now-interval '10 minutes' then
    return jsonb_build_object(
      'joined',false,
      'expired',true,
      'timeout_minutes',10
    );
  end if;

  update public.national_association_chat_presence
  set last_active_at=v_now,
      updated_at=v_now
  where id=v_presence.id;

  return jsonb_build_object(
    'joined',true,
    'last_active_at',v_now,
    'expires_at',v_now+interval '10 minutes',
    'timeout_minutes',10
  );
end;
$function$;

create or replace function public.send_national_association_chat_message_v1(
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_presence_id uuid;
  v_id uuid;
  v_message text:=btrim(coalesce(p_message,''));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if char_length(v_message)<1 or char_length(v_message)>1000 then
    raise exception 'Message must contain between 1 and 1000 characters.';
  end if;

  select * into v_ctx
  from private.current_national_association_membership_v1(v_uid);

  if v_ctx.membership_id is null then
    raise exception 'National Association membership is required.';
  end if;

  select p.id into v_presence_id
  from public.national_association_chat_presence p
  where p.association_id=v_ctx.association_id
    and p.user_id=v_uid
    and p.last_active_at>now()-interval '10 minutes'
  limit 1
  for update;

  if v_presence_id is null then
    raise exception 'Your live chat session has expired. Join the chat again before sending a message.';
  end if;

  update public.national_association_chat_presence
  set last_active_at=now(),
      updated_at=now()
  where id=v_presence_id;

  insert into public.national_association_chat_messages(
    association_id,membership_id,user_id,club_id,game_date,message
  )
  values(
    v_ctx.association_id,v_ctx.membership_id,v_uid,v_ctx.club_id,
    public.get_current_game_date_date(),v_message
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.get_my_national_association_overview_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_today date;
  v_squad public.national_team_squads%rowtype;
  v_cycle jsonb:='{}'::jsonb;
  v_nc public.national_championship_editions%rowtype;
  v_active_callups integer:=0;
  v_last_nations_rank integer;
  v_last_nations_points integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    return jsonb_build_object('available',false,'reason','no_active_human_main_club');
  end if;

  select gs.season_number,public.get_current_game_date_date()
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  select * into v_assoc
  from public.national_associations a
  where a.country_code=v_club.country_code
  limit 1;

  if v_assoc.id is null then
    return jsonb_build_object(
      'available',true,
      'association_exists',false,
      'season_number',v_season,
      'current_game_date',v_today,
      'upcoming_events','[]'::jsonb,
      'current_squad',null
    );
  end if;

  select * into v_nc
  from public.national_championship_editions e
  where e.country_code=v_assoc.country_code
    and e.season_number=v_season
  order by e.created_at desc
  limit 1;

  select * into v_squad
  from public.national_team_squads s
  where s.association_id=v_assoc.id
    and s.season_number=v_season
    and s.status in ('confirmed','on_duty','completed')
  order by
    case s.status when 'on_duty' then 0 when 'confirmed' then 1 else 2 end,
    s.updated_at desc
  limit 1;

  select count(*)::integer
  into v_active_callups
  from public.national_team_callups c
  where c.association_id=v_assoc.id
    and c.season_number=v_season
    and c.status in ('pending','accepted','auto_accepted');

  select h.final_rank,h.total_points
  into v_last_nations_rank,v_last_nations_points
  from public.nations_competition_history h
  where h.association_id=v_assoc.id
  order by h.season_number desc,h.created_at desc
  limit 1;

  begin
    v_cycle:=coalesce(public.get_my_current_nations_cycle_v1(),'{}'::jsonb);
  exception when others then
    v_cycle:='{}'::jsonb;
  end;

  return jsonb_build_object(
    'available',true,
    'association_exists',true,
    'association_id',v_assoc.id,
    'season_number',v_season,
    'current_game_date',v_today,
    'stats',jsonb_build_object(
      'member_count',private.national_association_active_member_count_v1(v_assoc.id),
      'active_callups',v_active_callups,
      'selected_riders',coalesce((
        select count(*)::integer
        from public.national_team_squad_members sm
        where sm.squad_id=v_squad.id
      ),0),
      'national_champion',v_nc.champion_name_snapshot,
      'last_world_nations_rank',v_last_nations_rank,
      'last_world_nations_points',v_last_nations_points
    ),
    'national_championship',
      case when v_nc.id is null then null else jsonb_build_object(
        'edition_id',v_nc.id,
        'status',v_nc.status,
        'qualification_date',v_nc.qualification_date,
        'final_date',v_nc.final_date,
        'champion_name',v_nc.champion_name_snapshot
      ) end,
    'nations_cycle',v_cycle,
    'current_squad',
      case when v_squad.id is null then null else jsonb_build_object(
        'squad_id',v_squad.id,
        'cycle_key',v_squad.cycle_key,
        'status',v_squad.status,
        'squad_size',v_squad.squad_size,
        'confirmed_on',v_squad.confirmed_on_game_date,
        'duty_start_date',v_squad.duty_start_date,
        'duty_end_date',v_squad.duty_end_date,
        'members',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',sm.rider_id,
            'rider_name',sm.rider_name_snapshot,
            'club_id',sm.club_id_snapshot,
            'club_name',sm.club_name_snapshot,
            'squad_role',sm.squad_role
          ) order by sm.rider_name_snapshot)
          from public.national_team_squad_members sm
          where sm.squad_id=v_squad.id
        ),'[]'::jsonb)
      ) end,
    'upcoming_events',
      (
        select coalesce(jsonb_agg(event order by event_date,event_order),'[]'::jsonb)
        from (
          select jsonb_build_object(
            'event_type','national_championship_qualification',
            'event_date',v_nc.qualification_date,
            'label','National Championship Qualification',
            'status',v_nc.status
          ) as event,
          v_nc.qualification_date as event_date,
          1 as event_order
          where v_nc.id is not null
            and v_nc.qualification_date is not null
            and v_nc.qualification_date>=v_today

          union all

          select jsonb_build_object(
            'event_type','national_championship_final',
            'event_date',v_nc.final_date,
            'label','National Championship Final',
            'status',v_nc.status
          ),
          v_nc.final_date,
          2
          where v_nc.id is not null
            and v_nc.final_date is not null
            and v_nc.final_date>=v_today

          union all

          select jsonb_build_object(
            'event_type','world_nations_day_1',
            'event_date',nullif(v_cycle->>'day1_date','')::date,
            'label',coalesce(v_cycle->>'round_label','World Nations')||' · Day 1',
            'status',v_cycle->>'group_status'
          ),
          nullif(v_cycle->>'day1_date','')::date,
          3
          where v_cycle->>'state'='active_cycle'
            and nullif(v_cycle->>'day1_date','') is not null
            and nullif(v_cycle->>'day1_date','')::date>=v_today

          union all

          select jsonb_build_object(
            'event_type','world_nations_day_2',
            'event_date',nullif(v_cycle->>'day2_date','')::date,
            'label',coalesce(v_cycle->>'round_label','World Nations')||' · Day 2',
            'status',v_cycle->>'group_status'
          ),
          nullif(v_cycle->>'day2_date','')::date,
          4
          where v_cycle->>'state'='active_cycle'
            and nullif(v_cycle->>'day2_date','') is not null
            and nullif(v_cycle->>'day2_date','')::date>=v_today

          union all

          select jsonb_build_object(
            'event_type','world_nations_day_3',
            'event_date',nullif(v_cycle->>'day3_date','')::date,
            'label',coalesce(v_cycle->>'round_label','World Nations')||' · Day 3',
            'status',v_cycle->>'group_status'
          ),
          nullif(v_cycle->>'day3_date','')::date,
          5
          where v_cycle->>'state'='active_cycle'
            and nullif(v_cycle->>'day3_date','') is not null
            and nullif(v_cycle->>'day3_date','')::date>=v_today
        ) e
      )
  );
end;
$function$;

create or replace function public.get_my_national_association_history_v1(
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_limit integer:=greatest(1,least(coalesce(p_limit,200),500));
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is null then
    return jsonb_build_object('available',false,'reason','no_active_human_main_club','events','[]'::jsonb);
  end if;

  select * into v_assoc
  from public.national_associations a
  where a.country_code=v_club.country_code
  limit 1;

  if v_assoc.id is null then
    return jsonb_build_object('available',true,'association_exists',false,'events','[]'::jsonb);
  end if;

  return jsonb_build_object(
    'available',true,
    'association_exists',true,
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'country_code',v_assoc.country_code,
    'events',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_key',event_key,
          'event_type',event_type,
          'event_date',event_date,
          'season_number',season_number,
          'title',title,
          'details',details
        )
        order by event_date desc nulls last,sort_ts desc,event_key desc
      )
      from (
        select * from (
          select
            'association_created:'||v_assoc.id::text as event_key,
            'association_created'::text as event_type,
            v_assoc.created_on_game_date as event_date,
            null::integer as season_number,
            'Association created'::text as title,
            jsonb_build_object('status','forming') as details,
            v_assoc.created_at as sort_ts

          union all

          select
            'association_activated:'||v_assoc.id::text,
            'association_activated',
            v_assoc.activated_on_game_date,
            null::integer,
            'Association activated',
            jsonb_build_object('status','active'),
            v_assoc.updated_at
          where v_assoc.activated_on_game_date is not null

          union all

          select
            'member_joined:'||m.id::text,
            'member_joined',
            m.joined_on_game_date,
            null::integer,
            'Member joined',
            jsonb_build_object(
              'club_id',m.club_id,
              'club_name',c.name
            ),
            m.created_at
          from public.national_association_memberships m
          left join public.clubs c on c.id=m.club_id
          where m.association_id=v_assoc.id

          union all

          select
            'member_left:'||m.id::text,
            'member_left',
            m.left_on_game_date,
            null::integer,
            'Member left',
            jsonb_build_object(
              'club_id',m.club_id,
              'club_name',c.name
            ),
            m.updated_at
          from public.national_association_memberships m
          left join public.clubs c on c.id=m.club_id
          where m.association_id=v_assoc.id
            and m.left_on_game_date is not null

          union all

          select
            'activation_coin:'||e.id::text,
            'activation_coin_contribution',
            e.game_date,
            null::integer,
            'Activation contribution',
            jsonb_build_object(
              'amount',e.amount,
              'club_id',e.club_id,
              'club_name',c.name
            ),
            e.created_at
          from public.national_association_activation_coin_events e
          left join public.clubs c on c.id=e.club_id
          where e.association_id=v_assoc.id

          union all

          select
            'election_opened:'||e.id::text,
            'coach_election_opened',
            e.registration_open_date,
            e.season_number,
            'National Coach election opened',
            jsonb_build_object(
              'election_kind',e.election_kind,
              'status',e.status,
              'round',e.current_round
            ),
            e.created_at
          from public.national_coach_elections e
          where e.association_id=v_assoc.id

          union all

          select
            'election_completed:'||e.id::text,
            'coach_election_completed',
            e.completed_on_game_date,
            e.season_number,
            'National Coach election completed',
            jsonb_build_object(
              'election_kind',e.election_kind,
              'winning_candidate_id',e.winning_candidate_id
            ),
            e.updated_at
          from public.national_coach_elections e
          where e.association_id=v_assoc.id
            and e.completed_on_game_date is not null

          union all

          select
            'coach_term:'||t.id::text,
            'national_coach_appointed',
            t.term_start_game_date,
            t.season_number,
            'National Coach appointed',
            jsonb_build_object(
              'club_id',t.club_id,
              'club_name',c.name,
              'term_kind',t.term_kind,
              'status',t.status
            ),
            t.created_at
          from public.national_coach_terms t
          left join public.clubs c on c.id=t.club_id
          where t.association_id=v_assoc.id

          union all

          select
            'squad_confirmed:'||s.id::text,
            'national_squad_confirmed',
            s.confirmed_on_game_date,
            s.season_number,
            'National Team squad confirmed',
            jsonb_build_object(
              'cycle_key',s.cycle_key,
              'squad_size',s.squad_size,
              'status',s.status,
              'duty_start_date',s.duty_start_date,
              'duty_end_date',s.duty_end_date
            ),
            s.updated_at
          from public.national_team_squads s
          where s.association_id=v_assoc.id
            and s.confirmed_on_game_date is not null

          union all

          select
            'world_nations_result:'||h.id::text,
            'world_nations_result',
            null::date,
            h.season_number,
            'World Nations season result',
            jsonb_build_object(
              'final_rank',h.final_rank,
              'total_points',h.total_points,
              'was_host',h.was_host
            ),
            h.created_at
          from public.nations_competition_history h
          where h.association_id=v_assoc.id

          union all

          select
            'national_champion:'||rh.id::text,
            'national_champion_crowned',
            e.final_date,
            e.season_number,
            'National Champion crowned',
            jsonb_build_object(
              'rider_id',rh.rider_id,
              'rider_name',rh.rider_name_snapshot,
              'club_name',rh.club_name_snapshot
            ),
            rh.created_at
          from public.national_championship_result_history rh
          join public.national_championship_editions e on e.id=rh.edition_id
          where e.country_code=v_assoc.country_code
            and rh.event_type='final'
            and rh.rank=1
        ) all_events
        order by event_date desc nulls last,sort_ts desc
        limit v_limit
      ) limited_events
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_national_association_chat_v1(integer) from public,anon;
revoke all on function public.get_my_national_association_chat_presence_v1() from public,anon;
revoke all on function public.join_my_national_association_chat_v1() from public,anon;
revoke all on function public.touch_my_national_association_chat_v1() from public,anon;
revoke all on function public.send_national_association_chat_message_v1(text) from public,anon;
revoke all on function public.get_my_national_association_overview_v1() from public,anon;
revoke all on function public.get_my_national_association_history_v1(integer) from public,anon;

grant execute on function public.get_my_national_association_chat_v1(integer) to authenticated;
grant execute on function public.get_my_national_association_chat_presence_v1() to authenticated;
grant execute on function public.join_my_national_association_chat_v1() to authenticated;
grant execute on function public.touch_my_national_association_chat_v1() to authenticated;
grant execute on function public.send_national_association_chat_message_v1(text) to authenticated;
grant execute on function public.get_my_national_association_overview_v1() to authenticated;
grant execute on function public.get_my_national_association_history_v1(integer) to authenticated;
