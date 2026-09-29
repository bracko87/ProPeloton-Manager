insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group,default_image_url
)
values
  ('NATIONAL_ASSOCIATION_ACTIVATED','National Association Activated','game','flag',70,true,'races',null),
  ('NATIONAL_COACH_ELECTION_OPEN','National Coach Election Open','game','vote',65,true,'races',null),
  ('NATIONAL_COACH_VOTING_OPEN','National Coach Voting Open','game','vote',75,true,'races',null),
  ('NATIONAL_COACH_RUNOFF_OPEN','National Coach Runoff Open','game','vote',75,true,'races',null),
  ('NATIONAL_COACH_ELECTED','National Coach Elected','game','award',80,true,'races',null),
  ('NATIONAL_TEAM_CALLUP_RECEIVED','National Team Call-up Received','game','flag',85,true,'races',null),
  ('NATIONAL_TEAM_CALLUP_RESPONSE','National Team Call-up Response','game','flag',70,true,'races',null),
  ('NATIONAL_TEAM_SQUAD_CONFIRMED','National Team Squad Confirmed','game','users',80,true,'races',null),
  ('NATIONS_QUALIFICATION_DRAW','Nations Qualification Draw','game','globe',70,true,'races',null),
  ('NATIONS_ADVANCED','Nations Championship Advanced','game','trophy',75,true,'races',null),
  ('NATIONS_ELIMINATED','Nations Championship Eliminated','game','flag',65,true,'races',null),
  ('NATIONS_WORLD_FINAL_QUALIFIED','World Nations Final Qualified','game','trophy',85,true,'races',null),
  ('NATIONS_HOST_SELECTED','World Nations Host Selected','game','map-pin',70,true,'races',null),
  ('NATIONS_CHAMPION','World Nations Champion','game','trophy',95,true,'races',null)
on conflict(code) do update
set name=excluded.name,
    source=excluded.source,
    icon_name=excluded.icon_name,
    priority=excluded.priority,
    is_active=true,
    preference_group=excluded.preference_group;

create or replace function private.notify_national_association_members_v1(
  p_association_id uuid,
  p_type_code text,
  p_title text,
  p_message text,
  p_action_url text,
  p_payload jsonb,
  p_event_key_prefix text
)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member record;
  v_count integer:=0;
