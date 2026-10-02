-- Youth Academy Phase 2A: human Academy-to-Academy recruitment responses.
-- Scouting can discover riders from AI or human academies. AI academies answer
-- immediately; human source academies receive a pending approach to accept/refuse.

alter table public.youth_recruitment_offers
  add column if not exists reserved_amount bigint not null default 0
    check(reserved_amount>=0),
  add column if not exists reserved_weekly_commitment bigint not null default 0
    check(reserved_weekly_commitment>=0);

alter table public.youth_recruitment_offers
  drop constraint if exists youth_recruitment_offers_source_academy_decision_check;

alter table public.youth_recruitment_offers
  add constraint youth_recruitment_offers_source_academy_decision_check
  check(source_academy_decision in ('not_required','pending','accepted','rejected'));

-- Patch the Phase 2A offer processor so human source academies remain pending
-- instead of being rejected automatically, and reserve the offering Academy budget.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='process_youth_recruitment_offer_v1'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'process_youth_recruitment_offer_v1 not found'; end if;
  v_def:=pg_get_functiondef(v_oid);

  v_new:=replace(
    v_def,
    $old$    elsif not v_source_academy.is_ai then
      -- Human-to-human acceptance UI/notifications are intentionally deferred.
      -- Phase 2A scouting only surfaces AI Academy approaches.
      v_source_decision:='rejected';
      v_status:='academy_rejected';
      v_reason:='This Academy requires a manager-to-manager response flow.';
    else$old$,
    $new$    elsif not v_source_academy.is_ai then
      v_source_decision:='pending';
      v_status:='submitted';
    else$new$
  );
  if v_new=v_def then raise exception 'Human Academy decision patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    $old$  if v_status='submitted' then
    select coalesce(round($old$,
    $new$  if v_status='submitted' and v_source_decision<>'pending' then
    select coalesce(round($new$
  );
  if v_new=v_def then raise exception 'Human Academy rider-decision patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    $old$  returning id into v_offer_id;

  if v_status='accepted' then$old$,
    $new$  returning id into v_offer_id;

  if v_source_decision='pending' then
    update public.youth_recruitment_offers
    set
      reserved_amount=greatest(0,p_compensation_offer)+v_weekly_commit,
      reserved_weekly_commitment=v_weekly_commit
    where id=v_offer_id;

    update public.youth_academy_season_budgets
    set
      committed_amount=committed_amount+greatest(0,p_compensation_offer)+v_weekly_commit,
      updated_at=now()
    where academy_id=p_academy_id and season_number=v_season;

    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_report.id;

    return v_offer_id;
  end if;

  if v_status='accepted' then$new$
  );
  if v_new=v_def then raise exception 'Human Academy reservation patch point not found'; end if;

  execute v_new;
end $$;

-- Human academies may now be discovered within the funded scouting range.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='run_my_youth_scouting_cycle_v1'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'run_my_youth_scouting_cycle_v1 not found'; end if;
  v_def:=pg_get_functiondef(v_oid);

  v_new:=replace(
    v_def,
    $old$        and a.is_active=true
        and a.is_ai=true
        and r.status='academy'$old$,
    $new$        and a.is_active=true
        and r.status='academy'$new$
  );

  if v_new=v_def then raise exception 'Human Academy scouting target patch point not found'; end if;
  execute v_new;
end $$;

create or replace function private.youth_offer_acceptance_score_v1(
  p_offering_country text,
  p_rider_country text,
  p_expected_stipend integer,
  p_offered_stipend integer,
  p_suggested_accommodation integer,
  p_offered_accommodation integer,
  p_age integer,
  p_head_coach_skill integer,
  p_academy_reputation integer
)
returns numeric
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select
    45
    + case
        when upper(p_rider_country)=upper(p_offering_country) then 22
        when private.youth_country_allowed_v1(
          p_offering_country,p_rider_country,'regional'
        ) then 10
        when private.youth_country_allowed_v1(
          p_offering_country,p_rider_country,'continental'
        ) then 0
        else -8
      end
    + least(22,greatest(-25,
        ((p_offered_stipend::numeric/nullif(p_expected_stipend,0))-1.0)*55
      ))
    + case
        when upper(p_rider_country)=upper(p_offering_country) then 0
        when p_offered_accommodation>=p_suggested_accommodation then 14
        else -18
      end
    + least(10,coalesce(p_head_coach_skill,0)/10.0)
    + least(8,coalesce(p_academy_reputation,0)/1250.0)
    + case
        when p_age<=13 and upper(p_rider_country)<>upper(p_offering_country)
        then -10 else 0
      end;
$function$;

revoke all on function private.youth_offer_acceptance_score_v1(
  text,text,integer,integer,integer,integer,integer,integer,integer
) from public,anon,authenticated;

create or replace function public.get_my_youth_incoming_offers_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then return '[]'::jsonb; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',o.id,
      'report_id',o.report_id,
      'rider_id',r.id,
      'rider_name',r.display_name,
      'rider_country_code',r.country_code,
      'rider_age',private.youth_academy_age_v1(r.birth_date),
      'offering_academy_id',o.offering_academy_id,
      'offering_club_name',offering_club.name,
      'offering_country_code',offering_club.country_code,
      'stipend_weekly',o.stipend_weekly,
      'accommodation_weekly',o.accommodation_weekly,
      'compensation_offer',o.compensation_offer,
      'submitted_on',o.submitted_on,
      'status',o.status
    ) order by o.created_at desc),'[]'::jsonb)
    from public.youth_recruitment_offers o
    join public.youth_riders r on r.id=o.target_youth_rider_id
    join public.youth_academies offering_a on offering_a.id=o.offering_academy_id
    join public.clubs offering_club on offering_club.id=offering_a.club_id
    where o.source_academy_id=v_academy_id
      and o.source_academy_decision='pending'
      and o.status='submitted'
  );
