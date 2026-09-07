create or replace function public.apply_race_commitment_penalty_v1(p_club_id uuid, p_race_id uuid, p_race_team_entry_id uuid, p_event_type text, p_score_delta integer, p_cash_penalty bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_score_before integer;
  v_score_after integer;
  v_inserted_event_id uuid;
begin
  if p_club_id is null then
    return jsonb_build_object('success',false,'error','club_id_required');
  end if;

  insert into public.club_race_commitment_scores(club_id,score,completed_races_count,early_withdrawal_count,late_withdrawal_count,missed_startlist_count,created_at,updated_at)
  values(p_club_id,50,0,0,0,0,now(),now())
  on conflict(club_id) do nothing;

  select score into v_score_before
  from public.club_race_commitment_scores
  where club_id=p_club_id
  for update;

  v_score_after:=greatest(0,least(100,coalesce(v_score_before,50)+coalesce(p_score_delta,0)));

  insert into public.race_commitment_score_events(club_id,race_id,race_team_entry_id,event_type,score_before,score_delta,score_after,cash_penalty,reason,created_at)
  values(p_club_id,p_race_id,p_race_team_entry_id,p_event_type,coalesce(v_score_before,50),coalesce(p_score_delta,0),v_score_after,coalesce(p_cash_penalty,0),p_reason,now())
  on conflict(race_team_entry_id,event_type) do nothing
  returning id into v_inserted_event_id;

  if v_inserted_event_id is null then
    return jsonb_build_object('success',true,'skipped',true,'reason','commitment_event_already_applied','club_id',p_club_id,'race_id',p_race_id,'race_team_entry_id',p_race_team_entry_id,'event_type',p_event_type);
  end if;

  update public.club_race_commitment_scores
  set score=v_score_after,
      completed_races_count=completed_races_count+case when p_event_type='completed_race' then 1 else 0 end,
      missed_startlist_count=missed_startlist_count+case when p_event_type in ('missed_startlist','prestart_disqualification') then 1 else 0 end,
      late_withdrawal_count=late_withdrawal_count+case when p_event_type in ('late_withdrawal','very_late_withdrawal') then 1 else 0 end,
      early_withdrawal_count=early_withdrawal_count+case when p_event_type='early_withdrawal' then 1 else 0 end,
      updated_at=now()
  where club_id=p_club_id;

  return jsonb_build_object('success',true,'skipped',false,'event_id',v_inserted_event_id,'club_id',p_club_id,'race_id',p_race_id,'race_team_entry_id',p_race_team_entry_id,'event_type',p_event_type,'score_before',v_score_before,'score_delta',p_score_delta,'score_after',v_score_after,'cash_penalty',coalesce(p_cash_penalty,0),'finance_summary_direct_update_removed',true);
end;
$function$;

create or replace function public.finance_record_prestart_disqualification_fine_v1(p_commitment_score_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','finance'
as $function$
declare
  v_event record;
  v_race record;
  v_club_account_id uuid;
  v_sink_account_id uuid;
  v_transaction_id uuid;
  v_idempotency_key text;
  v_amount bigint;
begin
  select e.id,e.club_id,e.race_id,e.event_type,e.cash_penalty,e.score_before,e.score_delta,e.score_after,e.reason
  into v_event
  from public.race_commitment_score_events e
  where e.id=p_commitment_score_event_id;

  if v_event.id is null then raise exception 'Commitment score event not found: %',p_commitment_score_event_id; end if;
  if v_event.event_type<>'prestart_disqualification' then raise exception 'Event is not prestart_disqualification: %',p_commitment_score_event_id; end if;

  v_amount:=coalesce(v_event.cash_penalty,0);
  if v_amount<=0 then
    return jsonb_build_object('success',true,'skipped',true,'reason','No cash penalty to charge.','commitment_score_event_id',p_commitment_score_event_id);
  end if;

  v_idempotency_key:='race-prestart-disqualification-fine-'||p_commitment_score_event_id::text;
  select id into v_transaction_id from finance.transactions where idempotency_key=v_idempotency_key and type='race_prestart_disqualification_fine' limit 1;
  if v_transaction_id is not null then
    return jsonb_build_object('success',true,'already_recorded',true,'transaction_id',v_transaction_id,'commitment_score_event_id',p_commitment_score_event_id);
  end if;

  select r.id,r.name into v_race from public.races r where r.id=v_event.race_id;

  select id into v_club_account_id from finance.accounts where club_id=v_event.club_id and currency='CASH' and kind='main' order by created_at limit 1;
  if v_club_account_id is null then
    insert into finance.accounts(club_id,currency,kind) values(v_event.club_id,'CASH','main') returning id into v_club_account_id;
  end if;

  select id into v_sink_account_id from finance.accounts where system_code='race_penalty_sink' and currency='CASH' and kind='system' order by created_at limit 1;
  if v_sink_account_id is null then
    insert into finance.accounts(system_code,currency,kind) values('race_penalty_sink','CASH','system') returning id into v_sink_account_id;
  end if;

  insert into finance.account_balances(account_id,balance)
  values(v_club_account_id,0),(v_sink_account_id,0)
  on conflict(account_id) do nothing;

  insert into finance.transactions(type,idempotency_key,metadata)
  values('race_prestart_disqualification_fine',v_idempotency_key,jsonb_build_object(
    'club_id',v_event.club_id,'race_id',v_event.race_id,'race_name',coalesce(v_race.name,'Race'),
    'commitment_score_event_id',v_event.id,'score_before',v_event.score_before,'score_delta',v_event.score_delta,
    'score_after',v_event.score_after,'cash_penalty',v_amount,'reason',v_event.reason,
    'penalty_equivalence','missed_startlist_no_show','entry_fee_refunded',false
  )) returning id into v_transaction_id;

  insert into finance.entries(transaction_id,account_id,amount,memo)
  values(v_transaction_id,v_club_account_id,-v_amount,'Pre-start disqualification / no-show fine'),
        (v_transaction_id,v_sink_account_id,v_amount,'Pre-start disqualification fine sink');

  update finance.account_balances set balance=balance-v_amount,updated_at=now() where account_id=v_club_account_id;
  update finance.account_balances set balance=balance+v_amount,updated_at=now() where account_id=v_sink_account_id;

  return jsonb_build_object('success',true,'transaction_id',v_transaction_id,'club_id',v_event.club_id,'race_id',v_event.race_id,'amount',v_amount,'commitment_score_event_id',p_commitment_score_event_id);
end;
$function$;

create or replace function public.apply_prestart_disqualification_penalty_v1(p_disqualification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','finance','pg_temp'
as $function$
declare
  d record;
  r record;
  c record;
  e record;
  v_class text;
  v_score_delta integer:=-10;
  v_cash bigint:=0;
  v_commitment jsonb;
  v_event_id uuid;
  v_finance jsonb:='{}'::jsonb;
  v_reason text;
  v_user_id uuid;
begin
  select * into d from public.race_team_stage_disqualifications where id=p_disqualification_id for update;
  if d.id is null then return jsonb_build_object('success',false,'reason','disqualification_not_found'); end if;

  if d.reason_code not in ('mandatory_race_jersey_shortage') then
    return jsonb_build_object('success',true,'skipped',true,'reason','non_controllable_disqualification','reason_code',d.reason_code);
  end if;

  if coalesce((d.metadata->>'penalty_applied')::boolean,false) then
    return jsonb_build_object('success',true,'skipped',true,'reason','penalty_already_marked','disqualification_id',d.id,'metadata',d.metadata);
  end if;

  select r0.id,r0.name,r0.category,to_jsonb(r0) as race_json into r from public.races r0 where r0.id=d.race_id;
  select c0.id,c0.name,c0.owner_user_id,coalesce(c0.is_ai,false) as is_ai into c from public.clubs c0 where c0.id=d.team_id;
  if r.id is null or c.id is null then return jsonb_build_object('success',false,'reason','race_or_team_not_found'); end if;
  if c.is_ai or c.owner_user_id is null then return jsonb_build_object('success',true,'skipped',true,'reason','non_human_team'); end if;

  select rte.* into e from public.race_team_entries rte where rte.race_id=d.race_id and rte.club_id=d.team_id order by rte.updated_at desc nulls last,rte.created_at desc nulls last limit 1;
  if e.id is null then return jsonb_build_object('success',false,'reason','race_team_entry_not_found','race_id',d.race_id,'team_id',d.team_id); end if;

  select coalesce(rer.race_class_code,r.category) into v_class from public.race_entry_rules rer where rer.race_id=d.race_id limit 1;
  v_class:=coalesce(v_class,r.category);

  select coalesce(pr.missed_startlist_score_delta,-10),coalesce(pr.missed_startlist_cash,0)
  into v_score_delta,v_cash
  from public.race_application_penalty_rules pr
  where pr.race_class_code=v_class
  limit 1;
  v_score_delta:=coalesce(v_score_delta,-10);
  v_cash:=coalesce(v_cash,0);

  v_reason:=format('Pre-start disqualification for controllable mandatory race eligibility failure: %s. Penalty equivalent to missed startlist/no-show.',d.reason_code);

  v_commitment:=public.apply_race_commitment_penalty_v1(c.id,r.id,e.id,'prestart_disqualification',v_score_delta,v_cash,v_reason);

  select ev.id into v_event_id
  from public.race_commitment_score_events ev
  where ev.race_team_entry_id=e.id and ev.event_type='prestart_disqualification'
  order by ev.created_at desc limit 1;

  if v_event_id is null then raise exception 'Pre-start disqualification commitment event was not created.'; end if;
  v_finance:=public.finance_record_prestart_disqualification_fine_v1(v_event_id);

  update public.race_team_stage_disqualifications
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'penalty_applied',true,
        'penalty_applied_at',now(),
        'penalty_equivalence','missed_startlist_no_show',
        'commitment_score_event_id',v_event_id,
        'score_delta',v_score_delta,
        'cash_penalty',v_cash,
        'finance_result',v_finance,
        'entry_fee_refunded',false,
        'club_controllable_failure',true
      ),updated_at=now()
  where id=d.id;

  update public.race_team_entries
  set decision_reason=coalesce(nullif(decision_reason,''),'Pre-start disqualification')||format(' No-show-equivalent penalty applied: score %s, cash fine %s. Entry fee remains charged.',v_score_delta,v_cash),
      updated_at=now()
  where id=e.id;

  update public.race_preparations
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'prestart_disqualification_penalty_applied',true,
        'prestart_disqualification_reason',d.reason_code,
        'commitment_score_event_id',v_event_id,
        'score_delta',v_score_delta,
        'cash_penalty',v_cash,
        'entry_fee_refunded',false,
        'penalty_applied_at',now()
      ),updated_at=now()
  where race_id=d.race_id and club_id=d.team_id;

  v_user_id:=c.owner_user_id;
  if v_user_id is not null then
    perform public.create_user_game_notification_v1(
      v_user_id,
      'RACE_PLAN_NEEDS_ATTENTION',
      'Race no-show penalty applied: '||r.name,
      format('%s was removed before/at the race start because a mandatory eligibility requirement was not met. The entry fee remains charged. Cash fine: %s. Commitment score: %s.',c.name,v_cash,case when v_score_delta>=0 then '+'||v_score_delta::text else v_score_delta::text end),
      '/dashboard/race-preparation?tab=acceptedRaces&raceId='||r.id::text,
      jsonb_build_object('event_type','prestart_disqualification','reason_code',d.reason_code,'race_id',r.id,'race_name',r.name,'club_id',c.id,'club_name',c.name,'cash_penalty',v_cash,'score_delta',v_score_delta,'entry_fee_refunded',false,'penalty_equivalence','missed_startlist_no_show','commitment_score_event_id',v_event_id,'finance_result',v_finance),
      'prestart-disqualification-penalty-'||d.id::text,
      null
    );
  end if;

  return jsonb_build_object('success',true,'disqualification_id',d.id,'race_id',r.id,'club_id',c.id,'race_team_entry_id',e.id,'race_class_code',v_class,'score_delta',v_score_delta,'cash_penalty',v_cash,'commitment_score_event_id',v_event_id,'finance_result',v_finance,'entry_fee_refunded',false,'commitment_result',v_commitment);
end;
$function$;

create or replace function public.race_team_stage_disqualification_penalty_trg_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  if new.reason_code in ('mandatory_race_jersey_shortage') then
    begin
      perform public.apply_prestart_disqualification_penalty_v1(new.id);
    exception when others then
      raise warning 'Automatic pre-start disqualification penalty failed for %: %',new.id,sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_race_team_stage_disqualification_penalty_v1 on public.race_team_stage_disqualifications;
create trigger trg_race_team_stage_disqualification_penalty_v1
after insert on public.race_team_stage_disqualifications
for each row execute function public.race_team_stage_disqualification_penalty_trg_v1();

create or replace function public.process_unapplied_prestart_disqualification_penalties_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  x record;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_applied integer:=0;
  v_failed integer:=0;
begin
  for x in
    select d.id from public.race_team_stage_disqualifications d
    join public.clubs c on c.id=d.team_id
    where d.reason_code in ('mandatory_race_jersey_shortage')
      and c.owner_user_id is not null
      and coalesce(c.is_ai,false)=false
      and not coalesce((d.metadata->>'penalty_applied')::boolean,false)
    order by d.created_at
  loop
    begin
      v_result:=public.apply_prestart_disqualification_penalty_v1(x.id);
      if coalesce((v_result->>'success')::boolean,false) and not coalesce((v_result->>'skipped')::boolean,false) then v_applied:=v_applied+1; end if;
      v_results:=v_results||jsonb_build_array(v_result);
    exception when others then
      v_failed:=v_failed+1;
      v_results:=v_results||jsonb_build_array(jsonb_build_object('success',false,'disqualification_id',x.id,'error',sqlerrm,'sqlstate',sqlstate));
    end;
  end loop;
  return jsonb_build_object('status','completed','applied',v_applied,'failed',v_failed,'results',v_results,'ran_at',now());
end;
$function$;