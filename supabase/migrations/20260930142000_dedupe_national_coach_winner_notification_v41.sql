-- Send exactly one election-completion notification to the winner while
-- keeping the result notification for the other Association members.

create or replace function private.trg_notify_national_coach_election_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_title text;
  v_message text;
  v_type text;
  v_key text;
  v_winner_name text;
  v_winner_user_id uuid;
  v_member record;
begin
  if tg_op='INSERT' and new.status='candidate_registration' then
    v_type:='NATIONAL_COACH_ELECTION_OPEN';
    v_title:='National Coach candidature is open';
    v_message:='Eligible Association members can submit their National Coach candidature before the registration deadline.';
    v_key:='national-coach-election-open:'||new.id::text;
  elsif tg_op='UPDATE'
    and new.status='voting'
    and old.status is distinct from new.status then
    v_type:='NATIONAL_COACH_VOTING_OPEN';
    v_title:='National Coach voting is open';
    v_message:='The first-round National Coach vote is now open. Each eligible Association member has one final vote for this round.';
    v_key:='national-coach-voting-open:'||new.id::text||':'||new.current_round::text;
  elsif tg_op='UPDATE'
    and new.status='runoff'
    and (
      old.status is distinct from new.status
      or old.current_round is distinct from new.current_round
    ) then
    v_type:='NATIONAL_COACH_RUNOFF_OPEN';
    v_title:='National Coach runoff is open';
    v_message:='No unique winner was produced. A new runoff round is open; each eligible member receives one new vote.';
    v_key:='national-coach-runoff-open:'||new.id::text||':'||new.current_round::text;
  elsif tg_op='UPDATE'
    and new.status='completed'
    and old.status is distinct from new.status
    and new.winning_candidate_id is not null then
    select coalesce(cl.name,'The winning manager'),c.user_id
    into v_winner_name,v_winner_user_id
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.id=new.winning_candidate_id;

    -- Other members receive the normal election-result notice.
    for v_member in
      select distinct m.user_id
      from public.national_association_memberships m
      where m.association_id=new.association_id
        and m.status='active'
        and m.user_id<>v_winner_user_id
    loop
      perform public.create_user_game_notification_v1(
        v_member.user_id,
        'NATIONAL_COACH_ELECTED',
        'National Coach elected',
        coalesce(v_winner_name,'The winning manager')||' has been elected National Coach for this season.',
        '/dashboard/national-association/elections',
        jsonb_build_object(
          'election_id',new.id,
          'association_id',new.association_id,
          'season_number',new.season_number,
          'round_number',new.current_round,
          'status',new.status,
          'winning_candidate_id',new.winning_candidate_id
        ),
        'national-coach-elected:'||new.id::text||':'||v_member.user_id::text,
        null
      );
    end loop;

    -- The winner receives one actionable notification. At commit the active
    -- coach term exists, so Squad and Equipment resolve as unlocked.
    if v_winner_user_id is not null then
      perform public.create_user_game_notification_v1(
        v_winner_user_id,
        'NATIONAL_COACH_ELECTED',
        'You are the new National Coach',
        'You won the National Coach election. Squad and Equipment are now unlocked for you.',
        '/dashboard/national-association/squad',
        jsonb_build_object(
          'election_id',new.id,
          'association_id',new.association_id,
          'season_number',new.season_number,
          'winning_candidate_id',new.winning_candidate_id,
          'coach_pages_unlocked',true
        ),
        'national-coach-winner:'||new.id::text,
        null
      );
    end if;

    return new;
  else
    return new;
  end if;

  perform private.notify_national_association_members_v1(
    new.association_id,
    v_type,
    v_title,
    v_message,
    '/dashboard/national-association/elections',
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
