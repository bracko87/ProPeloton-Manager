-- National Association renewal lifecycle + World Nations group hosting.
-- Associations renew for 30 Coins by 1 February of each new Season.
-- World Nations planning is generated in January, while Season 1 participant
-- field remains open until June. One host country supplies all three race-day
-- routes (TTT, Flat, Hilly/Mountain) for each qualification group/final.

alter table public.national_association_config
  add column if not exists renewal_coin_target integer not null default 30,
  add column if not exists renewal_window_month smallint not null default 1,
  add column if not exists renewal_window_day smallint not null default 1,
  add column if not exists renewal_deadline_month smallint not null default 2,
  add column if not exists renewal_deadline_day smallint not null default 1;

alter table public.national_associations
  add column if not exists renewal_paid_through_season integer;

update public.national_associations a
set renewal_paid_through_season=coalesce(
  a.renewal_paid_through_season,
  (select season_number from public.game_state where id=true)
)
where a.status='active';

create table if not exists public.national_association_renewal_coin_events (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  season_number integer not null check (season_number>0),
  user_id uuid not null,
  club_id uuid references public.clubs(id) on delete set null,
  amount integer not null check (amount>0),
  game_date date not null default public.get_current_game_date_date(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_national_association_renewal_events_assoc_season
  on public.national_association_renewal_coin_events(association_id,season_number);

alter table public.nations_competition_schedule_config
  add column if not exists field_lock_month integer not null default 2,
  add column if not exists field_lock_day integer not null default 2,
  add column if not exists season1_field_lock_month integer not null default 6,
  add column if not exists season1_field_lock_day integer not null default 1;

update public.nations_competition_schedule_config
set season1_generation_month=1,
    season1_generation_day=28,
    generation_month=1,
    generation_day=28,
    field_lock_month=2,
    field_lock_day=2,
    season1_field_lock_month=6,
    season1_field_lock_day=1,
    updated_at=now()
where id=true;

alter table public.nations_host_applications
  add column if not exists host_scope text not null default 'final',
  add column if not exists ttt_stage_id uuid references public.race_stages(id) on delete restrict,
  add column if not exists flat_stage_id uuid references public.race_stages(id) on delete restrict,
  add column if not exists mountain_stage_id uuid references public.race_stages(id) on delete restrict;

alter table public.nations_host_applications
  drop constraint if exists nations_host_applications_edition_id_association_id_key;

alter table public.nations_host_applications
  drop constraint if exists nations_host_applications_host_scope_check;

alter table public.nations_host_applications
  add constraint nations_host_applications_host_scope_check
  check (host_scope in ('qualification','final'));

create unique index if not exists nations_host_applications_edition_assoc_scope_key
  on public.nations_host_applications(edition_id,association_id,host_scope);

alter table public.nations_competition_groups
  add column if not exists host_application_id uuid references public.nations_host_applications(id) on delete set null,
  add column if not exists host_association_id uuid references public.national_associations(id) on delete set null,
  add column if not exists host_country_code text,
  add column if not exists host_assignment_source text;

create index if not exists idx_nations_groups_host_country
  on public.nations_competition_groups(host_country_code);

create or replace function public.nations_generation_gate_v1(
  p_season_number integer default null
)
returns date
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_season integer;
  v_cfg public.nations_competition_schedule_config%rowtype;
begin
  v_season:=p_season_number;

  if v_season is null then
    select season_number into v_season
    from public.game_state
    where id=true;
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id=true;

  if v_season=1 then
    return public.game_date_from_parts(
      v_season,
      coalesce(v_cfg.season1_generation_month,1),
      coalesce(v_cfg.season1_generation_day,28)
    );
  end if;

  return public.game_date_from_parts(
    v_season,
    coalesce(v_cfg.generation_month,1),
    coalesce(v_cfg.generation_day,28)
  );
end;
$function$;

create or replace function public.nations_field_lock_gate_v1(
  p_season_number integer default null
)
returns date
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_season integer;
  v_cfg public.nations_competition_schedule_config%rowtype;
begin
  v_season:=p_season_number;

  if v_season is null then
    select season_number into v_season
    from public.game_state
    where id=true;
  end if;

  select * into v_cfg
  from public.nations_competition_schedule_config
  where id=true;

  if v_season=1 then
    return public.game_date_from_parts(
      v_season,
      coalesce(v_cfg.season1_field_lock_month,6),
      coalesce(v_cfg.season1_field_lock_day,1)
    );
  end if;

  return public.game_date_from_parts(
    v_season,
    coalesce(v_cfg.field_lock_month,2),
    coalesce(v_cfg.field_lock_day,2)
  );
end;
$function$;

revoke all on function public.nations_field_lock_gate_v1(integer)
from public,anon;
grant execute on function public.nations_field_lock_gate_v1(integer)
to authenticated;

create or replace function public.refresh_national_association_statuses_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_month integer;
  v_day integer;
  v_minimum integer;
  v_activation_target integer;
  v_renewal_target integer;
  v_deadline_month integer;
  v_deadline_day integer;
  v_deadline date;
  v_activated integer:=0;
  v_inactivated integer:=0;
  v_renewal_inactivated integer:=0;
begin
  select season_number::integer,month_number::integer,day_number::integer
  into v_season,v_month,v_day
  from public.game_state
  where id=true;

  select
    minimum_active_members::integer,
    activation_coin_target::integer,
    renewal_coin_target::integer,
    renewal_deadline_month::integer,
    renewal_deadline_day::integer
  into
    v_minimum,
    v_activation_target,
    v_renewal_target,
    v_deadline_month,
    v_deadline_day
  from public.national_association_config
  where id=true;

  v_deadline:=public.game_date_from_parts(
    v_season,
    coalesce(v_deadline_month,2),
    coalesce(v_deadline_day,1)
  );

  update public.national_associations a
  set status='active',
      activated_on_game_date=coalesce(a.activated_on_game_date,v_today),
      renewal_paid_through_season=coalesce(a.renewal_paid_through_season,v_season),
      inactive_on_game_date=null,
      last_status_change_on_game_date=v_today,
      updated_at=now()
  where a.status in ('forming','inactive')
    and a.activated_on_game_date is null
    and private.national_association_active_member_count_v1(a.id)>=coalesce(v_minimum,5)
    and coalesce((
      select sum(e.amount)
      from public.national_association_activation_coin_events e
      where e.association_id=a.id
    ),0)>=coalesce(v_activation_target,50);

  get diagnostics v_activated=row_count;

  -- Associations founded previously remain active through the January renewal
  -- grace period. At 1 February they must have both five eligible managers and
  -- the 30-Coin renewal for the current Season.
  if v_today>=v_deadline then
    update public.national_associations a
    set status='inactive',
        inactive_on_game_date=v_today,
        last_status_change_on_game_date=v_today,
        updated_at=now()
    where a.status='active'
      and (
        private.national_association_active_member_count_v1(a.id)<coalesce(v_minimum,5)
        or coalesce(a.renewal_paid_through_season,0)<v_season
      );

    get diagnostics v_renewal_inactivated=row_count;

    update public.national_coach_terms t
    set status='ineligible',
        term_end_game_date=greatest(t.term_start_game_date,v_today),
        updated_at=now()
    where t.status='active'
      and exists(
        select 1
        from public.national_associations a
        where a.id=t.association_id
          and a.status='inactive'
      );
  end if;

  v_inactivated:=v_renewal_inactivated;

  return jsonb_build_object(
    'game_date',v_today,
    'season_number',v_season,
    'activated',v_activated,
    'inactivated_at_renewal_deadline',v_inactivated,
    'minimum_members',coalesce(v_minimum,5),
    'activation_coin_target',coalesce(v_activation_target,50),
    'renewal_coin_target',coalesce(v_renewal_target,30),
    'renewal_deadline',v_deadline
  );
end;
$function$;

create or replace function public.contribute_national_association_renewal_coins_v1(
  p_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_membership public.national_association_memberships%rowtype;
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_month integer;
  v_day integer;
  v_target integer:=30;
  v_minimum integer:=5;
  v_open_month integer:=1;
  v_open_day integer:=1;
  v_deadline_month integer:=2;
  v_deadline_day integer:=1;
  v_open_date date;
  v_deadline date;
  v_total integer:=0;
  v_remaining integer:=0;
  v_applied integer:=0;
  v_event_id uuid:=gen_random_uuid();
  v_balance integer:=0;
  v_today date:=public.get_current_game_date_date();
  v_member_count integer:=0;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if coalesce(p_amount,0)<=0 then
    raise exception 'Coin contribution must be greater than zero.';
  end if;

  select season_number::integer,month_number::integer,day_number::integer
  into v_season,v_month,v_day
  from public.game_state
  where id=true;

  select
    minimum_active_members::integer,
    renewal_coin_target::integer,
    renewal_window_month::integer,
    renewal_window_day::integer,
    renewal_deadline_month::integer,
    renewal_deadline_day::integer
  into
    v_minimum,v_target,v_open_month,v_open_day,v_deadline_month,v_deadline_day
  from public.national_association_config
  where id=true;

  v_open_date:=public.game_date_from_parts(v_season,coalesce(v_open_month,1),coalesce(v_open_day,1));
  v_deadline:=public.game_date_from_parts(v_season,coalesce(v_deadline_month,2),coalesce(v_deadline_day,1));

  if v_today<v_open_date or v_today>=v_deadline then
    raise exception 'National Association renewal Coins can only be contributed from 1 January until the 1 February deadline.';
  end if;

  select m.* into v_membership
  from public.national_association_memberships m
  where m.user_id=v_uid
    and m.status='active'
    and private.national_association_member_is_eligible_v1(m.association_id,v_uid)
  order by m.created_at desc
  limit 1;

  if v_membership.id is null then
    raise exception 'Join your National Association before contributing renewal Coins.';
  end if;

  select * into v_assoc
  from public.national_associations
  where id=v_membership.association_id
  for update;

  if v_assoc.id is null or v_assoc.activated_on_game_date is null then
    raise exception 'The National Association must be activated before it can be renewed.';
  end if;

  if coalesce(v_assoc.renewal_paid_through_season,0)>=v_season then
    select coalesce(w.balance,0) into v_balance
    from public.user_wallets w where w.user_id=v_uid;

    return jsonb_build_object(
      'association_id',v_assoc.id,
      'season_number',v_season,
      'requested_amount',p_amount,
      'applied_amount',0,
      'renewal_coin_target',coalesce(v_target,30),
      'renewal_coin_contributed',coalesce(v_target,30),
      'renewal_coin_remaining',0,
      'coin_balance_after',coalesce(v_balance,0),
      'renewed',true
    );
  end if;

  select coalesce(sum(e.amount),0)::integer
  into v_total
  from public.national_association_renewal_coin_events e
  where e.association_id=v_assoc.id
    and e.season_number=v_season;

  v_remaining:=greatest(coalesce(v_target,30)-v_total,0);

  if v_remaining=0 then
    update public.national_associations
    set renewal_paid_through_season=greatest(coalesce(renewal_paid_through_season,0),v_season),
        updated_at=now()
    where id=v_assoc.id;

    return jsonb_build_object(
      'association_id',v_assoc.id,
      'season_number',v_season,
      'requested_amount',p_amount,
      'applied_amount',0,
      'renewal_coin_target',coalesce(v_target,30),
      'renewal_coin_contributed',coalesce(v_target,30),
      'renewal_coin_remaining',0,
      'renewed',true
    );
  end if;

  v_applied:=least(p_amount,v_remaining);

  perform public.apply_coin_delta(
    v_uid,
    -v_applied,
    'national_association_renewal',
    jsonb_build_object(
      'system_key','national_association_renewal_'||v_assoc.id::text||'_'||v_season::text||'_'||v_event_id::text,
      'association_id',v_assoc.id,
      'country_code',v_assoc.country_code,
      'club_id',v_membership.club_id,
      'season_number',v_season,
      'requested_amount',p_amount,
      'applied_amount',v_applied,
      'renewal_coin_target',coalesce(v_target,30)
    )
  );

  insert into public.national_association_renewal_coin_events(
    id,association_id,season_number,user_id,club_id,amount,game_date,metadata
  )
  values(
    v_event_id,v_assoc.id,v_season,v_uid,v_membership.club_id,v_applied,v_today,
    jsonb_build_object(
      'requested_amount',p_amount,
      'capped_to_remaining',p_amount>v_applied,
      'refundable',false,
      'treasury',false
    )
  );

  v_total:=v_total+v_applied;
  v_member_count:=private.national_association_active_member_count_v1(v_assoc.id);

  if v_total>=coalesce(v_target,30) then
    update public.national_associations
    set renewal_paid_through_season=greatest(coalesce(renewal_paid_through_season,0),v_season),
        status=case when v_member_count>=coalesce(v_minimum,5) then 'active' else status end,
        inactive_on_game_date=case when v_member_count>=coalesce(v_minimum,5) then null else inactive_on_game_date end,
        last_status_change_on_game_date=case when status<>'active' and v_member_count>=coalesce(v_minimum,5) then v_today else last_status_change_on_game_date end,
        updated_at=now()
    where id=v_assoc.id;
  end if;

  select coalesce(w.balance,0)
  into v_balance
  from public.user_wallets w
  where w.user_id=v_uid;

  return jsonb_build_object(
    'association_id',v_assoc.id,
    'event_id',v_event_id,
    'season_number',v_season,
    'requested_amount',p_amount,
    'applied_amount',v_applied,
    'renewal_coin_target',coalesce(v_target,30),
    'renewal_coin_contributed',least(v_total,coalesce(v_target,30)),
    'renewal_coin_remaining',greatest(coalesce(v_target,30)-v_total,0),
    'coin_balance_after',coalesce(v_balance,0),
    'renewed',v_total>=coalesce(v_target,30),
    'renewal_deadline',v_deadline
  );
end;
$function$;

revoke all on function public.contribute_national_association_renewal_coins_v1(integer)
from public,anon;
grant execute on function public.contribute_national_association_renewal_coins_v1(integer)
to authenticated;

create or replace function public.get_my_national_association_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
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
    where c.election_id=v_election.id;

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
$function$;

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

  if new.status='completed' and v_winner_user_id is not null then
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
end;
$function$;

create or replace function public.process_nations_competition_planning_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_season integer;
  v_today date;
  v_generation_gate date;
  v_field_lock_gate date;
  v_active_count integer;
  v_create jsonb;
  v_edition_id uuid;
  v_round_id uuid;
  v_round_status text;
  v_draw jsonb:=null;
begin
  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_today
  from public.game_state gs
  where gs.id=true;

  v_generation_gate:=public.nations_generation_gate_v1(v_season);
  v_field_lock_gate:=public.nations_field_lock_gate_v1(v_season);

  if v_today<v_generation_gate then
    return jsonb_build_object(
      'status','waiting_for_january_planning',
      'season_number',v_season,
      'generation_gate',v_generation_gate,
      'field_lock_gate',v_field_lock_gate
    );
  end if;

  select count(*)::integer
  into v_active_count
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members
      from public.national_association_config
      where id=true
    );

  if v_active_count=0 then
    return jsonb_build_object(
      'status','waiting_for_active_associations',
      'season_number',v_season,
      'generation_gate',v_generation_gate,
      'field_lock_gate',v_field_lock_gate,
      'active_associations',0
    );
  end if;

  v_create:=public.create_nations_competition_edition_v1(v_season);
  v_edition_id:=nullif(v_create->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season
    limit 1;
  end if;

  if v_edition_id is null then
    return coalesce(v_create,'{}'::jsonb)
      || jsonb_build_object('status','edition_not_available');
  end if;

  -- Race structure, schedule and host routes can be prepared from January.
  -- The participant draw waits for the field-lock date, so Season 1 can still
  -- accept Associations until 1 June.
  if v_today>=v_field_lock_gate then
    select id,status
    into v_round_id,v_round_status
    from public.nations_competition_rounds
    where edition_id=v_edition_id
      and round_index=1
    limit 1;

    if v_round_id is not null
       and v_round_status='planned'
       and not exists(
         select 1
         from public.nations_group_entries nge
         join public.nations_competition_groups g on g.id=nge.group_id
         where g.round_id=v_round_id
       )
    then
      v_draw:=public.draw_nations_round_v1(v_round_id);

      update public.nations_competition_editions
      set status='qualification',
          updated_at=now()
      where id=v_edition_id
        and status='planned';
    end if;
  end if;

  return jsonb_build_object(
    'status',case when v_today>=v_field_lock_gate then 'ready' else 'planning_ready_field_open' end,
    'season_number',v_season,
    'generation_gate',v_generation_gate,
    'field_lock_gate',v_field_lock_gate,
    'edition_id',v_edition_id,
    'active_associations',v_active_count,
    'edition_creation',v_create,
    'first_round_draw',v_draw
  );
end;
$function$;

create or replace function private.auto_enroll_national_association_in_nations_v1(
  p_association_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_assoc public.national_associations%rowtype;
  v_season integer;
  v_edition public.nations_competition_editions%rowtype;
  v_minimum integer:=5;
  v_inserted integer:=0;
  v_rebuild jsonb:=null;
  v_schedule jsonb:=null;
  v_hosts jsonb:=null;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return jsonb_build_object('status','not_active');
  end if;

  select minimum_active_members::integer
  into v_minimum
  from public.national_association_config
  where id=true;

  if private.national_association_active_member_count_v1(v_assoc.id)<coalesce(v_minimum,5) then
    return jsonb_build_object('status','not_eligible_yet');
  end if;

  select season_number into v_season
  from public.game_state where id=true;

  select * into v_edition
  from public.nations_competition_editions
  where season_number=v_season
  limit 1;

  if v_edition.id is null then
    return jsonb_build_object('status','queued_for_automatic_generation','season_number',v_season);
  end if;

  if v_edition.status<>'planned'
     or exists(
       select 1
       from public.nations_group_entries nge
       join public.nations_competition_groups g on g.id=nge.group_id
       join public.nations_competition_rounds r on r.id=g.round_id
       where r.edition_id=v_edition.id
     )
  then
    return jsonb_build_object(
      'status','current_draw_locked_next_season_automatic',
      'edition_id',v_edition.id,
      'season_number',v_season
    );
  end if;

  insert into public.nations_competition_entries(
    edition_id,association_id,country_code,seed_score,status
  )
  values(v_edition.id,v_assoc.id,v_assoc.country_code,0,'entered')
  on conflict(edition_id,association_id) do nothing;

  get diagnostics v_inserted=row_count;

  if v_inserted>0 then
    v_rebuild:=private.rebuild_planned_nations_structure_v1(v_edition.id);
    v_schedule:=public.schedule_nations_edition_v1(v_edition.id);
    v_hosts:=public.assign_nations_event_hosts_v1(v_edition.id);
  end if;

  return jsonb_build_object(
    'status',case when v_inserted>0 then 'automatically_entered' else 'already_entered' end,
    'edition_id',v_edition.id,
    'season_number',v_season,
    'structure',v_rebuild,
    'schedule',v_schedule,
    'hosts',v_hosts
  );
end;
$function$;

revoke all on function private.auto_enroll_national_association_in_nations_v1(uuid)
from public,anon,authenticated;

create or replace function public.get_nations_host_application_workspace_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
  v_country_code text;
  v_association_id uuid;
  v_can_apply boolean:=false;
  v_ttt jsonb:='[]'::jsonb;
  v_flat jsonb:='[]'::jsonb;
  v_mountain jsonb:='[]'::jsonb;
  v_applications jsonb:='[]'::jsonb;
  v_my_apps jsonb:='[]'::jsonb;
  v_final_host text;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is not null
     and v_ctx.season_number=v_edition.season_number then
    v_association_id:=v_ctx.association_id;
    v_country_code:=upper(v_ctx.country_code);
    v_can_apply:=true;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'application_id',h.id,
      'association_id',h.association_id,
      'association_name',a.name,
      'country_code',a.country_code,
      'host_scope',h.host_scope,
      'status',h.status,
      'submitted_on',h.submitted_on_game_date
    )
    order by h.host_scope,a.country_code
  ),'[]'::jsonb)
  into v_applications
  from public.nations_host_applications h
  join public.national_associations a on a.id=h.association_id
  where h.edition_id=v_edition.id
    and h.status<>'withdrawn';

  if v_association_id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'application_id',h.id,
        'host_scope',h.host_scope,
        'status',h.status,
        'ttt_stage_id',h.ttt_stage_id,
        'flat_stage_id',h.flat_stage_id,
        'mountain_stage_id',h.mountain_stage_id,
        'statement',h.statement,
        'submitted_on',h.submitted_on_game_date
      )
      order by h.host_scope
    ),'[]'::jsonb)
    into v_my_apps
    from public.nations_host_applications h
    where h.edition_id=v_edition.id
      and h.association_id=v_association_id
      and h.status<>'withdrawn';

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_ttt
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country_code
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and s.stage_format='team_time_trial'
      and s.distance_km between 18 and 48;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_flat
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country_code
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and s.stage_format='road_race'
      and s.terrain_type='flat'
      and s.distance_km between 140 and 220;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_mountain
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country_code
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and s.stage_format='road_race'
      and s.terrain_type in ('hilly','mountain')
      and s.distance_km between 135 and 220;
  end if;

  select g.host_country_code
  into v_final_host
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  where r.edition_id=v_edition.id
    and r.round_type='world_final'
  order by g.group_number
  limit 1;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'season_number',v_edition.season_number,
    'viewer_can_apply',v_can_apply,
    'viewer_association_id',v_association_id,
    'viewer_country_code',v_country_code,
    'country_has_complete_bundle',
      jsonb_array_length(v_ttt)>0
      and jsonb_array_length(v_flat)>0
      and jsonb_array_length(v_mountain)>0,
    'missing_types',to_jsonb(array_remove(ARRAY[
      case when jsonb_array_length(v_ttt)=0 then 'team_time_trial' end,
      case when jsonb_array_length(v_flat)=0 then 'flat' end,
      case when jsonb_array_length(v_mountain)=0 then 'hilly_mountain' end
    ]::text[],null)),
    'stage_options',jsonb_build_object(
      'team_time_trial',v_ttt,
      'flat',v_flat,
      'hilly_mountain',v_mountain
    ),
    'applications',v_applications,
    'my_applications',v_my_apps,
    'world_final_host_country_code',v_final_host
  );
