-- Keep first activation aligned to the fixed Tennis-style January calendar.
-- If an Association becomes active after Jan 10, it receives a full replacement
-- election rather than an already-closed annual candidature window.

CREATE OR REPLACE FUNCTION public.ensure_national_coach_election_v1(p_association_id uuid, p_season_number integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_assoc public.national_associations%rowtype;
  v_cfg public.national_association_config%rowtype;
  v_current_season integer;
  v_season integer;
  v_today date:=public.get_current_game_date_date();
  v_existing uuid;
  v_any_previous boolean:=false;
  v_kind text;
  v_reason text;
  v_registration_open date;
  v_registration_close date;
  v_round1_open date;
  v_round1_close date;
  v_id uuid;
begin
  select * into v_assoc
  from public.national_associations
  where id=p_association_id;

  if v_assoc.id is null or v_assoc.status<>'active' then
    return null;
  end if;

  select season_number into v_current_season
  from public.game_state
  where id=true;

  if v_current_season is null then
    raise exception 'Game season is unavailable.';
  end if;

  v_season:=coalesce(p_season_number,v_current_season);

  if v_season<>v_current_season then
    raise exception 'National Coach elections can only be created for the current season.';
  end if;

  select * into v_cfg
  from public.national_association_config
  where id=true;

  select id into v_existing
  from public.national_coach_elections
  where association_id=p_association_id
    and season_number=v_season
    and status in ('candidate_registration','voting','runoff','completed')
  order by created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select exists(
    select 1
    from public.national_coach_elections
    where association_id=p_association_id
  )
  into v_any_previous;

  perform public.carry_forward_national_coach_v1(p_association_id,v_season);

  -- Fixed Tennis-style January window for every Association that is active
  -- while candidature is still open: Jan 1-10 candidature, Jan 10-20 Round 1.
  -- This also applies to the first-ever election, so first activation in early
  -- January does not shift the calendar by an extra day or create a different
  -- voting window.
  v_registration_open:=public.game_date_from_parts(
    v_season,v_cfg.annual_registration_start_month,v_cfg.annual_registration_start_day
  );
  v_registration_close:=public.game_date_from_parts(
    v_season,v_cfg.annual_registration_close_month,v_cfg.annual_registration_close_day
  );
  v_round1_open:=v_registration_close;
  v_round1_close:=public.game_date_from_parts(
    v_season,v_cfg.annual_round1_close_month,v_cfg.annual_round1_close_day
  );

  if v_today<v_registration_close then
    v_kind:='annual';
    v_reason:=case
      when v_any_previous then 'annual_january_election'
      else 'association_activated_january'
    end;
  elsif v_any_previous and v_today<v_round1_close then
    -- An established Association should already have had registration opened
    -- on Jan 1. If maintenance is only catching up after registration closed,
    -- use a replacement election rather than creating an impossible annual
    -- ballot with no candidature window.
    v_kind:='replacement';
    v_reason:='missing_coach_recovery';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  elsif not v_any_previous then
    -- First activation after Jan 10 cannot join a closed annual candidature
    -- window, so open a full replacement election.
    v_kind:='replacement';
    v_reason:='association_activated_after_january_registration';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  else
    -- Annual process was missed after the fixed January window.
    v_kind:='replacement';
    v_reason:='missing_coach_recovery';
    v_registration_open:=v_today;
    v_registration_close:=v_today+v_cfg.activation_registration_days;
    v_round1_open:=v_registration_close;
    v_round1_close:=v_round1_open+v_cfg.activation_voting_days;
  end if;

  insert into public.national_coach_elections(
    association_id,season_number,election_kind,reason,status,
    registration_open_date,registration_close_date,
    round1_open_date,round1_close_date,
    current_round,current_round_open_date,current_round_close_date,
    runoff_registration_open
  )
  values(
    p_association_id,v_season,v_kind,v_reason,'candidate_registration',
    v_registration_open,v_registration_close,
    v_round1_open,v_round1_close,
    1,v_round1_open,v_round1_close,false
  )
  returning id into v_id;

  return v_id;
end;
$function$
;