begin
  if p_association_id is null then return 0; end if;

  for v_member in
    select distinct m.user_id
    from public.national_association_memberships m
    where m.association_id=p_association_id
      and m.status='active'
  loop
    perform public.create_user_game_notification_v1(
      v_member.user_id,
      p_type_code,
      p_title,
      p_message,
      p_action_url,
      coalesce(p_payload,'{}'::jsonb)||jsonb_build_object('association_id',p_association_id),
      case when p_event_key_prefix is null then null
        else p_event_key_prefix||':'||v_member.user_id::text end,
      null
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

revoke all on function private.notify_national_association_members_v1(uuid,text,text,text,text,jsonb,text)
from public,anon,authenticated;

create or replace function private.trg_notify_national_association_status_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_country_name text;
begin
  if new.status='active'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    select coalesce(c.name,new.country_code)
    into v_country_name
    from public.countries c
    where upper(c.code)=upper(new.country_code)
    limit 1;

    perform private.notify_national_association_members_v1(
      new.id,
      'NATIONAL_ASSOCIATION_ACTIVATED',
      coalesce(v_country_name,new.country_code)||' National Association activated',
      'Your National Association is active. Members can now participate in the National Coach election and the World Nations Championship system.',
      '/dashboard/national-association',
      jsonb_build_object('country_code',new.country_code,'association_name',new.name),
      'national-association-activated:'||new.id::text
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notify_national_association_status_v1 on public.national_associations;
create trigger trg_notify_national_association_status_v1
after insert or update of status
on public.national_associations
for each row execute function private.trg_notify_national_association_status_v1();

create or replace function private.trg_notify_national_coach_election_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_title text;
  v_message text;
  v_type text;
  v_key text;
  v_winner_name text;
begin
  if tg_op='INSERT' and new.status='candidate_registration' then
    v_type:='NATIONAL_COACH_ELECTION_OPEN';
    v_title:='National Coach candidature is open';
    v_message:='Eligible Association members can submit their National Coach candidature before the registration deadline.';
    v_key:='national-coach-election-open:'||new.id::text;
  elsif tg_op='UPDATE' and new.status='voting' and old.status is distinct from new.status then
    v_type:='NATIONAL_COACH_VOTING_OPEN';
    v_title:='National Coach voting is open';
    v_message:='The first-round National Coach vote is now open. Each eligible Association member has one final vote for this round.';
    v_key:='national-coach-voting-open:'||new.id::text||':'||new.current_round::text;
  elsif tg_op='UPDATE' and new.status='runoff'
    and (old.status is distinct from new.status or old.current_round is distinct from new.current_round) then
    v_type:='NATIONAL_COACH_RUNOFF_OPEN';
    v_title:='National Coach runoff is open';
    v_message:='No unique winner was produced. A new runoff round is open; each eligible member receives one new vote.';
    v_key:='national-coach-runoff-open:'||new.id::text||':'||new.current_round::text;
  elsif tg_op='UPDATE' and new.status='completed' and old.status is distinct from new.status
    and new.winning_candidate_id is not null then
    select coalesce(cl.name,'The winning manager')
    into v_winner_name
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.id=new.winning_candidate_id;

    v_type:='NATIONAL_COACH_ELECTED';
    v_title:='National Coach elected';
    v_message:=coalesce(v_winner_name,'The winning manager')||' has been elected National Coach for this season.';
    v_key:='national-coach-elected:'||new.id::text;
  else
    return new;
  end if;

  perform private.notify_national_association_members_v1(
    new.association_id,
    v_type,
    v_title,
    v_message,
    '/dashboard/national-association',
    jsonb_build_object(
      'election_id',new.id,
      'season_number',new.season_number,
      'round_number',new.current_round,
      'status',new.status,
      'registration_close_date',new.registration_close_date,
      'round_close_date',new.current_round_close_date,
      'winning_candidate_id',new.winning_candidate_id
    ),
    v_key
  );
  return new;
end;
$function$;

drop trigger if exists trg_notify_national_coach_election_v1 on public.national_coach_elections;
create trigger trg_notify_national_coach_election_v1
after insert or update of status,current_round,winning_candidate_id
on public.national_coach_elections
for each row execute function private.trg_notify_national_coach_election_v1();

create or replace function private.trg_notify_national_team_callup_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_association_name text;
  v_coach_user_id uuid;
begin
  select a.name into v_association_name
  from public.national_associations a
  where a.id=new.association_id;

  if tg_op='INSERT' and new.status='pending' and new.club_owner_user_id_snapshot is not null then
    perform public.create_user_game_notification_v1(
      new.club_owner_user_id_snapshot,
      'NATIONAL_TEAM_CALLUP_RECEIVED',
      new.rider_name_snapshot||' called up for the National Team',
      coalesce(v_association_name,'The National Association')||
        ' has called up '||new.rider_name_snapshot||
        '. Accept or decline before '||coalesce(new.response_deadline::text,'the response deadline')||'.',
      '/dashboard/national-association',
      jsonb_build_object(
        'callup_id',new.id,'association_id',new.association_id,
        'association_name',v_association_name,'rider_id',new.rider_id,
        'rider_name',new.rider_name_snapshot,'club_id',new.club_id_snapshot,
        'club_name',new.club_name_snapshot,'response_deadline',new.response_deadline
      ),
      'national-team-callup:'||new.id::text,
      null
    );
  elsif tg_op='UPDATE' and old.status='pending' and new.status in ('accepted','declined','expired') then
    select t.user_id into v_coach_user_id
    from public.national_coach_terms t
    where t.association_id=new.association_id
      and t.season_number=new.season_number
      and t.status='active'
    order by t.created_at desc
    limit 1;

    if v_coach_user_id is not null then
      perform public.create_user_game_notification_v1(
        v_coach_user_id,
        'NATIONAL_TEAM_CALLUP_RESPONSE',
        new.rider_name_snapshot||' call-up: '||replace(initcap(new.status),'_',' '),
        new.rider_name_snapshot||'''s National Team call-up is now '||replace(new.status,'_',' ')||'.',
        '/dashboard/national-association',
        jsonb_build_object(
          'callup_id',new.id,'association_id',new.association_id,
          'rider_id',new.rider_id,'rider_name',new.rider_name_snapshot,
          'status',new.status,'responded_on',new.responded_on_game_date
        ),
        'national-team-callup-response:'||new.id::text||':'||new.status,
        null
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notify_national_team_callup_v1 on public.national_team_callups;
create trigger trg_notify_national_team_callup_v1
after insert or update of status
on public.national_team_callups
for each row execute function private.trg_notify_national_team_callup_v1();

create or replace function private.trg_notify_national_team_squad_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_owner record;
begin
  if new.status='confirmed'
     and (tg_op='INSERT' or old.status is distinct from new.status
          or old.confirmed_on_game_date is distinct from new.confirmed_on_game_date) then
    for v_owner in
      select distinct c.club_owner_user_id_snapshot as user_id
      from public.national_team_squad_members sm
      join public.national_team_callups c on c.id=sm.callup_id
      where sm.squad_id=new.id
        and c.club_owner_user_id_snapshot is not null
    loop
      perform public.create_user_game_notification_v1(
        v_owner.user_id,
        'NATIONAL_TEAM_SQUAD_CONFIRMED',
        'National Team squad confirmed',
        'The final 10-rider National Team squad has been confirmed. Selected riders will enter National Duty for the competition window.',
        '/dashboard/national-association',
        jsonb_build_object(
          'squad_id',new.id,'association_id',new.association_id,
          'season_number',new.season_number,'cycle_key',new.cycle_key,
          'squad_size',new.squad_size
        ),
        'national-team-squad-confirmed:'||new.id::text||':'||v_owner.user_id::text,
        null
      );
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notify_national_team_squad_v1 on public.national_team_squads;
create trigger trg_notify_national_team_squad_v1
after insert or update of status,confirmed_on_game_date
on public.national_team_squads
for each row execute function private.trg_notify_national_team_squad_v1();

create or replace function private.trg_notify_nations_round_draw_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_item record;
begin
  if new.status='drawn' and (tg_op='INSERT' or old.status is distinct from new.status) then
    for v_item in
      select distinct ce.association_id,ce.country_code,g.group_label,g.planned_advance_count
      from public.nations_competition_groups g
      join public.nations_group_entries nge on nge.group_id=g.id
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      where g.round_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_item.association_id,
        'NATIONS_QUALIFICATION_DRAW',
        new.round_label||' draw confirmed',
        v_item.country_code||' has been drawn into '||v_item.group_label||
          '. '||v_item.planned_advance_count||' nation(s) advance from this group.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'round_id',new.id,'round_label',new.round_label,'round_type',new.round_type,
          'group_label',v_item.group_label,'country_code',v_item.country_code,
          'advance_count',v_item.planned_advance_count
        ),
        'nations-draw:'||new.id::text||':'||v_item.association_id::text
      );
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notify_nations_round_draw_v1 on public.nations_competition_rounds;
create trigger trg_notify_nations_round_draw_v1
after update of status
on public.nations_competition_rounds
for each row execute function private.trg_notify_nations_round_draw_v1();

create or replace function private.trg_notify_nations_group_entry_outcome_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_round record;
  v_entry record;
  v_type text;
  v_title text;
  v_message text;
begin
  if tg_op<>'UPDATE' or old.status is not distinct from new.status
     or new.status not in ('advanced','eliminated') then
    return new;
  end if;

  select r.round_type,r.round_label,g.group_label
  into v_round
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  where g.id=new.group_id;

  if v_round.round_type='world_final' then return new; end if;

  select ce.association_id,ce.country_code,a.name as association_name
  into v_entry
  from public.nations_competition_entries ce
  join public.national_associations a on a.id=ce.association_id
  where ce.id=new.competition_entry_id;

  if new.status='advanced' and v_round.round_type='final_qualification' then
    v_type:='NATIONS_WORLD_FINAL_QUALIFIED';
    v_title:='Qualified for the World Nations Final';
    v_message:=v_entry.country_code||' has qualified for the 16-nation World Nations Final.';
  elsif new.status='advanced' then
    v_type:='NATIONS_ADVANCED';
    v_title:='Advanced in the World Nations Championship';
    v_message:=v_entry.country_code||' has advanced from '||v_round.round_label||'.';
  else
    v_type:='NATIONS_ELIMINATED';
    v_title:='World Nations Championship run ended';
    v_message:=v_entry.country_code||' has been eliminated in '||v_round.round_label||'.';
  end if;

  perform private.notify_national_association_members_v1(
    v_entry.association_id,v_type,v_title,v_message,'/dashboard/world-nations',
    jsonb_build_object(
      'group_entry_id',new.id,'round_type',v_round.round_type,
      'round_label',v_round.round_label,'group_label',v_round.group_label,
      'country_code',v_entry.country_code,'final_group_rank',new.final_group_rank,
      'total_points',new.total_points,'ttt_points',new.ttt_points,
      'flat_points',new.flat_points,'mountain_points',new.mountain_points
    ),
    'nations-outcome:'||new.id::text||':'||new.status
  );
  return new;
end;
$function$;

drop trigger if exists trg_notify_nations_group_entry_outcome_v1 on public.nations_group_entries;
create trigger trg_notify_nations_group_entry_outcome_v1
after update of status
on public.nations_group_entries
for each row execute function private.trg_notify_nations_group_entry_outcome_v1();

create or replace function private.trg_notify_nations_edition_milestone_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_assoc record;
begin
  if new.host_association_id is not null
     and (tg_op='INSERT' or old.host_association_id is distinct from new.host_association_id) then
    for v_assoc in
      select distinct e.association_id
      from public.nations_competition_entries e
      where e.edition_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_assoc.association_id,
        'NATIONS_HOST_SELECTED',
        'World Nations Final host selected',
        coalesce(new.host_country_code,'The selected nation')||
          ' will host this season''s World Nations Final.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'edition_id',new.id,'season_number',new.season_number,
          'host_association_id',new.host_association_id,'host_country_code',new.host_country_code
        ),
        'nations-host-selected:'||new.id::text||':'||v_assoc.association_id::text
      );
    end loop;
  end if;

  if new.champion_association_id is not null
     and (tg_op='INSERT' or old.champion_association_id is distinct from new.champion_association_id) then
    for v_assoc in
      select distinct e.association_id
      from public.nations_competition_entries e
      where e.edition_id=new.id
    loop
      perform private.notify_national_association_members_v1(
        v_assoc.association_id,
        'NATIONS_CHAMPION',
        'World Nations Champion',
        coalesce(new.champion_country_code,'The winning nation')||
          ' has won the World Nations Championship.',
        '/dashboard/world-nations',
        jsonb_build_object(
          'edition_id',new.id,'season_number',new.season_number,
          'champion_association_id',new.champion_association_id,
          'champion_country_code',new.champion_country_code
        ),
        'nations-champion:'||new.id::text||':'||v_assoc.association_id::text
      );
    end loop;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_notify_nations_edition_milestone_v1 on public.nations_competition_editions;
create trigger trg_notify_nations_edition_milestone_v1
after insert or update of host_association_id,champion_association_id
on public.nations_competition_editions
for each row execute function private.trg_notify_nations_edition_milestone_v1();