end;
$function$;

revoke all on function public.get_nations_host_application_workspace_v1(uuid)
from public,anon;
grant execute on function public.get_nations_host_application_workspace_v1(uuid)
to authenticated;

create or replace function public.submit_nations_host_application_v2(
  p_edition_id uuid,
  p_host_scope text,
  p_ttt_stage_id uuid,
  p_flat_stage_id uuid,
  p_mountain_stage_id uuid,
  p_statement text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
  v_country text;
  v_id uuid;
  v_valid integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_host_scope not in ('qualification','final') then
    raise exception 'Host application scope must be qualification or final.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a host application.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null or v_edition.season_number<>v_ctx.season_number then
    raise exception 'World Nations edition not found for the current season.';
  end if;

  if v_edition.status not in ('planned','qualification') then
    raise exception 'Host applications are closed for this edition.';
  end if;

  v_country:=upper(v_ctx.country_code);

  select count(*)::integer
  into v_valid
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_ttt_stage_id
    and upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
    and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and s.stage_format='team_time_trial'
    and s.distance_km between 18 and 48;

  if v_valid<>1 then
    raise exception 'Select a valid Team Time Trial stage from your Association country.';
  end if;

  select count(*)::integer
  into v_valid
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_flat_stage_id
    and upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
    and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and s.stage_format='road_race'
    and s.terrain_type='flat'
    and s.distance_km between 140 and 220;

  if v_valid<>1 then
    raise exception 'Select a valid Flat road stage from your Association country.';
  end if;

  select count(*)::integer
  into v_valid
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_mountain_stage_id
    and upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
    and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and s.stage_format='road_race'
    and s.terrain_type in ('hilly','mountain')
    and s.distance_km between 135 and 220;

  if v_valid<>1 then
    raise exception 'Select a valid Hilly/Mountain road stage from your Association country.';
  end if;

  insert into public.nations_host_applications(
    edition_id,association_id,submitted_by_user_id,statement,status,
    host_scope,ttt_stage_id,flat_stage_id,mountain_stage_id
  )
  values(
    v_edition.id,v_ctx.association_id,v_uid,
    nullif(btrim(coalesce(p_statement,'')),''),
    'submitted',p_host_scope,p_ttt_stage_id,p_flat_stage_id,p_mountain_stage_id
  )
  on conflict(edition_id,association_id,host_scope) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      statement=excluded.statement,
      status='submitted',
      ttt_stage_id=excluded.ttt_stage_id,
      flat_stage_id=excluded.flat_stage_id,
      mountain_stage_id=excluded.mountain_stage_id,
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.submit_nations_host_application_v2(uuid,text,uuid,uuid,uuid,text)
from public,anon;
grant execute on function public.submit_nations_host_application_v2(uuid,text,uuid,uuid,uuid,text)
to authenticated;

create or replace function public.assign_nations_event_hosts_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_group record;
  v_scope text;
  v_application public.nations_host_applications%rowtype;
  v_host_country text;
  v_host_association uuid;
  v_ttt_stage uuid;
  v_flat_stage uuid;
  v_mountain_stage uuid;
  v_previous_host text:=null;
  v_used_hosts text[]:='{}'::text[];
  v_assigned integer:=0;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  update public.nations_host_applications
  set status='eligible',updated_at=now()
  where edition_id=v_edition.id
    and status in ('submitted','eligible','selected');

  for v_group in
    select
      g.id,
      g.group_number,
      r.round_index,
      r.round_type
    from public.nations_competition_rounds r
    join public.nations_competition_groups g on g.round_id=r.id
    where r.edition_id=v_edition.id
    order by r.round_index,g.group_number
  loop
    perform private.ensure_nations_group_runtime_v1(v_group.id);

    v_scope:=case when v_group.round_type='world_final' then 'final' else 'qualification' end;
    v_application:=null;
    v_host_country:=null;
    v_host_association:=null;
    v_ttt_stage:=null;
    v_flat_stage:=null;
    v_mountain_stage:=null;

    select h.*
    into v_application
    from public.nations_host_applications h
    join public.national_associations a on a.id=h.association_id
    where h.edition_id=v_edition.id
      and h.host_scope=v_scope
      and h.status in ('eligible','selected')
      and a.status='active'
      and h.ttt_stage_id is not null
      and h.flat_stage_id is not null
      and h.mountain_stage_id is not null
    order by
      (
        select count(*)
        from public.nations_competition_groups gx
        join public.nations_competition_rounds rx on rx.id=gx.round_id
        where rx.edition_id=v_edition.id
          and gx.host_application_id=h.id
      ) asc,
      case when upper(a.country_code)=v_previous_host then 1 else 0 end,
      case when upper(a.country_code)=any(v_used_hosts) then 1 else 0 end,
      md5(v_edition.id::text||':'||v_group.id::text||':'||h.id::text)
    limit 1;

    if v_application.id is not null then
      select upper(country_code) into v_host_country
      from public.national_associations
      where id=v_application.association_id;

      v_host_association:=v_application.association_id;
      v_ttt_stage:=v_application.ttt_stage_id;
      v_flat_stage:=v_application.flat_stage_id;
      v_mountain_stage:=v_application.mountain_stage_id;
    else
      with eligible_country as (
        select
          upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,''))) as country_code,
          count(*) filter(
            where s.stage_format='team_time_trial'
              and s.distance_km between 18 and 48
          ) as ttt_count,
          count(*) filter(
            where s.stage_format='road_race'
              and s.terrain_type='flat'
              and s.distance_km between 140 and 220
          ) as flat_count,
          count(*) filter(
            where s.stage_format='road_race'
              and s.terrain_type in ('hilly','mountain')
              and s.distance_km between 135 and 220
          ) as mountain_count
        from public.race_stages s
        join public.races r on r.id=s.race_id
        where coalesce((r.metadata->>'nations_competition')::boolean,false)=false
          and coalesce((r.metadata->>'national_championship')::boolean,false)=false
          and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
          and coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')) is not null
        group by upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))
        having count(*) filter(
          where s.stage_format='team_time_trial'
            and s.distance_km between 18 and 48
        )>0
        and count(*) filter(
          where s.stage_format='road_race'
            and s.terrain_type='flat'
            and s.distance_km between 140 and 220
        )>0
        and count(*) filter(
          where s.stage_format='road_race'
            and s.terrain_type in ('hilly','mountain')
            and s.distance_km between 135 and 220
        )>0
      )
      select country_code
      into v_host_country
      from eligible_country
      order by
        case when country_code=v_previous_host then 1 else 0 end,
        case when country_code=any(v_used_hosts) then 1 else 0 end,
        md5(v_edition.id::text||':'||v_group.id::text||':'||country_code)
      limit 1;

      if v_host_country is null then
        raise exception 'No World Nations host country has a complete TTT, Flat and Hilly/Mountain stage bundle.';
      end if;

      select ce.association_id
      into v_host_association
      from public.nations_competition_entries ce
      where ce.edition_id=v_edition.id
        and upper(ce.country_code)=v_host_country
      limit 1;

      select s.id into v_ttt_stage
      from public.race_stages s
      join public.races r on r.id=s.race_id
      where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_host_country
        and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
        and coalesce((r.metadata->>'national_championship')::boolean,false)=false
        and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
        and s.stage_format='team_time_trial'
        and s.distance_km between 18 and 48
      order by md5(v_edition.id::text||':'||v_group.id::text||':ttt:'||s.id::text)
      limit 1;

      select s.id into v_flat_stage
      from public.race_stages s
      join public.races r on r.id=s.race_id
      where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_host_country
        and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
        and coalesce((r.metadata->>'national_championship')::boolean,false)=false
        and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
        and s.stage_format='road_race'
        and s.terrain_type='flat'
        and s.distance_km between 140 and 220
      order by md5(v_edition.id::text||':'||v_group.id::text||':flat:'||s.id::text)
      limit 1;

      select s.id into v_mountain_stage
      from public.race_stages s
      join public.races r on r.id=s.race_id
      where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_host_country
        and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
        and coalesce((r.metadata->>'national_championship')::boolean,false)=false
        and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
        and s.stage_format='road_race'
        and s.terrain_type in ('hilly','mountain')
        and s.distance_km between 135 and 220
      order by md5(v_edition.id::text||':'||v_group.id::text||':mountain:'||s.id::text)
      limit 1;
    end if;

    update public.nations_competition_groups
    set host_application_id=v_application.id,
        host_association_id=v_host_association,
        host_country_code=v_host_country,
        host_assignment_source=case when v_application.id is null then 'system_bundle' else 'host_application' end,
        updated_at=now()
    where id=v_group.id;

    update public.nations_group_events
    set source_stage_id=case race_type
          when 'team_time_trial' then v_ttt_stage
          when 'flat_road_race' then v_flat_stage
          else v_mountain_stage
        end,
        host_association_id=v_host_association,
        host_country_code=v_host_country,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'group_host',true,
          'host_country_code',v_host_country,
          'host_association_id',v_host_association,
          'host_application_id',v_application.id,
          'host_scope',v_scope
        ),
        updated_at=now()
    where group_id=v_group.id;

    if v_application.id is not null then
      update public.nations_host_applications
      set status='selected',updated_at=now()
      where id=v_application.id;
    end if;

    v_previous_host:=v_host_country;
    if not (v_host_country=any(v_used_hosts)) then
      v_used_hosts:=array_append(v_used_hosts,v_host_country);
    end if;
    v_assigned:=v_assigned+1;
  end loop;

  update public.nations_competition_editions
  set host_association_id=null,
      host_country_code=null,
      updated_at=now()
  where id=v_edition.id;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'group_hosts',true,
    'assigned_groups',v_assigned
  );