end;
$function$;

revoke all on function public.get_my_youth_incoming_offers_v1()
from public,anon;
grant execute on function public.get_my_youth_incoming_offers_v1()
to authenticated;

create or replace function public.respond_to_youth_recruitment_offer_v1(
  p_offer_id uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_offer public.youth_recruitment_offers%rowtype;
  v_report public.youth_scouting_reports%rowtype;
  v_source_academy public.youth_academies%rowtype;
  v_offering_academy public.youth_academies%rowtype;
  v_offering_club public.clubs%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_end_date date:=public.get_game_date_for_season_end(
    coalesce(public.get_current_season_number(),1)
  );
  v_active_count integer;
  v_head_coach_skill integer:=0;
  v_score numeric;
  v_rider_accept boolean:=false;
  v_agreement_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select o.* into v_offer
  from public.youth_recruitment_offers o
  join public.youth_academies source_a on source_a.id=o.source_academy_id
  join public.clubs source_c on source_c.id=source_a.club_id
  where o.id=p_offer_id
    and source_c.owner_user_id=v_user
    and source_c.deleted_at is null
    and o.source_academy_decision='pending'
    and o.status='submitted'
  for update;

  if v_offer.id is null then
    raise exception 'Incoming Youth recruitment offer is no longer pending.';
  end if;

  select * into v_report
  from public.youth_scouting_reports r
  where r.id=v_offer.report_id
  for update;

  select * into v_source_academy
  from public.youth_academies a
  where a.id=v_offer.source_academy_id
  for update;

  select * into v_offering_academy
  from public.youth_academies a
  where a.id=v_offer.offering_academy_id
  for update;

  if not coalesce(p_accept,false) then
    update public.youth_recruitment_offers
    set
      source_academy_decision='rejected',
      status='academy_rejected',
      rejection_reason='The current Academy manager rejected the approach.',
      decided_on=v_game_date
    where id=v_offer.id;

    update public.youth_academy_season_budgets
    set
      committed_amount=greatest(0,committed_amount-v_offer.reserved_amount),
      updated_at=now()
    where academy_id=v_offer.offering_academy_id
      and season_number=v_season;

    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_offer.report_id;

    return public.get_my_youth_incoming_offers_v1();
  end if;

  select count(*) into v_active_count
  from public.youth_riders r
  where r.academy_id=v_offer.offering_academy_id
    and r.status in ('academy','graduating');

  if v_active_count>=16 then
    update public.youth_recruitment_offers
    set
      source_academy_decision='accepted',
      rider_decision='rejected',
      status='rider_rejected',
      rejection_reason='The offering Academy no longer has a free roster place.',
      decided_on=v_game_date
    where id=v_offer.id;

    update public.youth_academy_season_budgets
    set committed_amount=greatest(0,committed_amount-v_offer.reserved_amount),
        updated_at=now()
    where academy_id=v_offer.offering_academy_id
      and season_number=v_season;

    return public.get_my_youth_incoming_offers_v1();
  end if;

  select * into v_offering_club
  from public.clubs c
  where c.id=v_offering_academy.club_id;

  select coalesce(round(
    cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25
  )::integer,0)
  into v_head_coach_skill
  from public.club_staff cs
  where cs.club_id=v_offering_academy.club_id
    and cs.role_type='u16_head_coach'
    and cs.is_active=true
  order by cs.expertise desc
  limit 1;

  v_score:=private.youth_offer_acceptance_score_v1(
    v_offering_club.country_code,
    v_report.country_code,
    v_report.expected_stipend_weekly,
    v_offer.stipend_weekly,
    v_report.suggested_accommodation_weekly,
    v_offer.accommodation_weekly,
    private.youth_academy_age_v1(v_report.birth_date),
    v_head_coach_skill,
    v_offering_academy.reputation
  );

  v_rider_accept:=random()*100<=least(95,greatest(5,v_score));

  if not v_rider_accept then
    update public.youth_recruitment_offers
    set
      source_academy_decision='accepted',
      rider_decision='rejected',
      status='rider_rejected',
      rejection_reason='The rider and family declined the proposed move and support package.',
      decided_on=v_game_date
    where id=v_offer.id;

    update public.youth_academy_season_budgets
    set
      committed_amount=greatest(0,committed_amount-v_offer.reserved_amount),
      updated_at=now()
    where academy_id=v_offer.offering_academy_id
      and season_number=v_season;

    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_offer.report_id;

    return public.get_my_youth_incoming_offers_v1();
  end if;

  update public.youth_rider_agreements
  set status='ended',updated_at=now()
  where youth_rider_id=v_offer.target_youth_rider_id
    and status='active';

  update public.youth_riders
  set
    academy_id=v_offer.offering_academy_id,
    joined_game_date=v_game_date,
    joined_season=v_season,
    status='academy',
    updated_at=now()
  where id=v_offer.target_youth_rider_id;

  insert into public.youth_rider_agreements(
    youth_rider_id,academy_id,stipend_weekly,accommodation_weekly,
    starts_on,ends_on,status
  )
  values(
    v_offer.target_youth_rider_id,v_offer.offering_academy_id,
    v_offer.stipend_weekly,v_offer.accommodation_weekly,
    v_game_date,v_end_date,'active'
  )
  returning id into v_agreement_id;

  update public.youth_academy_season_budgets
  set
    committed_amount=greatest(
      0,
      committed_amount-v_offer.compensation_offer
    ),
    spent_amount=spent_amount+v_offer.compensation_offer,
    updated_at=now()
  where academy_id=v_offer.offering_academy_id
    and season_number=v_season;

  -- Development compensation becomes additional Academy budget for a human
  -- source Academy, making the transfer economically meaningful.
  update public.youth_academy_season_budgets
  set season_budget=season_budget+v_offer.compensation_offer,
      updated_at=now()
  where academy_id=v_offer.source_academy_id
    and season_number=v_season;

  if v_offer.compensation_offer>0 then
    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values
      (
        v_offer.offering_academy_id,v_season,v_game_date,'recruitment',
        'Youth recruitment development compensation',
        -v_offer.compensation_offer,
        jsonb_build_object(
          'offer_id',v_offer.id,
          'youth_rider_id',v_offer.target_youth_rider_id
        )
      ),
      (
        v_offer.source_academy_id,v_season,v_game_date,'development_compensation',
        'Youth rider development compensation received',
        v_offer.compensation_offer,
        jsonb_build_object(
          'offer_id',v_offer.id,
          'youth_rider_id',v_offer.target_youth_rider_id
        )
      );
  end if;

  update public.youth_recruitment_offers
  set
    source_academy_decision='accepted',
    rider_decision='accepted',
    status='accepted',
    decided_on=v_game_date
  where id=v_offer.id;

  update public.youth_scouting_reports
  set status='signed',updated_at=now()
  where id=v_offer.report_id;

  return public.get_my_youth_incoming_offers_v1();
end;
$function$;

revoke all on function public.respond_to_youth_recruitment_offer_v1(uuid,boolean)
from public,anon;
grant execute on function public.respond_to_youth_recruitment_offer_v1(uuid,boolean)
to authenticated;
