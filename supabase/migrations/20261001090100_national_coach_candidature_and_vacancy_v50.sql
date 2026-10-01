-- Immutable candidature submission + withdrawal/re-registration and
-- National Coach resignation/inactivity vacancy handling.

alter table public.national_coach_candidates
  drop constraint if exists national_coach_candidates_election_id_user_id_key;

drop index if exists public.national_coach_candidates_one_active_user_idx;
create unique index national_coach_candidates_one_active_user_idx
  on public.national_coach_candidates(election_id,user_id)
  where status='active';

alter table public.national_coach_elections
  drop constraint if exists national_coach_elections_association_id_season_number_elect_key;

drop index if exists public.national_coach_elections_one_open_assoc_idx;
create unique index national_coach_elections_one_open_assoc_idx
  on public.national_coach_elections(association_id)
  where status in ('candidate_registration','voting','runoff');

CREATE OR REPLACE FUNCTION public.register_national_coach_candidate_v2(p_election_id uuid, p_first_name text, p_last_name text, p_manifesto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_first text:=btrim(coalesce(p_first_name,'')); v_last text:=btrim(coalesce(p_last_name,''));
  v_manifesto text:=btrim(coalesce(p_manifesto,'')); v_candidate_id uuid;
  v_registration_allowed boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  if char_length(v_first)<2 or char_length(v_first)>40 then raise exception 'First name must contain between 2 and 40 characters.'; end if;
  if char_length(v_last)<2 or char_length(v_last)>40 then raise exception 'Last name must contain between 2 and 40 characters.'; end if;
  if char_length(v_manifesto)<10 or char_length(v_manifesto)>1000 then raise exception 'Manifesto must contain between 10 and 1000 characters.'; end if;
  select * into v_e from public.national_coach_elections where id=p_election_id for update;
  if v_e.id is null then raise exception 'Election not found.'; end if;
  if v_e.status='candidate_registration' and v_today>=v_e.registration_open_date and v_today<v_e.registration_close_date then
    v_registration_allowed:=true;
  elsif v_e.status='runoff' and v_e.runoff_registration_open and v_e.current_round_close_date is not null
        and v_today>=v_e.current_round_open_date and v_today<v_e.current_round_close_date then
    v_registration_allowed:=true;
  end if;
  if not v_registration_allowed then raise exception 'Candidate registration is closed.'; end if;
  if exists(select 1 from public.national_coach_candidates where election_id=v_e.id and user_id=v_uid and status='active') then
    raise exception 'Your candidature is already submitted. Withdraw it before creating a new candidature.';
  end if;
  select * into v_membership from public.national_association_memberships
  where association_id=v_e.association_id and user_id=v_uid and status='active' and coach_eligible=true limit 1;
  if v_membership.id is null or not private.national_association_member_is_eligible_v1(v_e.association_id,v_uid) then
    raise exception 'You are not eligible to stand in this National Coach election.';
  end if;
  insert into public.national_coach_candidates(
    election_id,membership_id,user_id,club_id,first_name,last_name,manifesto,status,registered_on_game_date
  ) values(v_e.id,v_membership.id,v_uid,v_membership.club_id,v_first,v_last,v_manifesto,'active',v_today)
  returning id into v_candidate_id;
  update public.profiles set first_name=coalesce(nullif(first_name,''),v_first),
    last_name=coalesce(nullif(last_name,''),v_last),updated_at=now() where id=v_uid;
  if v_e.status='runoff' and v_e.runoff_registration_open then
    insert into public.national_coach_runoff_candidates(election_id,round_number,candidate_id)
    values(v_e.id,v_e.current_round,v_candidate_id) on conflict do nothing;
  end if;
  return v_candidate_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.withdraw_national_coach_candidate_v1(p_election_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_today date:=public.get_current_game_date_date();
  v_e public.national_coach_elections%rowtype; v_candidate_id uuid; v_allowed boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_e from public.national_coach_elections where id=p_election_id for update;
  if v_e.id is null then raise exception 'Election not found.'; end if;
  if v_e.status='candidate_registration' and v_today>=v_e.registration_open_date and v_today<v_e.registration_close_date then
    v_allowed:=true;
  elsif v_e.status='runoff' and v_e.runoff_registration_open
        and v_today>=v_e.current_round_open_date and v_today<v_e.current_round_close_date then
    v_allowed:=true;
  end if;
  if not v_allowed then raise exception 'Candidature can only be withdrawn while candidate registration is open.'; end if;
  select id into v_candidate_id from public.national_coach_candidates
  where election_id=v_e.id and user_id=v_uid and status='active'
  order by created_at desc limit 1 for update;
  if v_candidate_id is null then raise exception 'No active candidature found.'; end if;
  update public.national_coach_candidates set status='withdrawn',
    withdrawn_on_game_date=v_today,updated_at=now() where id=v_candidate_id;
  delete from public.national_coach_runoff_candidates where candidate_id=v_candidate_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_national_coach_candidate_form_v1(p_election_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_candidate public.national_coach_candidates%rowtype; v_profile public.profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select * into v_candidate from public.national_coach_candidates
  where election_id=p_election_id and user_id=v_uid and status='active'
  order by created_at desc limit 1;
  select * into v_profile from public.profiles where id=v_uid;
  return jsonb_build_object(
    'first_name',coalesce(nullif(v_candidate.first_name,''),nullif(v_profile.first_name,''),''),
    'last_name',coalesce(nullif(v_candidate.last_name,''),nullif(v_profile.last_name,''),''),
    'manifesto',coalesce(v_candidate.manifesto,''),
    'candidate_id',v_candidate.id,'locked',v_candidate.id is not null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_national_coach_candidate_profiles_v1(p_election_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'candidate_id',c.id,'user_id',c.user_id,'club_id',c.club_id,'club_name',cl.name,
    'first_name',coalesce(nullif(c.first_name,''),nullif(p.first_name,'')),
    'last_name',coalesce(nullif(c.last_name,''),nullif(p.last_name,'')),
    'manifesto',c.manifesto,'status',c.status,'registered_on',c.registered_on_game_date,
    'is_me',c.user_id=auth.uid()
  ) order by c.registered_on_game_date,c.created_at),'[]'::jsonb)
  from public.national_coach_candidates c
  join public.national_coach_elections e on e.id=c.election_id
  left join public.clubs cl on cl.id=c.club_id
  left join public.profiles p on p.id=c.user_id
  where c.election_id=p_election_id and c.status='active'
    and exists(select 1 from public.national_association_memberships m
      where m.association_id=e.association_id and m.user_id=auth.uid() and m.status='active');
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_national_association_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_assoc public.national_associations%rowtype;
  v_membership public.national_association_memberships%rowtype;
  v_member_count integer:=0;
  v_minimum integer:=5;
  v_activation_target integer:=50;
  v_activation_total integer:=0;
  v_my_activation_total integer:=0;
  v_coin_balance integer:=0;
  v_election public.national_coach_elections%rowtype;
  v_term public.national_coach_terms%rowtype;
  v_candidates jsonb:='[]'::jsonb;
  v_my_vote_candidate_id uuid;
  v_my_candidate_id uuid;
  v_current_season integer;
  v_current_game_date date;
  v_renewal_target integer:=30;
  v_renewal_open_month integer:=1;
  v_renewal_open_day integer:=1;
  v_renewal_deadline_month integer:=2;
  v_renewal_deadline_day integer:=1;
  v_renewal_target_season integer;
  v_renewal_total integer:=0;
  v_my_renewal_total integer:=0;
  v_renewal_open_date date;
  v_renewal_deadline date;
  v_valid_until date;
  v_renewal_window_open boolean:=false;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select season_number::integer,public.get_current_game_date_date()
  into v_current_season,v_current_game_date
  from public.game_state
  where id=true;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  select
    minimum_active_members::integer,
    activation_coin_target::integer,
    renewal_coin_target::integer,
    renewal_window_month::integer,
    renewal_window_day::integer,
    renewal_deadline_month::integer,
    renewal_deadline_day::integer
  into
    v_minimum,v_activation_target,v_renewal_target,
    v_renewal_open_month,v_renewal_open_day,
    v_renewal_deadline_month,v_renewal_deadline_day
  from public.national_association_config
  where id=true;

  select coalesce(w.balance,0)
  into v_coin_balance
  from public.user_wallets w
  where w.user_id=v_uid;

  v_coin_balance:=coalesce(v_coin_balance,0);

  if v_club.club_id is null then
    return jsonb_build_object('eligible',false,'reason','no_active_human_main_club');
  end if;

  select * into v_assoc
  from public.national_associations
  where country_code=v_club.country_code
  limit 1;

  if v_assoc.id is null then
    return jsonb_build_object(
      'eligible',true,
      'country_code',v_club.country_code,
      'club_id',v_club.club_id,
      'club_name',v_club.club_name,
      'association_exists',false,
      'is_member',false,
      'minimum_members',coalesce(v_minimum,5),
      'activation_coin_target',coalesce(v_activation_target,50),
      'activation_coin_contributed',0,
      'activation_coin_remaining',coalesce(v_activation_target,50),
      'my_activation_coin_contribution',0,
      'coin_balance',v_coin_balance,
      'renewal_coin_target',coalesce(v_renewal_target,30),
      'has_treasury',false
    );
  end if;

  select * into v_membership
  from public.national_association_memberships
  where association_id=v_assoc.id
    and user_id=v_uid
    and status='active'
  limit 1;

  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  select coalesce(sum(e.amount),0)::integer
  into v_activation_total
  from public.national_association_activation_coin_events e
  where e.association_id=v_assoc.id;

  select coalesce(sum(e.amount),0)::integer
  into v_my_activation_total
  from public.national_association_activation_coin_events e
  where e.association_id=v_assoc.id
    and e.user_id=v_uid;

  if v_assoc.activated_on_game_date is not null then
    v_renewal_target_season:=greatest(
      coalesce(v_assoc.renewal_paid_through_season,v_current_season)+1,
      v_current_season
    );

    if coalesce(v_assoc.renewal_paid_through_season,0)>=v_current_season then
      v_renewal_target_season:=v_assoc.renewal_paid_through_season+1;
    end if;

    v_renewal_open_date:=public.game_date_from_parts(
      v_renewal_target_season,
      coalesce(v_renewal_open_month,1),
      coalesce(v_renewal_open_day,1)
    );
    v_renewal_deadline:=public.game_date_from_parts(
      v_renewal_target_season,
      coalesce(v_renewal_deadline_month,2),
      coalesce(v_renewal_deadline_day,1)
    );
    v_valid_until:=public.game_date_from_parts(
      coalesce(v_assoc.renewal_paid_through_season,v_current_season)+1,
      coalesce(v_renewal_deadline_month,2),
      coalesce(v_renewal_deadline_day,1)
    );

    select coalesce(sum(e.amount),0)::integer
    into v_renewal_total
    from public.national_association_renewal_coin_events e
    where e.association_id=v_assoc.id
      and e.season_number=v_renewal_target_season;

    select coalesce(sum(e.amount),0)::integer
    into v_my_renewal_total
    from public.national_association_renewal_coin_events e
    where e.association_id=v_assoc.id
      and e.season_number=v_renewal_target_season
      and e.user_id=v_uid;

    v_renewal_window_open:=
      v_current_season=v_renewal_target_season
      and v_current_game_date>=v_renewal_open_date
      and v_current_game_date<v_renewal_deadline;
  end if;

  select * into v_election
  from public.national_coach_elections
  where association_id=v_assoc.id
    and status in ('candidate_registration','voting','runoff','completed')
  order by season_number desc,created_at desc
  limit 1;

  select * into v_term
  from public.national_coach_terms
  where association_id=v_assoc.id
    and status='active'
  order by season_number desc,created_at desc
  limit 1;

  if v_election.id is not null then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'candidate_id',c.id,
          'club_id',c.club_id,
          'club_name',cl.name,
          'manifesto',c.manifesto,
          'status',c.status,
          'is_me',c.user_id=v_uid,
          'in_current_round',
            case
              when v_election.status='runoff' then exists(
                select 1
                from public.national_coach_runoff_candidates rc
                where rc.election_id=v_election.id
                  and rc.round_number=v_election.current_round
                  and rc.candidate_id=c.id
              )
              else c.status='active'
            end
        )
        order by c.registered_on_game_date,c.created_at
      ),
      '[]'::jsonb
    )
    into v_candidates
    from public.national_coach_candidates c
    left join public.clubs cl on cl.id=c.club_id
    where c.election_id=v_election.id
      and c.status='active';

    select c.id into v_my_candidate_id
    from public.national_coach_candidates c
    where c.election_id=v_election.id
      and c.user_id=v_uid
      and c.status='active'
    limit 1;

    select v.candidate_id into v_my_vote_candidate_id
    from public.national_coach_votes v
    where v.election_id=v_election.id
      and v.round_number=v_election.current_round
      and v.voter_user_id=v_uid
    limit 1;
  end if;

  return jsonb_build_object(
    'eligible',true,
    'country_code',v_assoc.country_code,
    'club_id',v_club.club_id,
    'club_name',v_club.club_name,
    'association_exists',true,
    'association_id',v_assoc.id,
    'association_name',v_assoc.name,
    'association_status',v_assoc.status,
    'is_member',v_membership.id is not null,
    'membership_id',v_membership.id,
    'member_count',v_member_count,
    'minimum_members',coalesce(v_minimum,5),
    'activation_coin_target',coalesce(v_activation_target,50),
    'activation_coin_contributed',least(v_activation_total,coalesce(v_activation_target,50)),
    'activation_coin_remaining',greatest(coalesce(v_activation_target,50)-v_activation_total,0),
    'my_activation_coin_contribution',v_my_activation_total,
    'coin_balance',v_coin_balance,
    'activation_ready',
      v_member_count>=coalesce(v_minimum,5)
      and v_activation_total>=coalesce(v_activation_target,50),
    'renewal_coin_target',coalesce(v_renewal_target,30),
    'renewal_paid_through_season',v_assoc.renewal_paid_through_season,
    'renewal_target_season',v_renewal_target_season,
    'renewal_coin_contributed',least(v_renewal_total,coalesce(v_renewal_target,30)),
    'renewal_coin_remaining',greatest(coalesce(v_renewal_target,30)-v_renewal_total,0),
    'my_renewal_coin_contribution',v_my_renewal_total,
    'renewal_window_open',v_renewal_window_open,
    'renewal_window_opens_on',v_renewal_open_date,
    'renewal_deadline',v_renewal_deadline,
    'association_valid_until',v_valid_until,
    'has_treasury',false,
    'coach',
      case
        when v_term.id is null then null
        else jsonb_build_object(
          'term_id',v_term.id,
          'user_id',v_term.user_id,
          'club_id',v_term.club_id,
          'club_name',(select name from public.clubs where id=v_term.club_id),
          'season_number',v_term.season_number,
          'term_kind',v_term.term_kind,
          'starts_on',v_term.term_start_game_date,
          'ends_on',v_term.term_end_game_date
        )
      end,
    'election',
      case
        when v_election.id is null then null
        else jsonb_build_object(
          'id',v_election.id,
          'season_number',v_election.season_number,
          'kind',v_election.election_kind,
          'status',v_election.status,
          'registration_open_date',v_election.registration_open_date,
          'registration_close_date',v_election.registration_close_date,
          'round1_open_date',v_election.round1_open_date,
          'round1_close_date',v_election.round1_close_date,
          'current_round',v_election.current_round,
          'current_round_open_date',v_election.current_round_open_date,
          'current_round_close_date',v_election.current_round_close_date,
          'runoff_registration_open',v_election.runoff_registration_open,
          'winning_candidate_id',v_election.winning_candidate_id,
          'my_candidate_id',v_my_candidate_id,
          'my_vote_candidate_id',v_my_vote_candidate_id,
          'candidates',v_candidates
        )
      end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_national_coach_election_v1(p_association_id uuid, p_season_number integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc public.national_associations%rowtype; v_cfg public.national_association_config%rowtype;
  v_current_season integer; v_season integer; v_today date:=public.get_current_game_date_date();
  v_existing uuid; v_any_previous boolean:=false; v_kind text; v_reason text;
  v_registration_open date; v_registration_close date; v_round1_open date; v_round1_close date; v_id uuid;
begin
  select * into v_assoc from public.national_associations where id=p_association_id;
  if v_assoc.id is null or v_assoc.status<>'active' then return null; end if;
  select season_number into v_current_season from public.game_state where id=true;
  if v_current_season is null then raise exception 'Game season is unavailable.'; end if;
  v_season:=coalesce(p_season_number,v_current_season);
  if v_season<>v_current_season then raise exception 'National Coach elections can only be created for the current season.'; end if;

  select id into v_existing from public.national_coach_elections
  where association_id=p_association_id and season_number=v_season
    and status in ('candidate_registration','voting','runoff')
  order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  perform public.carry_forward_national_coach_v1(p_association_id,v_season);

  if exists(select 1 from public.national_coach_terms t
    where t.association_id=p_association_id and t.season_number=v_season and t.status='active'
      and private.national_association_member_is_eligible_v1(t.association_id,t.user_id)) then
    select e.id into v_existing from public.national_coach_elections e
    where e.association_id=p_association_id and e.season_number=v_season and e.status='completed'
    order by e.completed_on_game_date desc nulls last,e.created_at desc limit 1;
    return v_existing;
  end if;

  select * into v_cfg from public.national_association_config where id=true;
  select exists(select 1 from public.national_coach_elections where association_id=p_association_id) into v_any_previous;

  if not v_any_previous then
    v_kind:='activation'; v_reason:='first_association_coach_election'; v_registration_open:=v_today;
    v_registration_close:=v_today+coalesce(v_cfg.activation_registration_days,10);
    v_round1_open:=v_registration_close; v_round1_close:=v_round1_open+coalesce(v_cfg.activation_voting_days,10);
  else
    v_registration_open:=public.game_date_from_parts(v_season,v_cfg.annual_registration_start_month,v_cfg.annual_registration_start_day);
    v_registration_close:=public.game_date_from_parts(v_season,v_cfg.annual_registration_close_month,v_cfg.annual_registration_close_day);
    v_round1_open:=v_registration_close;
    v_round1_close:=public.game_date_from_parts(v_season,v_cfg.annual_round1_close_month,v_cfg.annual_round1_close_day);
    if v_today<v_registration_close and not exists(select 1 from public.national_coach_elections
      where association_id=p_association_id and season_number=v_season and election_kind='annual') then
      v_kind:='annual'; v_reason:='annual_january_election';
    else
      v_kind:='replacement'; v_reason:='missing_coach_recovery'; v_registration_open:=v_today;
      v_registration_close:=v_today+coalesce(v_cfg.activation_registration_days,10);
      v_round1_open:=v_registration_close; v_round1_close:=v_round1_open+coalesce(v_cfg.activation_voting_days,10);
    end if;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,current_round,current_round_open_date,current_round_close_date,runoff_registration_open
  ) values(p_association_id,v_season,v_kind,v_reason,'candidate_registration',v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,1,v_round1_open,v_round1_close,false)
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_coach_vacancies_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date(); v_season integer; v_term record; v_removed integer:=0;
  v_election_id uuid; v_reason text;
begin
  select season_number into v_season from public.game_state where id=true;
  for v_term in
    select t.id,t.association_id,t.user_id,t.club_id,c.name club_name,c.inactivity_status,m.id membership_id
    from public.national_coach_terms t join public.clubs c on c.id=t.club_id
    left join public.national_association_memberships m on m.id=t.membership_id
    where t.status='active' and t.season_number=v_season
      and not private.national_association_member_is_eligible_v1(t.association_id,t.user_id)
  loop
    v_reason:=case when coalesce(v_term.inactivity_status,'active') in ('inactive','season_end_removal_pending')
      then 'coach_club_inactive_30_days' else 'coach_no_longer_eligible' end;
    update public.national_coach_terms set status='ineligible',
      term_end_game_date=greatest(term_start_game_date,v_today),updated_at=now()
      where id=v_term.id and status='active';
    if coalesce(v_term.inactivity_status,'active') in ('inactive','season_end_removal_pending') then
      update public.national_association_memberships set status='left',left_on_game_date=v_today,updated_at=now()
      where id=v_term.membership_id and status='active';
    end if;
    perform private.notify_national_association_members_v1(
      v_term.association_id,'NATIONAL_COACH_POSITION_VACANT','National Coach position is vacant',
      case when v_reason='coach_club_inactive_30_days'
        then coalesce(v_term.club_name,'The National Coach club')||
          ' has been inactive for at least 30 days. The National Coach has been removed and a replacement election will start.'
        else 'The National Coach is no longer eligible. A replacement election will start.' end,
      '/dashboard/national-association/elections',
      jsonb_build_object('reason',v_reason,'previous_coach_user_id',v_term.user_id,
        'previous_coach_club_id',v_term.club_id,'season_number',v_season),
      'national-coach-vacant:'||v_term.id::text
    );
    v_election_id:=public.ensure_national_coach_election_v1(v_term.association_id,v_season);
    v_removed:=v_removed+1;
  end loop;
  return jsonb_build_object('season_number',v_season,'removed_ineligible_coaches',v_removed);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resign_national_coach_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid(); v_today date:=public.get_current_game_date_date(); v_season integer;
  v_term public.national_coach_terms%rowtype; v_club_name text; v_election_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required.'; end if;
  select season_number into v_season from public.game_state where id=true;
  select * into v_term from public.national_coach_terms
  where user_id=v_uid and season_number=v_season and status='active'
  order by created_at desc limit 1 for update;
  if v_term.id is null then raise exception 'You are not the active National Coach.'; end if;
  select name into v_club_name from public.clubs where id=v_term.club_id;
  update public.national_coach_terms set status='resigned',
    term_end_game_date=greatest(term_start_game_date,v_today),updated_at=now() where id=v_term.id;
  perform private.notify_national_association_members_v1(
    v_term.association_id,'NATIONAL_COACH_RESIGNED','National Coach has resigned',
    coalesce(v_club_name,'The National Coach')||
      ' has resigned from the National Coach position. A replacement election will start.',
    '/dashboard/national-association/elections',
    jsonb_build_object('previous_coach_user_id',v_uid,'previous_coach_club_id',v_term.club_id,'season_number',v_season),
    'national-coach-resigned:'||v_term.id::text
  );
  v_election_id:=public.ensure_national_coach_election_v1(v_term.association_id,v_season);
  return jsonb_build_object('status','resigned','association_id',v_term.association_id,
    'replacement_election_id',v_election_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_association_nations_runtime_v4()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_core jsonb; v_races jsonb; v_health jsonb; v_integrity jsonb; v_vacancies jsonb;
begin
  perform public.process_user_team_inactivity_v1(false);
  v_vacancies:=public.process_national_coach_vacancies_v1();
  v_core:=public.process_national_association_nations_runtime_v1();
  v_races:=public.process_nations_race_runtime_v2();
  v_health:=public.check_nations_operations_health_v1();
  v_integrity:=public.check_national_association_integrity_v1();
  return coalesce(v_core,'{}'::jsonb)||jsonb_build_object(
    'coach_vacancies',v_vacancies,'race_runtime',v_races,
    'operations_health',v_health,'association_integrity',v_integrity);
end;
$function$
;

grant execute on function public.withdraw_national_coach_candidate_v1(uuid) to authenticated;
grant execute on function public.resign_national_coach_v1() to authenticated;