end;
$function$;

revoke all on function public.assign_nations_event_hosts_v1(uuid)
from public,anon,authenticated;

create or replace function public.process_national_association_nations_runtime_v1()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_field_lock date;
  v_status jsonb;
  v_elections jsonb;
  v_expired integer;
  v_duties jsonb;
  v_plan jsonb;
  v_edition_id uuid;
  v_schedule jsonb:=null;
  v_hosts jsonb:=null;
  v_next_round record;
  v_draw jsonb:=null;
begin
  select season_number into v_season
  from public.game_state where id=true;

  v_field_lock:=public.nations_field_lock_gate_v1(v_season);
  v_status:=public.refresh_national_association_statuses_v1();
  v_elections:=public.process_national_coach_elections_v1();
  v_expired:=public.expire_national_team_callups_v1();
  v_duties:=public.refresh_national_team_duty_status_v1();
  v_plan:=public.process_nations_competition_planning_v1();

  v_edition_id:=nullif(v_plan->>'edition_id','')::uuid;

  if v_edition_id is null then
    select id into v_edition_id
    from public.nations_competition_editions
    where season_number=v_season
    limit 1;
  end if;

  if v_edition_id is not null then
    v_schedule:=public.schedule_nations_edition_v1(v_edition_id);
    v_hosts:=public.assign_nations_event_hosts_v1(v_edition_id);

    if v_today>=v_field_lock then
      select r.id,r.round_type
      into v_next_round
      from public.nations_competition_rounds r
      where r.edition_id=v_edition_id
        and r.status='planned'
        and (
          r.round_index=1
          or exists(
            select 1
            from public.nations_competition_rounds prev
            where prev.edition_id=r.edition_id
              and prev.round_index=r.round_index-1
              and prev.status='completed'
          )
        )
      order by r.round_index
      limit 1;

      if v_next_round.id is not null then
        v_draw:=public.draw_nations_round_v1(v_next_round.id);

        update public.nations_competition_editions
        set status=case
            when v_next_round.round_type='world_final' then 'world_final'
            else 'qualification'
          end,
          updated_at=now()
        where id=v_edition_id
          and status<>'completed';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'game_date',v_today,
    'association_statuses',v_status,
    'coach_elections',v_elections,
    'expired_or_auto_accepted_callups',v_expired,
    'national_duties',v_duties,
    'nations_planning',v_plan,
    'nations_schedule',v_schedule,
    'group_hosts',v_hosts,
    'field_lock_gate',v_field_lock,
    'next_round_draw',v_draw
  );
end;
$function$;
