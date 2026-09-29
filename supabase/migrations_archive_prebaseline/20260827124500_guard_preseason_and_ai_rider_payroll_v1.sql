-- Prevent weekly rider payroll from running while the game is paused, from
-- charging a Monday before the current season start, or from charging AI clubs
-- whose real finance model is disabled.

alter function public.finance_charge_club_rider_wages(uuid,text,date)
  rename to _finance_charge_club_rider_wages_core_v1;

create or replace function public.finance_charge_club_rider_wages(
  p_club_id uuid,
  p_idempotency_key text,
  p_payroll_date date default null::date
)
returns table(transaction_id uuid,total_wages bigint,rider_count integer)
language plpgsql
security definer
set search_path to 'public','finance','pg_temp'
as $$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
  v_ai_finance_enabled boolean := false;
begin
  select case when c.club_type='developing' then c.parent_club_id else c.id end
  into v_finance_club_id
  from public.clubs c
  where c.id=p_club_id
  limit 1;

  if v_finance_club_id is null then
    raise exception 'Could not resolve finance club for club %',p_club_id;
  end if;

  select coalesce(c.is_ai,false),coalesce(tbp.ai_finance_enabled,false)
  into v_is_ai,v_ai_finance_enabled
  from public.clubs c
  left join public.team_tier_balance_profiles tbp
    on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  where c.id=v_finance_club_id;

  if v_is_ai and not v_ai_finance_enabled then
    return query select null::uuid,0::bigint,0::integer;
    return;
  end if;

  return query
  select * from public._finance_charge_club_rider_wages_core_v1(
    p_club_id,p_idempotency_key,p_payroll_date
  );
end;
$$;

alter function public.finance_process_weekly_rider_wages()
  rename to _finance_process_weekly_rider_wages_core_v1;

create or replace function public.finance_process_weekly_rider_wages()
returns jsonb
language plpgsql
security definer
set search_path to 'public','finance','pg_temp'
as $$
declare
  v_game_paused boolean := false;
  v_clock_paused boolean := false;
  v_current_game_date date;
  v_current_season integer;
  v_season_start date;
  v_iso_dow integer;
  v_payroll_date date;
begin
  select coalesce(gs.is_paused,false),coalesce(gc.is_paused,false)
  into v_game_paused,v_clock_paused
  from public.game_state gs
  join public.game_clock_config gc on gc.id=true
  where gs.id=true;

  if v_game_paused or v_clock_paused then
    return jsonb_build_object(
      'ok',true,'did_run',false,'reason','game_paused','job','weekly_rider_wages'
    );
  end if;

  v_current_game_date:=public.get_current_game_date_date();
  v_current_season:=public.get_current_season_number();

  if v_current_game_date is null or v_current_season is null then
    return jsonb_build_object(
      'ok',false,'did_run',false,'reason','game_date_or_season_missing','job','weekly_rider_wages'
    );
  end if;

  v_season_start:=public.get_game_date_for_season_start(v_current_season);
  v_iso_dow:=extract(isodow from v_current_game_date)::integer;
  v_payroll_date:=(v_current_game_date-(v_iso_dow-1))::date;

  if v_payroll_date < v_season_start then
    return jsonb_build_object(
      'ok',true,
      'did_run',false,
      'reason','payroll_before_season_start',
      'current_game_date',v_current_game_date,
      'current_season',v_current_season,
      'season_start',v_season_start,
      'computed_payroll_date',v_payroll_date,
      'first_valid_payroll_date',v_season_start + ((8-extract(isodow from v_season_start)::integer)%7),
      'job','weekly_rider_wages'
    );
  end if;

  return public._finance_process_weekly_rider_wages_core_v1();
end;
$$;

-- Route any existing direct cron invocation through the guarded/rate-limited
-- entry point. The public processor itself is also protected.
do $$
declare r record;
begin
  for r in
    select jobid from cron.job
    where command='select public.finance_process_weekly_rider_wages();'
  loop
    perform cron.alter_job(
      r.jobid,
      command := 'select public.finance_process_weekly_rider_wages_guarded_v1();'
    );
  end loop;
end;
$$;

insert into finance.transaction_types(
  code,name,category,description,is_user_visible,affects_weekly,is_taxable,tax_rate_bps,created_at,updated_at
)
values
('rider_salary_payday_reset_reversal','Voided Preseason Payroll','system','Compensating entry for an invalid payroll generated before the active season started.',false,false,false,0,now(),now()),
('emergency_loan_reset_reversal','Voided Preseason Emergency Loan','system','Compensating entry for an emergency loan created only because invalid preseason payroll ran against an AI club.',false,false,false,0,now(),now())
on conflict(code) do update set
  category='system',is_user_visible=false,affects_weekly=false,is_taxable=false,tax_rate_bps=0,updated_at=now();
