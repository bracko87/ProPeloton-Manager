CREATE OR REPLACE FUNCTION public.dry_run_season_transition_notifications_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_timeline uuid; v_run uuid; v_game_before jsonb;
  v_before_notifications bigint; v_before_user_notifications bigint; v_before_inbox_guard bigint; v_before_inbox_messages bigint;
  v_first jsonb; v_second jsonb;
  v_expected_season integer; v_expected_movement integer; v_expected_rider_summary integer; v_expected_staff_summary integer;
  v_actual_season integer; v_actual_movement integer; v_actual_rider_summary integer; v_actual_staff_summary integer;
  v_duplicate_event_keys integer; v_rows_first integer; v_rows_second integer; v_result jsonb;
  v_after_notifications bigint; v_after_user_notifications bigint; v_after_inbox_guard bigint; v_after_inbox_messages bigint; v_after_game jsonb;
begin
  if p_target_season<>p_source_season+1 then raise exception 'target must equal source+1'; end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
  select to_jsonb(gs) into v_game_before from public.game_state gs where id=true;
  select count(*) into v_before_notifications from public.notifications;
  select count(*) into v_before_user_notifications from public.user_notifications;
  select count(*) into v_before_inbox_guard from public.inbox_season_start_guard where season_number=p_target_season;
  select count(*) into v_before_inbox_messages from public.inbox_messages;

  begin
    update public.game_state set season_number=p_target_season,month_number=1,day_number=1,hour_number=0,minute_number=0 where id=true;
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,p_source_season,p_target_season,'running',jsonb_build_object('dry_run','notifications_v2')) returning id into v_run;

    perform public.snapshot_team_rankings_for_season_v1(p_source_season);
    perform public.run_competition_season_transition_v1(v_run,p_source_season,p_target_season);
    perform public.process_rider_contract_season_expiry_v1(v_run,p_source_season,p_target_season);
    perform public.process_staff_contract_season_expiry_v1(v_run,p_source_season,p_target_season);
    update public.season_transition_runs_v1 set status='completed',finished_at=now() where id=v_run;

    select count(distinct c.owner_user_id)::int into v_expected_season
    from public.clubs c where c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and c.deleted_at is null;
    select count(*)::int into v_expected_movement
    from public.competition_transition_movements_v1 m
    join public.clubs c on c.id=m.club_id left join public.clubs p on p.id=c.parent_club_id
    where m.transition_run_id=v_run and m.phase='sporting' and m.movement_type in ('direct_promotion','playoff_promotion','relegated')
      and coalesce(c.owner_user_id,p.owner_user_id) is not null and c.deleted_at is null;
    select count(*)::int into v_expected_rider_summary from (
      select coalesce(c.owner_user_id,p.owner_user_id),a.club_id
      from public.rider_contract_transition_audit_v1 a join public.clubs c on c.id=a.club_id left join public.clubs p on p.id=c.parent_club_id
      where a.transition_run_id=v_run and a.action='contract_expired' and coalesce(c.owner_user_id,p.owner_user_id) is not null and c.deleted_at is null
      group by coalesce(c.owner_user_id,p.owner_user_id),a.club_id
    ) x;
    select count(*)::int into v_expected_staff_summary from (
      select coalesce(c.owner_user_id,p.owner_user_id),a.club_id
      from public.staff_contract_transition_audit_v1 a join public.clubs c on c.id=a.club_id left join public.clubs p on p.id=c.parent_club_id
      where a.transition_run_id=v_run and a.action='staff_contract_expired' and coalesce(c.owner_user_id,p.owner_user_id) is not null and c.deleted_at is null
      group by coalesce(c.owner_user_id,p.owner_user_id),a.club_id
    ) x;

    v_first:=public.run_post_season_transition_notifications_v1(v_run,p_source_season,p_target_season);

    select count(*)::int into v_actual_season from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id where un.deleted_at is null and nt.code='SEASON_STARTED' and n.payload_json->>'transition_run_id'=v_run::text;
    select count(*)::int into v_actual_movement from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id where un.deleted_at is null and nt.code in ('TEAM_PROMOTED','TEAM_RELEGATED') and n.payload_json->>'transition_run_id'=v_run::text;
    select count(*)::int into v_actual_rider_summary from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id where un.deleted_at is null and nt.code='SEASON_RIDER_CONTRACTS_EXPIRED' and n.payload_json->>'transition_run_id'=v_run::text;
    select count(*)::int into v_actual_staff_summary from public.user_notifications un join public.notifications n on n.id=un.notification_id join public.notification_types nt on nt.id=n.type_id where un.deleted_at is null and nt.code='SEASON_STAFF_CONTRACTS_EXPIRED' and n.payload_json->>'transition_run_id'=v_run::text;
    select count(*)::int into v_rows_first from public.user_notifications un join public.notifications n on n.id=un.notification_id where un.deleted_at is null and n.payload_json->>'transition_run_id'=v_run::text;

    v_second:=public.run_post_season_transition_notifications_v1(v_run,p_source_season,p_target_season);
    select count(*)::int into v_rows_second from public.user_notifications un join public.notifications n on n.id=un.notification_id where un.deleted_at is null and n.payload_json->>'transition_run_id'=v_run::text;
    select count(*)::int into v_duplicate_event_keys from (
      select un.user_id,n.payload_json->>'event_key' event_key,count(*)
      from public.user_notifications un join public.notifications n on n.id=un.notification_id
      where un.deleted_at is null and n.payload_json->>'transition_run_id'=v_run::text and n.payload_json->>'event_key' is not null
      group by un.user_id,n.payload_json->>'event_key' having count(*)>1
    ) d;

    v_result:=jsonb_build_object('ok',(v_first->>'ok')::boolean and (v_second->>'ok')::boolean
      and v_actual_season=v_expected_season and v_actual_movement=v_expected_movement
      and v_actual_rider_summary=v_expected_rider_summary and v_actual_staff_summary=v_expected_staff_summary
      and v_rows_second=v_rows_first and v_duplicate_event_keys=0
      and coalesce(v_first->'season_start_inbox'->>'sent','false')::boolean
      and v_second->'season_start_inbox'->>'reason'='already_sent',
      'expected_season_started',v_expected_season,'actual_season_started',v_actual_season,
      'expected_team_movements',v_expected_movement,'actual_team_movements',v_actual_movement,
      'expected_rider_contract_summaries',v_expected_rider_summary,'actual_rider_contract_summaries',v_actual_rider_summary,
      'expected_staff_contract_summaries',v_expected_staff_summary,'actual_staff_contract_summaries',v_actual_staff_summary,
      'first_pass',v_first,'second_pass',v_second,'run_notification_rows_first',v_rows_first,'run_notification_rows_second',v_rows_second,'duplicate_event_keys',v_duplicate_event_keys);

    raise exception using errcode='P0197',message='season_transition_notifications_dry_run_rollback';
  exception when sqlstate 'P0197' then if sqlerrm<>'season_transition_notifications_dry_run_rollback' then raise; end if; end;

  select count(*) into v_after_notifications from public.notifications;
  select count(*) into v_after_user_notifications from public.user_notifications;
  select count(*) into v_after_inbox_guard from public.inbox_season_start_guard where season_number=p_target_season;
  select count(*) into v_after_inbox_messages from public.inbox_messages;
  select to_jsonb(gs) into v_after_game from public.game_state gs where id=true;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('production_restored',jsonb_build_object(
    'notifications_restored',v_after_notifications=v_before_notifications,'user_notifications_restored',v_after_user_notifications=v_before_user_notifications,
    'inbox_guard_restored',v_after_inbox_guard=v_before_inbox_guard,'inbox_messages_restored',v_after_inbox_messages=v_before_inbox_messages,
    'game_state_restored',v_after_game=v_game_before,'dry_run_transition_rows',(select count(*) from public.season_transition_runs_v1 where id=v_run)));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.block_season_transition_protected_write_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if public.season_transition_guard_active_v1() then
    raise exception 'Season transition persistence invariant: % on %.% is forbidden during the atomic transition',tg_op,tg_table_schema,tg_table_name;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_rider_persistence_during_transition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed jsonb;
begin
  if not public.season_transition_guard_active_v1() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='INSERT' then return new; end if;
  if tg_op='DELETE' then
    raise exception 'Season transition persistence invariant: deleting rider % is forbidden',old.id;
  end if;

  -- Do not compare generated columns display_name/overall in a BEFORE trigger.
  -- Their underlying source fields are protected below and PostgreSQL computes
  -- generated values after BEFORE triggers finish.
  v_old:=jsonb_build_object(
    'country_code',old.country_code,'first_name',old.first_name,'last_name',old.last_name,'role',old.role,
    'sprint',old.sprint,'climbing',old.climbing,'time_trial',old.time_trial,'endurance',old.endurance,'flat',old.flat,'recovery',old.recovery,
    'resistance',old.resistance,'race_iq',old.race_iq,'teamwork',old.teamwork,'morale',old.morale,'potential',old.potential,
    'birth_date',old.birth_date,'morale_updated_on',old.morale_updated_on,'low_morale_since',old.low_morale_since,'very_low_morale_since',old.very_low_morale_since,
    'fatigue',old.fatigue,'fatigue_updated_on',old.fatigue_updated_on,'consecutive_heavy_days',old.consecutive_heavy_days
  );
  v_new:=jsonb_build_object(
    'country_code',new.country_code,'first_name',new.first_name,'last_name',new.last_name,'role',new.role,
    'sprint',new.sprint,'climbing',new.climbing,'time_trial',new.time_trial,'endurance',new.endurance,'flat',new.flat,'recovery',new.recovery,
    'resistance',new.resistance,'race_iq',new.race_iq,'teamwork',new.teamwork,'morale',new.morale,'potential',new.potential,
    'birth_date',new.birth_date,'morale_updated_on',new.morale_updated_on,'low_morale_since',new.low_morale_since,'very_low_morale_since',new.very_low_morale_since,
    'fatigue',new.fatigue,'fatigue_updated_on',new.fatigue_updated_on,'consecutive_heavy_days',new.consecutive_heavy_days
  );

  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
  into v_changed
  from jsonb_each(v_new) e
  where (v_old->e.key) is distinct from e.value;

  if v_changed <> '{}'::jsonb then
    raise exception 'Season transition persistence invariant: rider identity/skills/morale/fatigue cannot change during transition (rider %, changed=%)',old.id,v_changed;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_staff_persistence_during_transition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.season_transition_guard_active_v1() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='INSERT' then return new; end if;
  if tg_op='DELETE' then raise exception 'Season transition persistence invariant: deleting club_staff % is forbidden',old.id; end if;
  if (new.club_id,new.role_type,new.specialization,new.team_scope,new.staff_name,new.country_code,
      new.expertise,new.experience,new.potential,new.leadership,new.efficiency,new.loyalty,new.salary_weekly,
      new.first_name,new.last_name,new.birth_date)
     is distinct from
     (old.club_id,old.role_type,old.specialization,old.team_scope,old.staff_name,old.country_code,
      old.expertise,old.experience,old.potential,old.leadership,old.efficiency,old.loyalty,old.salary_weekly,
      old.first_name,old.last_name,old.birth_date) then
    raise exception 'Season transition persistence invariant: staff identity/skills cannot change during transition (staff %)',old.id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_club_persistence_during_transition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.season_transition_guard_active_v1() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='INSERT' then
    raise exception 'Season transition persistence invariant: creating a club during the atomic transition is forbidden';
  end if;
  if tg_op='DELETE' then
    raise exception 'Season transition persistence invariant: hard-deleting club % is forbidden',old.id;
  end if;
  if (new.name,new.country_code,new.club_type,new.parent_club_id,new.is_ai,new.created_at)
     is distinct from
     (old.name,old.country_code,old.club_type,old.parent_club_id,old.is_ai,old.created_at) then
    raise exception 'Season transition persistence invariant: permanent club identity cannot change (club %)',old.id;
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    if not (old.owner_user_id is not null and new.owner_user_id is null and new.deleted_at is not null) then
      raise exception 'Season transition persistence invariant: club ownership may change only as part of explicit season-end soft removal (club %)',old.id;
    end if;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_wallet_persistence_during_transition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_reason text:=coalesce(current_setting('app.season_transition_coin_reason',true),'');
begin
  if not public.season_transition_guard_active_v1() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if v_reason<>'developing_team_season_renewal' then
    raise exception 'Season transition persistence invariant: wallet mutation is forbidden except Developing Team seasonal renewal';
  end if;
  if tg_op='DELETE' then raise exception 'Season transition persistence invariant: wallet deletion is forbidden'; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_coin_ledger_persistence_during_transition_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_reason text:=coalesce(current_setting('app.season_transition_coin_reason',true),'');
begin
  if not public.season_transition_guard_active_v1() then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op<>'INSERT' then raise exception 'Season transition persistence invariant: existing coin ledger rows are immutable'; end if;
  if v_reason<>'developing_team_season_renewal' or new.reason<>'developing_team_season_renewal' then
    raise exception 'Season transition persistence invariant: coin ledger insert is forbidden except Developing Team seasonal renewal';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_season_transition_persistence_guard_status_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_expected integer; v_missing_tables integer; v_missing_triggers integer;
  v_rider_guard boolean; v_staff_guard boolean; v_club_guard boolean; v_wallet_guard boolean; v_coin_guard boolean;
begin
  select count(*) into v_expected from public.season_transition_protected_tables_v1;
  select count(*) into v_missing_tables
  from public.season_transition_protected_tables_v1 x
  where not exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=x.schema_name and c.relname=x.table_name and c.relkind in('r','p')
  );
  select count(*) into v_missing_triggers
  from public.season_transition_protected_tables_v1 x
  where exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=x.schema_name and c.relname=x.table_name and c.relkind in('r','p'))
    and not exists(
      select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where not t.tgisinternal and n.nspname=x.schema_name and c.relname=x.table_name
        and pg_get_triggerdef(t.oid) ilike '%block_season_transition_protected_write_v1%'
    );
  select exists(select 1 from pg_trigger where tgrelid='public.riders'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%guard_rider_persistence_during_transition_v1%') into v_rider_guard;
  select exists(select 1 from pg_trigger where tgrelid='public.club_staff'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%guard_staff_persistence_during_transition_v1%') into v_staff_guard;
  select exists(select 1 from pg_trigger where tgrelid='public.clubs'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%guard_club_persistence_during_transition_v1%') into v_club_guard;
  select exists(select 1 from pg_trigger where tgrelid='public.user_wallets'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%guard_wallet_persistence_during_transition_v1%') into v_wallet_guard;
  select exists(select 1 from pg_trigger where tgrelid='public.user_coin_ledger'::regclass and not tgisinternal and pg_get_triggerdef(oid) ilike '%guard_coin_ledger_persistence_during_transition_v1%') into v_coin_guard;
  return jsonb_build_object('ok',v_missing_tables=0 and v_missing_triggers=0 and v_rider_guard and v_staff_guard and v_club_guard and v_wallet_guard and v_coin_guard,
    'registered_tables',v_expected,'missing_tables',v_missing_tables,'missing_generic_triggers',v_missing_triggers,
    'rider_guard',v_rider_guard,'staff_guard',v_staff_guard,'club_guard',v_club_guard,'wallet_guard',v_wallet_guard,'coin_ledger_guard',v_coin_guard);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.persistence_guard_probe_table_v1(p_schema text, p_table text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_col text; v_sql text;
begin
  select a.attname into v_col
  from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname=p_schema and c.relname=p_table and c.relkind in('r','p') and a.attnum>0 and not a.attisdropped and a.attgenerated=''
  order by a.attnum limit 1;
  if v_col is null then return 'unavailable'; end if;
  v_sql:=format('update %I.%I set %I=%I where ctid=(select ctid from %I.%I limit 1)',p_schema,p_table,v_col,v_col,p_schema,p_table);
  begin
    execute v_sql;
    if not found then return 'empty_table'; end if;
    return 'unexpectedly_allowed';
  exception when others then
    if position('Season transition persistence invariant' in sqlerrm)>0 then return 'blocked'; end if;
    return 'other_error:'||sqlstate||':'||sqlerrm;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_persistence_guard_unit_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_rider uuid; v_staff uuid; v_club uuid; v_user uuid;
  v_rider_blocked boolean:=false; v_staff_blocked boolean:=false; v_club_blocked boolean:=false; v_wallet_blocked boolean:=false;
  v_race text; v_infra text; v_equipment text; v_supply text; v_premium text; v_advisory text; v_health text; v_training text; v_finance text; v_loan text;
  v_guard jsonb;
begin
  v_guard:=public.get_season_transition_persistence_guard_status_v1();
  select id into v_rider from public.riders order by id limit 1;
  select id into v_staff from public.club_staff order by id limit 1;
  select id into v_club from public.clubs where deleted_at is null order by id limit 1;
  select user_id into v_user from public.user_wallets order by user_id limit 1;

  perform set_config('app.season_transition_active','1',true);
  perform set_config('app.season_transition_coin_reason','',true);

  begin
    update public.riders set morale=case when morale>=100 then morale-1 else morale+1 end where id=v_rider;
  exception when others then
    if position('Season transition persistence invariant' in sqlerrm)>0 then v_rider_blocked:=true; else raise; end if;
  end;
  begin
    update public.club_staff set expertise=case when expertise>=100 then expertise-1 else expertise+1 end where id=v_staff;
  exception when others then
    if position('Season transition persistence invariant' in sqlerrm)>0 then v_staff_blocked:=true; else raise; end if;
  end;
  begin
    update public.clubs set name=name||' X' where id=v_club;
  exception when others then
    if position('Season transition persistence invariant' in sqlerrm)>0 then v_club_blocked:=true; else raise; end if;
  end;
  begin
    update public.user_wallets set balance=balance+1 where user_id=v_user;
  exception when others then
    if position('Season transition persistence invariant' in sqlerrm)>0 then v_wallet_blocked:=true; else raise; end if;
  end;

  v_race:=public.persistence_guard_probe_table_v1('public','races');
  v_infra:=public.persistence_guard_probe_table_v1('public','club_infrastructure');
  v_equipment:=public.persistence_guard_probe_table_v1('public','club_equipment_inventory');
  v_supply:=public.persistence_guard_probe_table_v1('public','club_race_supply_units');
  v_premium:=public.persistence_guard_probe_table_v1('public','user_premium_subscriptions');
  v_advisory:=public.persistence_guard_probe_table_v1('public','staff_advisory_access');
  v_health:=public.persistence_guard_probe_table_v1('public','rider_health_cases');
  v_training:=public.persistence_guard_probe_table_v1('public','training_camp_bookings');
  v_finance:=public.persistence_guard_probe_table_v1('finance','account_balances');
  v_loan:=public.persistence_guard_probe_table_v1('finance','emergency_loans');

  perform set_config('app.season_transition_coin_reason','',true);
  perform set_config('app.season_transition_active','0',true);

  return jsonb_build_object('ok',(v_guard->>'ok')::boolean and v_rider_blocked and v_staff_blocked and v_club_blocked and v_wallet_blocked
      and v_race='blocked' and v_infra='blocked' and v_equipment='blocked' and v_supply='blocked' and v_premium='blocked'
      and v_advisory='blocked' and v_health='blocked' and v_training='blocked' and v_finance='blocked' and v_loan='blocked',
    'guard_status',v_guard,'rider_continuous_state_blocked',v_rider_blocked,'staff_skills_blocked',v_staff_blocked,
    'club_identity_blocked',v_club_blocked,'wrong_reason_wallet_blocked',v_wallet_blocked,
    'race_history',v_race,'infrastructure',v_infra,'equipment',v_equipment,'supplies',v_supply,'premium',v_premium,
    'staff_advisory',v_advisory,'health',v_health,'training_camp',v_training,'finance_balance',v_finance,'emergency_loan',v_loan);
exception when others then
  perform set_config('app.season_transition_coin_reason','',true);
  perform set_config('app.season_transition_active','0',true);
  raise;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_developing_team_with_persistence_guard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform set_config('app.season_transition_active','1',true);
  perform set_config('app.season_transition_coin_reason','',true);
  begin
    v_result:=public.dry_run_developing_team_season_transition_v1(1,2);
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
  perform set_config('app.season_transition_coin_reason','',true);
  perform set_config('app.season_transition_active','0',true);
  return v_result||jsonb_build_object('persistence_guard_test',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_ai_roster_with_persistence_guard_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  perform set_config('app.season_transition_active','1',true);
  perform set_config('app.season_transition_coin_reason','',true);
  begin
    v_result:=public.dry_run_ai_roster_season_transition_v1(1,2);
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
  perform set_config('app.season_transition_coin_reason','',true);
  perform set_config('app.season_transition_active','0',true);
  return v_result||jsonb_build_object('persistence_guard_test',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_recent_activity_v1(p_rider_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(activity_date date, source text, activity_type text, intensity text, fatigue_load smallint, recovery_bonus smallint, focus_code text, development_value_base numeric, session_participated boolean, race_id uuid, race_name text, stage_name text, stage_number integer, camp_name text, camp_city text, camp_country_code text, camp_type text, camp_end_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 60);
begin
  if p_rider_id is null then
    raise exception using
      errcode = '22023',
      message = 'rider_id is required';
  end if;

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.club_roster roster
    join public.clubs club
      on club.id = roster.club_id
    left join public.clubs parent
      on parent.id = club.parent_club_id
    where roster.rider_id = p_rider_id
      and (
        club.owner_user_id = v_user_id
        or parent.owner_user_id = v_user_id
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You are not allowed to view activity for this rider.';
  end if;

  return query
  with activity as (
    select
      a.rider_id,
      a.activity_date,
      a.source,
      a.activity_type,
      a.intensity,
      a.fatigue_load,
      a.recovery_bonus,
      a.participated,
      coalesce(a.metadata, '{}'::jsonb) as metadata,
      case
        when coalesce(a.metadata->>'booking_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.metadata->>'booking_id')::uuid
        else null
      end as booking_id,
      case
        when coalesce(a.metadata->>'camp_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.metadata->>'camp_id')::uuid
        else null
      end as camp_id
    from public.rider_daily_activity a
    where a.rider_id = p_rider_id
    order by a.activity_date desc
    limit v_limit
  )
  select
    activity.activity_date,
    activity.source,
    activity.activity_type,
    activity.intensity,
    activity.fatigue_load,
    activity.recovery_bonus,

    nullif(activity.metadata->>'focus_code', '') as focus_code,

    case
      when coalesce(activity.metadata->>'development_value_base', '')
        ~ '^-?[0-9]+(?:\.[0-9]+)?$'
      then (activity.metadata->>'development_value_base')::numeric
      else 0::numeric
    end as development_value_base,

    coalesce(
      case
        when lower(coalesce(activity.metadata->>'session_participated', ''))
          in ('true', 'false')
        then (activity.metadata->>'session_participated')::boolean
        else null
      end,
      activity.participated,
      true
    ) as session_participated,

    case
      when coalesce(activity.metadata->>'race_id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (activity.metadata->>'race_id')::uuid
      else null
    end as race_id,

    nullif(activity.metadata->>'race_name', '') as race_name,
    nullif(activity.metadata->>'stage_name', '') as stage_name,

    case
      when coalesce(activity.metadata->>'stage_number', '') ~ '^[0-9]+$'
      then (activity.metadata->>'stage_number')::integer
      else null
    end as stage_number,

    coalesce(
      nullif(booking.camp_name, ''),
      nullif(catalog.name, ''),
      nullif(activity.metadata->>'camp_name', '')
    ) as camp_name,

    coalesce(
      nullif(booking.city_snapshot, ''),
      nullif(catalog.city_name, ''),
      nullif(activity.metadata->>'city_name', '')
    ) as camp_city,

    coalesce(
      nullif(booking.country_code_snapshot, ''),
      nullif(booking.country_code, ''),
      nullif(catalog.country_code, ''),
      nullif(activity.metadata->>'country_code', '')
    ) as camp_country_code,

    coalesce(
      nullif(booking.camp_type_snapshot, ''),
      nullif(catalog.camp_type, ''),
      nullif(activity.metadata->>'camp_type', '')
    ) as camp_type,

    booking.end_date as camp_end_date

  from activity
  left join public.training_camp_bookings booking
    on booking.id = activity.booking_id
  left join public.training_camp_catalog catalog
    on catalog.id = coalesce(booking.camp_id, activity.camp_id)
  order by activity.activity_date desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.dry_run_developing_team_with_persistence_guard_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_timeline uuid;
  v_run uuid;
  v_main uuid;
  v_owner uuid;
  v_wallet_before integer;
  v_wallet_after_first integer;
  v_wallet_after_second integer;
  v_ledger_before integer;
  v_ledger_after_first integer;
  v_ledger_after_second integer;
  v_access_before jsonb;
  v_access_after_first jsonb;
  v_access_after_second jsonb;
  v_first jsonb;
  v_second jsonb;
  v_prod_wallet_after integer;
  v_prod_ledger_after integer;
  v_prod_access_after jsonb;
  v_ok boolean:=false;
begin
  select a.main_club_id,m.owner_user_id
  into v_main,v_owner
  from public.developing_team_season_access a
  join public.clubs m on m.id=a.main_club_id
  join public.clubs d on d.id=a.developing_club_id
  where a.auto_renew=true and a.active_season=1 and d.deleted_at is null
  order by m.created_at
  limit 1;

  if v_main is null then raise exception 'No live auto-renew Developing Team test row found'; end if;

  select coalesce(w.balance,0) into v_wallet_before from public.user_wallets w where w.user_id=v_owner;
  select count(*) into v_ledger_before from public.user_coin_ledger l
   where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:2';
  select to_jsonb(a) into v_access_before from public.developing_team_season_access a where a.main_club_id=v_main;

  begin
    perform set_config('app.season_transition_active','1',true);
    perform set_config('app.season_transition_coin_reason','',true);

    update public.game_clock_config set is_paused=true where id=true;
    update public.game_state set is_paused=true,season_number=2,month_number=1,day_number=1,hour_number=0,minute_number=0 where id=true;

    select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;
    insert into public.season_transition_runs_v1(timeline_id,source_season,target_season,status,metadata)
    values(v_timeline,1,2,'running',jsonb_build_object('dry_run',true,'component','developing_team_guard_allowed_path_v2'))
    returning id into v_run;

    v_first:=public.run_developing_team_season_transition_v1(v_run,1,2);
    select balance into v_wallet_after_first from public.user_wallets where user_id=v_owner;
    select count(*) into v_ledger_after_first from public.user_coin_ledger l
     where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:2';
    select to_jsonb(a) into v_access_after_first from public.developing_team_season_access a where a.main_club_id=v_main;

    v_second:=public.run_developing_team_season_transition_v1(v_run,1,2);
    select balance into v_wallet_after_second from public.user_wallets where user_id=v_owner;
    select count(*) into v_ledger_after_second from public.user_coin_ledger l
     where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:2';
    select to_jsonb(a) into v_access_after_second from public.developing_team_season_access a where a.main_club_id=v_main;

    v_ok :=
      v_wallet_after_first = v_wallet_before - public.developing_team_renewal_coin_cost_v1()
      and v_wallet_after_second = v_wallet_after_first
      and v_ledger_after_first = v_ledger_before + 1
      and v_ledger_after_second = v_ledger_after_first
      and v_access_after_first->>'access_status'='active'
      and (v_access_after_first->>'active_season')::int=2
      and (v_access_after_first->>'expires_after_season')::int=2
      and v_access_after_second->>'access_status'='active'
      and (v_access_after_second->>'active_season')::int=2;

    raise exception '__ROLLBACK_DEVELOPING_GUARD_V2__';
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    if sqlerrm <> '__ROLLBACK_DEVELOPING_GUARD_V2__' then raise; end if;
  end;

  select coalesce(w.balance,0) into v_prod_wallet_after from public.user_wallets w where w.user_id=v_owner;
  select count(*) into v_prod_ledger_after from public.user_coin_ledger l
   where l.user_id=v_owner and l.payload_json->>'system_key'='developing_team_renewal:'||v_main::text||':season:2';
  select to_jsonb(a) into v_prod_access_after from public.developing_team_season_access a where a.main_club_id=v_main;

  return jsonb_build_object(
    'ok',v_ok,
    'persistence_guard_test',true,
    'renewal_cost',public.developing_team_renewal_coin_cost_v1(),
    'wallet_before',v_wallet_before,
    'wallet_after_first',v_wallet_after_first,
    'wallet_after_second',v_wallet_after_second,
    'ledger_before',v_ledger_before,
    'ledger_after_first',v_ledger_after_first,
    'ledger_after_second',v_ledger_after_second,
    'first_pass',v_first,
    'second_pass',v_second,
    'access_before',v_access_before,
    'access_after_first',v_access_after_first,
    'access_after_second',v_access_after_second,
    'production_restored',jsonb_build_object(
      'wallet_restored',v_prod_wallet_after=v_wallet_before,
      'ledger_restored',v_prod_ledger_after=v_ledger_before,
      'access_restored',v_prod_access_after=v_access_before
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_rider_recent_activity_v2(p_rider_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(activity_date date, source text, activity_type text, intensity text, fatigue_load smallint, recovery_bonus smallint, focus_code text, development_value_base numeric, session_participated boolean, race_id uuid, race_name text, stage_name text, stage_number integer, camp_name text, camp_city text, camp_country_code text, camp_type text, camp_end_date date, race_development_value numeric, race_development_breakdown jsonb, race_development_applied boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 60);
begin
  if p_rider_id is null then
    raise exception using
      errcode = '22023',
      message = 'rider_id is required';
  end if;

  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.club_roster roster
    join public.clubs club
      on club.id = roster.club_id
    left join public.clubs parent
      on parent.id = club.parent_club_id
    where roster.rider_id = p_rider_id
      and (
        club.owner_user_id = v_user_id
        or parent.owner_user_id = v_user_id
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'You are not allowed to view activity for this rider.';
  end if;

  return query
  with activity as (
    select
      a.rider_id,
      a.activity_date,
      a.source,
      a.activity_type,
      a.intensity,
      a.fatigue_load,
      a.recovery_bonus,
      a.participated,
      coalesce(a.metadata, '{}'::jsonb) as metadata,

      case
        when coalesce(a.metadata->>'booking_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.metadata->>'booking_id')::uuid
        else null
      end as booking_id,

      case
        when coalesce(a.metadata->>'camp_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.metadata->>'camp_id')::uuid
        else null
      end as camp_id,

      case
        when coalesce(a.metadata->>'stage_id', '')
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (a.metadata->>'stage_id')::uuid
        else null
      end as stage_id

    from public.rider_daily_activity a
    where a.rider_id = p_rider_id
    order by a.activity_date desc
    limit v_limit
  )
  select
    activity.activity_date,
    activity.source,
    activity.activity_type,
    activity.intensity,
    activity.fatigue_load,
    activity.recovery_bonus,

    nullif(activity.metadata->>'focus_code', '') as focus_code,

    case
      when coalesce(activity.metadata->>'development_value_base', '')
        ~ '^-?[0-9]+(?:\.[0-9]+)?$'
      then (activity.metadata->>'development_value_base')::numeric
      else 0::numeric
    end as development_value_base,

    coalesce(
      case
        when lower(coalesce(activity.metadata->>'session_participated', ''))
          in ('true', 'false')
        then (activity.metadata->>'session_participated')::boolean
        else null
      end,
      activity.participated,
      true
    ) as session_participated,

    case
      when coalesce(activity.metadata->>'race_id', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then (activity.metadata->>'race_id')::uuid
      else null
    end as race_id,

    nullif(activity.metadata->>'race_name', '') as race_name,
    nullif(activity.metadata->>'stage_name', '') as stage_name,

    case
      when coalesce(activity.metadata->>'stage_number', '') ~ '^[0-9]+$'
      then (activity.metadata->>'stage_number')::integer
      else null
    end as stage_number,

    coalesce(
      nullif(booking.camp_name, ''),
      nullif(catalog.name, ''),
      nullif(activity.metadata->>'camp_name', '')
    ) as camp_name,

    coalesce(
      nullif(booking.city_snapshot, ''),
      nullif(catalog.city_name, ''),
      nullif(activity.metadata->>'city_name', '')
    ) as camp_city,

    coalesce(
      nullif(booking.country_code_snapshot, ''),
      nullif(booking.country_code, ''),
      nullif(catalog.country_code, ''),
      nullif(activity.metadata->>'country_code', '')
    ) as camp_country_code,

    coalesce(
      nullif(booking.camp_type_snapshot, ''),
      nullif(catalog.camp_type, ''),
      nullif(activity.metadata->>'camp_type', '')
    ) as camp_type,

    booking.end_date as camp_end_date,

    race_dev.total_progress_points as race_development_value,

    coalesce(
      race_dev.progress_bank_progress_json,
      race_dev.progress_json,
      '{}'::jsonb
    ) as race_development_breakdown,

    coalesce(race_dev.applied_to_progress_bank, false)
      as race_development_applied

  from activity

  left join public.training_camp_bookings booking
    on booking.id = activity.booking_id

  left join public.training_camp_catalog catalog
    on catalog.id = coalesce(booking.camp_id, activity.camp_id)

  left join lateral (
    select
      event.total_progress_points,
      event.progress_json,
      event.progress_bank_progress_json,
      event.applied_to_progress_bank
    from public.rider_race_development_events event
    where event.rider_id = p_rider_id
      and activity.stage_id is not null
      and event.stage_id = activity.stage_id
    order by event.created_at desc, event.id desc
    limit 1
  ) race_dev on true

  order by activity.activity_date desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_staff_advisory_notification_mute_v1(p_report_code text, p_muted boolean)
 RETURNS TABLE(report_code text, is_muted boolean, muted_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_report_code text := lower(btrim(coalesce(p_report_code, '')));
  v_muted boolean := coalesce(p_muted, false);
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_report_code = ''
     or length(v_report_code) > 120
     or v_report_code !~ '^[a-z0-9_]+$'
  then
    raise exception 'Invalid Staff Advisory report code';
  end if;

  insert into public.staff_advisory_notification_mutes as m (
    user_id,
    report_code,
    is_muted,
    muted_at,
    updated_at
  )
  values (
    v_user_id,
    v_report_code,
    v_muted,
    case when v_muted then v_now else null end,
    v_now
  )
  on conflict on constraint staff_advisory_notification_mutes_user_report_uniq
  do update
  set
    is_muted = excluded.is_muted,
    muted_at = case
      when excluded.is_muted then
        coalesce(m.muted_at, excluded.updated_at)
      else null
    end,
    updated_at = excluded.updated_at;

  return query
  select
    m.report_code,
    m.is_muted,
    m.muted_at,
    m.updated_at
  from public.staff_advisory_notification_mutes m
  where m.user_id = v_user_id
    and m.report_code = v_report_code;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_my_staff_advisory_notification_category_v1(p_category_code text, p_enabled boolean)
 RETURNS TABLE(category_code text, is_enabled boolean, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_category text := btrim(coalesce(p_category_code, ''));
  v_enabled boolean := coalesce(p_enabled, true);
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_category not in (
    'trainingReadiness',
    'raceProgrammePreparation',
    'startlistStagePlans',
    'medicalRecovery',
    'equipmentWorkshopSupplies',
    'scoutingRecruitment'
  ) then
    raise exception 'Invalid Staff Advisory notification category';
  end if;

  insert into public.staff_advisory_notification_category_preferences (
    user_id,
    category_code,
    is_enabled,
    updated_at
  )
  values (
    v_user_id,
    v_category,
    v_enabled,
    v_now
  )
  on conflict on constraint staff_advisory_notification_category_preferences_pkey
  do nothing;

  return query
  select
    p.category_code,
    p.is_enabled,
    p.updated_at
  from public.staff_advisory_notification_category_preferences p
  where p.user_id = v_user_id
    and p.category_code = v_category;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_my_staff_advisory_notification_category_v1(p_category_code text, p_enabled boolean)
 RETURNS TABLE(category_code text, is_enabled boolean, affected_report_codes integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_category text := btrim(coalesce(p_category_code, ''));
  v_enabled boolean := coalesce(p_enabled, true);
  v_count integer := 0;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if v_category not in (
    'trainingReadiness',
    'raceProgrammePreparation',
    'startlistStagePlans',
    'medicalRecovery',
    'equipmentWorkshopSupplies',
    'scoutingRecruitment'
  ) then
    raise exception 'Invalid Staff Advisory notification category';
  end if;

  insert into public.staff_advisory_notification_category_preferences as p (
    user_id,
    category_code,
    is_enabled,
    updated_at
  )
  values (
    v_user_id,
    v_category,
    v_enabled,
    v_now
  )
  on conflict on constraint staff_advisory_notification_category_preferences_pkey
  do update
  set
    is_enabled = excluded.is_enabled,
    updated_at = excluded.updated_at;

  insert into public.staff_advisory_notification_mutes as m (
    user_id,
    report_code,
    is_muted,
    muted_at,
    updated_at
  )
  select
    v_user_id,
    codes.report_code,
    not v_enabled,
    case when not v_enabled then v_now else null end,
    v_now
  from public.staff_advisory_notification_category_codes_v1(v_category) codes
  on conflict on constraint staff_advisory_notification_mutes_user_report_uniq
  do update
  set
    is_muted = excluded.is_muted,
    muted_at = case
      when excluded.is_muted then excluded.updated_at
      else null
    end,
    updated_at = excluded.updated_at;

  get diagnostics v_count = row_count;

  return query
  select
    v_category::text,
    v_enabled::boolean,
    v_count::integer,
    v_now::timestamptz;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_competition_target_from_curated_ai_v2(p_target_tier text, p_target_division text, p_needed integer, p_run_id uuid, p_game_season integer, p_game_month integer, p_game_day integer, p_game_hour integer, p_game_minute integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
begin
  if coalesce(p_needed,0) <= 0 then
    return jsonb_build_object('moved',0,'movements','[]'::jsonb);
  end if;

  with source_counts as (
    select 'worldteam'::text source_tier,'WORLD'::text source_division,count(*)::int source_count,25::int source_min
    from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='worldteam'
    union all
    select 'proteam',tier2_division::text,count(*)::int,20
    from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='proteam' group by tier2_division
    union all
    select 'continental',tier3_division::text,count(*)::int,20
    from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='continental' and tier3_division<>'ai_pool' group by tier3_division
    union all
    select 'amateur',amateur_division::text,count(*)::int,10
    from public.clubs where deleted_at is null and is_active=true and club_type='main' and club_tier='amateur' group by amateur_division
  ), roster_counts as (
    select cr.club_id,count(*) filter (where r.availability_status is distinct from 'retired')::int usable_riders
    from public.club_riders cr
    join public.riders r on r.id=cr.rider_id
    group by cr.club_id
  ), base_candidates as (
    select
      c.id,c.name,c.country_code,c.club_tier::text source_tier,
      case when c.club_tier='worldteam' then 'WORLD'
           when c.club_tier='proteam' then c.tier2_division
           when c.club_tier='continental' then c.tier3_division
           else c.amateur_division end as source_division,
      coalesce(c.season_points,0) season_points,
      coalesce(rc.usable_riders,0) usable_riders,
      case when c.club_tier='continental' and c.tier3_division='ai_pool' then 999999
           else greatest(coalesce(sc.source_count,0)-coalesce(sc.source_min,0),0) end as source_surplus,
      case when c.club_tier='continental' and c.tier3_division='ai_pool' then 0
           when p_target_tier='worldteam' and c.club_tier='proteam' then 1
           when p_target_tier='worldteam' and c.club_tier='continental' then 2
           when p_target_tier='worldteam' and c.club_tier='amateur' then 3
           when p_target_tier='proteam' and c.club_tier='continental' then 1
           when p_target_tier='proteam' and c.club_tier='amateur' then 2
           when p_target_tier='continental' and c.club_tier='amateur' then 1
           when p_target_tier='amateur' and c.club_tier='continental' then 1
           when p_target_tier='amateur' and c.club_tier='proteam' then 2
           when p_target_tier='amateur' and c.club_tier='worldteam' then 3
           else 5 end as source_preference
    from public.ai_competition_filler_club_pool_v1 pool
    join public.clubs c on c.id=pool.id
    left join roster_counts rc on rc.club_id=c.id
    left join source_counts sc
      on sc.source_tier=c.club_tier::text
     and sc.source_division=(case when c.club_tier='worldteam' then 'WORLD'
                                  when c.club_tier='proteam' then c.tier2_division
                                  when c.club_tier='continental' then c.tier3_division
                                  else c.amateur_division end)
    where c.owner_user_id is null
      and not public.is_national_team_club_v1(c.id)
      and coalesce(rc.usable_riders,0) >= 8
      and not (
        (p_target_tier='worldteam' and c.club_tier='worldteam')
        or (p_target_tier='proteam' and c.club_tier='proteam' and c.tier2_division=p_target_division)
        or (p_target_tier='continental' and c.club_tier='continental' and c.tier3_division=p_target_division)
        or (p_target_tier='amateur' and c.club_tier='amateur' and c.amateur_division=p_target_division)
      )
      and (
        p_target_tier='worldteam'
        or (p_target_tier='proteam' and public.get_expected_tier2_division_for_country(c.country_code)=p_target_division)
        or (p_target_tier='continental' and public.get_expected_tier3_division_for_country(c.country_code)=p_target_division)
        or (p_target_tier='amateur' and public.safe_get_amateur_division_for_country(c.country_code)=p_target_division)
      )
  ), ranked as (
    select b.*,
      row_number() over(partition by b.source_tier,b.source_division order by b.season_points asc,b.usable_riders desc,lower(b.name),b.id) source_rank
    from base_candidates b
    where b.source_surplus > 0
  ), selected as materialized (
    select *
    from ranked
    where source_rank <= source_surplus
    order by source_preference,season_points asc,usable_riders desc,lower(name),id
    limit greatest(0,p_needed)
  ), updated as (
    update public.clubs c
    set club_tier = case p_target_tier when 'worldteam' then 'worldteam'::club_tier when 'proteam' then 'proteam'::club_tier when 'continental' then 'continental'::club_tier else 'amateur'::club_tier end,
        world_tier = case p_target_tier when 'worldteam' then 1 when 'proteam' then 2 when 'continental' then 3 else 4 end,
        tier2_division = case when p_target_tier='proteam' then p_target_division else null end,
        tier3_division = case when p_target_tier='continental' then p_target_division else null end,
        amateur_division = case when p_target_tier='amateur' then p_target_division else null end,
        season_points=0,
        updated_at=now()
    from selected s
    where c.id=s.id
    returning c.id
  ), audited as (
    insert into public.competition_hourly_ai_fill_audit_v1(
      run_id,game_season,game_month,game_day,game_hour,game_minute,
      club_id,club_name,country_code,source_tier,source_division,target_tier,target_division,
      season_points_before,usable_riders,reason
    )
    select p_run_id,p_game_season,p_game_month,p_game_day,p_game_hour,p_game_minute,
           s.id,s.name,s.country_code,s.source_tier,s.source_division,p_target_tier,p_target_division,
           s.season_points,s.usable_riders,
           'Hourly minimum-size protection: curated AI club moved from a source above its minimum into an underfilled competition.'
    from selected s join updated u on u.id=s.id
    returning club_id
  )
  select jsonb_build_object(
    'moved',count(*)::int,
    'movements',coalesce(jsonb_agg(jsonb_build_object(
      'club_id',s.id,'club_name',s.name,'country_code',s.country_code,
      'from_tier',s.source_tier,'from_division',s.source_division,
      'to_tier',p_target_tier,'to_division',p_target_division,
      'season_points_reset_from',s.season_points,'usable_riders',s.usable_riders
    ) order by s.source_preference,s.season_points,lower(s.name)),'[]'::jsonb)
  ) into v_result
  from selected s join updated u on u.id=s.id;

  return coalesce(v_result,jsonb_build_object('moved',0,'movements','[]'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.snapshot_team_rankings_for_recovery_boundary_v1(p_season integer, p_boundary_real_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_season_year integer;
  v_existing integer;
  v_expected integer;
  v_inserted integer;
begin
  if p_season is null or p_season<=0 then
    raise exception 'season must be positive';
  end if;
  if p_boundary_real_at is null then
    raise exception 'boundary timestamp is required';
  end if;

  v_season_year:=1999+p_season;

  select count(*) into v_existing
  from public.team_ranking_season_snapshots
  where season_number=p_season;
  if v_existing>0 then
    raise exception 'season % already has % snapshot rows',p_season,v_existing;
  end if;

  select count(*) into v_expected
  from public.clubs c
  where c.created_at<=p_boundary_real_at
    and (c.deleted_at is null or c.deleted_at>p_boundary_real_at)
    and c.club_tier::text in('worldteam','proteam','continental','amateur');

  with base as (
    select
      c.id as club_id,c.name as club_name,c.country_code,
      c.club_tier::text as club_tier,
      c.tier2_division::text as tier2_division,
      c.tier3_division::text as tier3_division,
      c.amateur_division::text as amateur_division,
      case
        when c.club_tier::text='worldteam' then 'WORLD'
        when c.club_tier::text='proteam' then c.tier2_division::text
        when c.club_tier::text='continental' then c.tier3_division::text
        when c.club_tier::text='amateur' then c.amateur_division::text
      end as division,
      coalesce(tb.international_points,0)::numeric as international_points,
      coalesce(tb.completed_race_count,0)::integer as completed_race_count,
      coalesce(tb.race_reputation_value,0)::numeric as race_reputation_value,
      coalesce(c.is_ai,false) as is_ai,
      coalesce(c.is_active,true) as is_active
    from public.clubs c
    left join public.team_ranking_tiebreakers_by_season_v1 tb
      on tb.team_id=c.id and tb.season_year=v_season_year
    where c.created_at<=p_boundary_real_at
      and (c.deleted_at is null or c.deleted_at>p_boundary_real_at)
      and c.club_tier::text in('worldteam','proteam','continental','amateur')
  ), ranked as (
    select b.*,
      row_number() over(
        partition by b.club_tier,b.division
        order by b.international_points desc,b.completed_race_count desc,
                 b.race_reputation_value desc,lower(b.club_name),b.club_id
      )::integer as final_position
    from base b
  )
  insert into public.team_ranking_season_snapshots(
    season_number,season_year,division,club_id,club_name,country_code,
    club_tier,tier2_division,tier3_division,amateur_division,
    points,international_points,completed_race_count,race_reputation_value,
    final_position,is_ai,is_active,ranking_version
  )
  select p_season,v_season_year,r.division,r.club_id,r.club_name,r.country_code,
         r.club_tier,r.tier2_division,r.tier3_division,r.amateur_division,
         round(r.international_points)::integer,r.international_points,
         r.completed_race_count,r.race_reputation_value,r.final_position,
         r.is_ai,r.is_active,'canonical_team_ranking_v1'
  from ranked r;

  get diagnostics v_inserted=row_count;
  if v_inserted<>v_expected then
    raise exception 'recovery snapshot inserted %, expected %',v_inserted,v_expected;
  end if;

  return jsonb_build_object('ok',true,'season',p_season,'boundary_real_at',p_boundary_real_at,
    'snapshot_rows',v_inserted,'ranking_version','canonical_team_ranking_v1');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_season_transition_recovery_components_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
declare
  v_race_calendar jsonb; v_retirements jsonb; v_snapshot integer; v_canonical integer;
  v_rankings_history jsonb; v_competition jsonb; v_rider_contracts jsonb; v_staff_contracts jsonb;
  v_ai_rosters jsonb; v_sponsors jsonb; v_developing_team jsonb; v_finances_rewards jsonb; v_result jsonb;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 r where r.id=p_transition_run_id and r.status='running' and r.source_season=p_source_season and r.target_season=p_target_season and coalesce((r.metadata->>'recovery')::boolean,false)=true) then
    raise exception 'matching running recovery transition not found';
  end if;
  if exists(select 1 from public.season_transition_component_readiness_v1 where required=true and status<>'ready') then raise exception 'transition readiness gate is not fully green'; end if;

  select count(*),count(*) filter(where ranking_version='canonical_team_ranking_v1') into v_snapshot,v_canonical
  from public.team_ranking_season_snapshots where season_number=p_source_season;
  if v_snapshot=0 or v_snapshot<>v_canonical then raise exception 'recovery requires a complete canonical source snapshot'; end if;
  update public.season_transition_runs_v1 set snapshot_rows=v_snapshot where id=p_transition_run_id;

  perform set_config('app.season_transition_active','1',true);
  perform set_config('app.season_transition_coin_reason','',true);
  begin
    v_race_calendar:=public.run_race_calendar_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_retirements:=public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    v_rankings_history:=public.run_rankings_history_recovery_v1(p_transition_run_id,p_source_season,p_target_season);
    v_competition:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_rider_contracts:=public.process_rider_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
    v_staff_contracts:=public.process_staff_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
    v_ai_rosters:=public.run_ai_roster_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_sponsors:=public.process_sponsors_for_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_developing_team:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_finances_rewards:=public.run_finances_rewards_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_result:=jsonb_build_object('recovery',true,'race_calendar',v_race_calendar,'retirements',v_retirements,
      'canonical_snapshot_rows',v_snapshot,'rankings_history',v_rankings_history,'competition_transition',v_competition,
      'rider_contracts',v_rider_contracts,'staff_contracts',v_staff_contracts,'ai_rosters',v_ai_rosters,
      'sponsors',v_sponsors,'developing_team',v_developing_team,'finances_rewards',v_finances_rewards,'persistence_guard_active',true);
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    return v_result;
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_team_ranking_past_winners_from_existing_snapshot_v1(p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_snapshot_rows integer;
  v_canonical_rows integer;
  v_divisions integer;
  v_inserted integer:=0;
  v_updated integer:=0;
  v_bad integer;
begin
  if p_season is null or p_season<=0 then raise exception 'season must be positive'; end if;

  select count(*),count(*) filter(where ranking_version='canonical_team_ranking_v1'),count(distinct division)
  into v_snapshot_rows,v_canonical_rows,v_divisions
  from public.team_ranking_season_snapshots
  where season_number=p_season;

  if v_snapshot_rows=0 or v_snapshot_rows<>v_canonical_rows or v_divisions=0 then
    raise exception 'existing canonical snapshot is missing/incomplete for season %',p_season;
  end if;

  select count(*) into v_bad from (
    select division from public.team_ranking_season_snapshots
    where season_number=p_season and final_position=1
    group by division having count(*)<>1
  ) x;
  if v_bad<>0 then raise exception 'snapshot has invalid division winners'; end if;

  with winners as (
    select season_number,division,club_id,club_name,country_code,points
    from public.team_ranking_season_snapshots
    where season_number=p_season and final_position=1
  ), ins as (
    insert into public.team_ranking_past_winners(season_number,division,club_id,club_name,country_code,points)
    select w.season_number,w.division,w.club_id,w.club_name,w.country_code,w.points
    from winners w
    where not exists(select 1 from public.team_ranking_past_winners p where p.season_number=w.season_number and p.division=w.division)
    returning 1
  ) select count(*) into v_inserted from ins;

  with winners as (
    select season_number,division,club_id,club_name,country_code,points
    from public.team_ranking_season_snapshots
    where season_number=p_season and final_position=1
  ), upd as (
    update public.team_ranking_past_winners p
    set club_id=w.club_id,club_name=w.club_name,country_code=w.country_code,points=w.points
    from winners w
    where p.season_number=w.season_number and p.division=w.division
      and (p.club_id,p.club_name,p.country_code,p.points) is distinct from (w.club_id,w.club_name,w.country_code,w.points)
    returning 1
  ) select count(*) into v_updated from upd;

  select count(*) into v_bad
  from public.team_ranking_past_winners p
  join public.team_ranking_season_snapshots s
    on s.season_number=p.season_number and s.division=p.division and s.final_position=1
  where p.season_number=p_season
    and (p.club_id,p.club_name,p.country_code,p.points) is distinct from (s.club_id,s.club_name,s.country_code,s.points);
  if v_bad<>0 then raise exception 'winner history mismatch after recovery sync'; end if;

  if (select count(*) from public.team_ranking_past_winners where season_number=p_season)<>v_divisions then
    raise exception 'winner count mismatch after recovery sync';
  end if;

  return jsonb_build_object('ok',true,'season',p_season,'snapshot_rows',v_snapshot_rows,'division_winners',v_divisions,'inserted',v_inserted,'updated',v_updated,'recovery_existing_snapshot',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.run_rankings_history_recovery_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_year integer:=1999+p_source_season; v_target_year integer:=1999+p_target_season;
  v_sync jsonb; v_source_awards bigint; v_target_awards bigint;
  v_target_team_rows bigint; v_target_team_nonzero bigint; v_target_rider_rankings bigint;
  v_divisions integer; v_bad integer;
begin
  if p_target_season<>p_source_season+1 then raise exception 'target must equal source+1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 where id=p_transition_run_id and source_season=p_source_season and target_season=p_target_season and status='running') then raise exception 'transition run is not running/matching'; end if;
  select count(*) into v_target_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::integer=v_target_year;
  if v_target_awards<>0 then raise exception 'target season already has % ranking award rows',v_target_awards; end if;
  v_sync:=public.sync_team_ranking_past_winners_from_existing_snapshot_v1(p_source_season);
  select count(distinct division) into v_divisions from public.team_ranking_season_snapshots where season_number=p_source_season;
  select count(*) into v_bad from public.team_ranking_past_winners p join public.team_ranking_season_snapshots s on s.season_number=p.season_number and s.division=p.division and s.final_position=1
    where p.season_number=p_source_season and (p.club_id,p.club_name,p.country_code,p.points) is distinct from (s.club_id,s.club_name,s.country_code,s.points);
  if v_bad<>0 then raise exception 'winner history mismatch'; end if;
  select count(*) into v_source_awards from public.race_ranking_point_awards a join public.races r on r.id=a.race_id where extract(year from r.start_date)::integer=v_source_year;
  select count(*) into v_target_team_rows from public.team_international_points_by_season_v1 where season_year=v_target_year;
  select count(*) into v_target_team_nonzero from public.team_international_points_by_season_v1 where season_year=v_target_year and (coalesce(international_points,0)<>0 or coalesce(scoring_rows,0)<>0 or coalesce(scoring_races,0)<>0 or coalesce(scoring_stages,0)<>0);
  select count(*) into v_target_rider_rankings from public.rider_international_points_by_season_v1 where season_year=v_target_year;
  if v_target_team_nonzero<>0 or v_target_rider_rankings<>0 then raise exception 'target rankings are not fresh'; end if;
  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,'source_ranking_award_rows',v_source_awards,
    'target_ranking_award_rows',v_target_awards,'target_team_ranking_rows',v_target_team_rows,'target_team_nonzero_rows',v_target_team_nonzero,
    'target_rider_ranking_rows',v_target_rider_rankings,'division_winners',v_divisions,'winner_sync',v_sync,'recovery_existing_snapshot',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.diagnose_recovery_rewards_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
declare
  v_rank jsonb; v_comp jsonb;
  v_preview_count integer; v_cash bigint; v_user_coins integer;
  v_bad_promo integer; v_structural_promo integer; v_expected_playoff integer; v_actual_playoff integer;
  v_missing jsonb; v_extra jsonb;
begin
  begin
    perform set_config('app.season_transition_active','1',true);
    perform set_config('app.season_transition_coin_reason','',true);
    v_rank:=public.run_rankings_history_recovery_v1(p_transition_run_id,p_source_season,p_target_season);
    v_comp:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);

    select count(*),coalesce(sum(cash_total),0),coalesce(sum(coin_total) filter(where owner_user_id is not null),0)
    into v_preview_count,v_cash,v_user_coins
    from public.run_competition_rewards_v2(p_source_season,true);

    select count(*) into v_actual_playoff
    from public.run_competition_rewards_v2(p_source_season,true) r
    where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'));

    select count(*) into v_expected_playoff
    from public.competition_transition_movements_v1 m
    where m.transition_run_id=p_transition_run_id and m.phase='sporting' and m.movement_type='playoff_promotion';

    select count(*) into v_bad_promo
    from public.run_competition_rewards_v2(p_source_season,true) r
    where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'))
      and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=r.club_id and m.phase='sporting' and m.movement_type='playoff_promotion');

    select count(*) into v_structural_promo
    from public.run_competition_rewards_v2(p_source_season,true) r
    join public.competition_transition_movements_v1 m on m.transition_run_id=p_transition_run_id and m.club_id=r.club_id and m.phase in ('structural_fill','structural_trim')
    where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'));

    select coalesce(jsonb_agg(jsonb_build_object('club_id',m.club_id,'club_name',m.club_name,'source_tier',m.source_tier,'source_division',m.source_division,'target_tier',m.target_tier,'target_division',m.target_division)),'[]'::jsonb)
    into v_missing
    from public.competition_transition_movements_v1 m
    where m.transition_run_id=p_transition_run_id and m.phase='sporting' and m.movement_type='playoff_promotion'
      and not exists(
        select 1 from public.run_competition_rewards_v2(p_source_season,true) r
        where r.club_id=m.club_id
          and exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'))
      );

    select coalesce(jsonb_agg(jsonb_build_object('club_id',r.club_id,'club_name',r.club_name,'reward_details',r.reward_details)),'[]'::jsonb)
    into v_extra
    from public.run_competition_rewards_v2(p_source_season,true) r
    where exists(select 1 from jsonb_array_elements(r.reward_details) d where d->>'code' in ('PRO_PLAYOFF_PROMOTION','CONTINENTAL_PLAYOFF_PROMOTION','AMATEUR_PLAYOFF_PROMOTION'))
      and not exists(select 1 from public.competition_transition_movements_v1 m where m.transition_run_id=p_transition_run_id and m.club_id=r.club_id and m.phase='sporting' and m.movement_type='playoff_promotion');

    raise exception '__ROLLBACK_DIAG_REWARDS__';
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    if sqlerrm<>'__ROLLBACK_DIAG_REWARDS__' then raise; end if;
  end;

  return jsonb_build_object('preview_count',v_preview_count,'cash',v_cash,'user_coins',v_user_coins,
    'expected_playoff',v_expected_playoff,'actual_playoff',v_actual_playoff,'bad_promo',v_bad_promo,
    'structural_promo',v_structural_promo,'missing_playoff_rewards',v_missing,'extra_playoff_rewards',v_extra,
    'rankings',v_rank,'competition',v_comp);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_season_transition_recovery_phase1_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
declare
  v_calendar jsonb; v_ret jsonb; v_rank jsonb; v_comp jsonb; v_rider jsonb; v_staff jsonb;
  v_sponsor jsonb; v_dev jsonb; v_fin jsonb; v_snapshot integer;
begin
  if not exists(select 1 from public.season_transition_runs_v1 r where r.id=p_transition_run_id and r.status='running' and r.source_season=p_source_season and r.target_season=p_target_season and coalesce((r.metadata->>'recovery')::boolean,false)) then
    raise exception 'matching running recovery transition not found';
  end if;
  select count(*) into v_snapshot from public.team_ranking_season_snapshots where season_number=p_source_season and ranking_version='canonical_team_ranking_v1';
  if v_snapshot=0 then raise exception 'canonical recovery snapshot missing'; end if;

  perform set_config('app.season_transition_active','1',true);
  perform set_config('app.season_transition_coin_reason','',true);
  begin
    v_calendar:=public.run_race_calendar_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_ret:=public.run_retirement_season_transition_v1(p_source_season,p_target_season);
    v_rank:=public.run_rankings_history_recovery_v1(p_transition_run_id,p_source_season,p_target_season);
    v_comp:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_rider:=public.process_rider_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
    v_staff:=public.process_staff_contract_season_expiry_v1(p_transition_run_id,p_source_season,p_target_season);
    v_sponsor:=public.process_sponsors_for_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_dev:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    v_fin:=public.run_finances_rewards_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);

    update public.season_transition_runs_v1
    set snapshot_rows=v_snapshot,
        metadata=metadata||jsonb_build_object('recovery_phase1_completed_at',now(),'recovery_phase1',jsonb_build_object(
          'calendar',v_calendar,'retirements',v_ret,'rankings_history',v_rank,'competition',v_comp,
          'rider_contracts',v_rider,'staff_contracts',v_staff,'sponsors',v_sponsor,'developing_team',v_dev,'finances_rewards',v_fin))
    where id=p_transition_run_id;

    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    return jsonb_build_object('ok',true,'snapshot_rows',v_snapshot,'calendar',v_calendar,'retirements',v_ret,'rankings_history',v_rank,
      'competition',v_comp,'rider_contracts',v_rider,'staff_contracts',v_staff,'sponsors',v_sponsor,'developing_team',v_dev,'finances_rewards',v_fin);
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.execute_season_transition_recovery_ai_phase_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
declare
  v_ai jsonb;
begin
  if not exists(select 1 from public.season_transition_runs_v1 r where r.id=p_transition_run_id and r.status='running' and r.source_season=p_source_season and r.target_season=p_target_season and coalesce((r.metadata->>'recovery')::boolean,false)) then
    raise exception 'matching running recovery transition not found';
  end if;
  perform set_config('app.season_transition_active','1',true);
  perform set_config('app.season_transition_coin_reason','',true);
  begin
    v_ai:=public.run_ai_roster_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);
    update public.season_transition_runs_v1
    set metadata=metadata||jsonb_build_object('recovery_ai_phase_completed_at',now(),'recovery_ai_phase',v_ai)
    where id=p_transition_run_id;
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    return jsonb_build_object('ok',true,'ai_rosters',v_ai);
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_early_january_application_window_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare d record;
begin
  if new.race_season_number is not null and new.race_start_month_number=1 and new.race_start_day_number between 1 and 15 then
    select * into d from public.calculate_race_application_deadlines_v1(new.race_season_number,new.race_start_month_number,new.race_start_day_number);
    new.applications_open_season_number:=d.applications_open_season_number;
    new.applications_open_month_number:=d.applications_open_month_number;
    new.applications_open_day_number:=d.applications_open_day_number;
    new.applications_close_season_number:=d.applications_close_season_number;
    new.applications_close_month_number:=d.applications_close_month_number;
    new.applications_close_day_number:=d.applications_close_day_number;
    new.team_list_announcement_season_number:=d.team_list_announcement_season_number;
    new.team_list_announcement_month_number:=d.team_list_announcement_month_number;
    new.team_list_announcement_day_number:=d.team_list_announcement_day_number;
    new.rider_submission_deadline_season_number:=d.rider_submission_deadline_season_number;
    new.rider_submission_deadline_month_number:=d.rider_submission_deadline_month_number;
    new.rider_submission_deadline_day_number:=d.rider_submission_deadline_day_number;
    new.ai_fill_deadline_season_number:=d.ai_fill_deadline_season_number;
    new.ai_fill_deadline_month_number:=d.ai_fill_deadline_month_number;
    new.ai_fill_deadline_day_number:=d.ai_fill_deadline_day_number;
    new.application_window_policy:='season_start_clamped';
    new.application_deadline_policy:='january_early_extended';
    new.rider_submission_deadline:=public.make_game_rule_date_v1(d.rider_submission_deadline_season_number,d.rider_submission_deadline_month_number,d.rider_submission_deadline_day_number);
    new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object('january_early_extended_enforced',true,'january_early_extended_rule','open Jan 1; close/team-list/rider/AI deadline one day before race start');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_staff_contract_expiry_notifications_v1(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_game_date date:=coalesce(p_game_date,public.get_current_game_date_date(),current_date);
  r record;
  v_days integer;
  v_milestone integer;
  v_event_key text;
  v_message text;
  v_created integer:=0;
  v_existing integer:=0;
  v_processed integer:=0;
begin
  for r in
    select c.owner_user_id as user_id,c.id as club_id,c.name as club_name,
           cs.id as staff_id,cs.staff_name,cs.role_type,cs.contract_expires_at
    from public.club_staff cs
    join public.clubs c on c.id=cs.club_id
    where cs.is_active=true
      and c.deleted_at is null
      and coalesce(c.is_ai,false)=false
      and c.owner_user_id is not null
      and cs.contract_expires_at between v_game_date and v_game_date+60
    order by cs.contract_expires_at,cs.staff_name
  loop
    v_processed:=v_processed+1;
    v_days:=greatest(0,r.contract_expires_at-v_game_date);
    v_milestone:=case
      when v_days<=0 then 0
      when v_days<=1 then 1
      when v_days<=3 then 3
      when v_days<=7 then 7
      when v_days<=14 then 14
      when v_days<=30 then 30
      else 60 end;
    v_event_key:='staff_contract_expiring:'||r.staff_id::text||':'||r.contract_expires_at::text||':m'||v_milestone::text;

    if exists(
      select 1 from public.notifications n
      join public.notification_types nt on nt.id=n.type_id
      where nt.code='STAFF_CONTRACT_EXPIRING'
        and n.payload_json->>'event_key'=v_event_key
    ) then
      v_existing:=v_existing+1;
      continue;
    end if;

    v_message:=case
      when v_days=0 then r.staff_name||' ('||r.role_type||') contract expires today. Renew now if you want to keep this staff member.'
      when v_days=1 then r.staff_name||' ('||r.role_type||') contract expires in 1 in-game day. Review extension or replacement immediately.'
      else r.staff_name||' ('||r.role_type||') contract expires in '||v_days||' in-game days. Review extension options and replacement planning.' end;

    perform public.create_infrastructure_notification(
      r.user_id,'STAFF_CONTRACT_EXPIRING','Staff contract expiring: '||r.staff_name,v_message,'/dashboard/staff',
      jsonb_build_object(
        'event_key',v_event_key,'staff_id',r.staff_id,'staff_name',r.staff_name,'role_type',r.role_type,
        'club_id',r.club_id,'club_name',r.club_name,'contract_expires_at',r.contract_expires_at,
        'days_left',v_days,'warning_milestone_days',v_milestone,'warning_policy','60_30_14_7_3_1_0',
        'staff_path','/dashboard/staff'
      )
    );
    v_created:=v_created+1;
  end loop;

  return jsonb_build_object('ok',true,'game_date',v_game_date,'processed_count',v_processed,'created_count',v_created,
    'existing_count',v_existing,'warning_policy','60_30_14_7_3_1_0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_season_transition_source_snapshot_v1(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_year integer:=1999+p_source_season;
  v_snapshot_rows bigint; v_award_rows bigint; v_mismatches bigint;
  v_snapshot_total numeric; v_ledger_total numeric; v_ledger_total_all numeric; v_nonzero_snapshot bigint;
begin
  if p_source_season is null or p_source_season<1 then raise exception 'source season must be positive'; end if;
  select count(*),coalesce(sum(international_points),0),count(*) filter(where coalesce(international_points,0)<>0)
    into v_snapshot_rows,v_snapshot_total,v_nonzero_snapshot
  from public.team_ranking_season_snapshots where season_number=p_source_season;
  if v_snapshot_rows=0 then raise exception 'source season % has no frozen ranking snapshot',p_source_season; end if;

  select count(*),coalesce(sum(a.team_points),0) into v_award_rows,v_ledger_total_all
  from public.race_ranking_point_awards a join public.races r on r.id=a.race_id
  where extract(year from r.start_date)::integer=v_year and a.team_id is not null;

  with ledger as (
    select a.team_id,coalesce(sum(a.team_points),0)::numeric as points
    from public.race_ranking_point_awards a join public.races r on r.id=a.race_id
    where extract(year from r.start_date)::integer=v_year and a.team_id is not null
    group by a.team_id
  ), frozen as (
    select s.club_id,coalesce(s.international_points,0)::numeric snapshot_points,coalesce(l.points,0)::numeric ledger_points
    from public.team_ranking_season_snapshots s left join ledger l on l.team_id=s.club_id
    where s.season_number=p_source_season
  )
  select count(*) filter(where snapshot_points is distinct from ledger_points),coalesce(sum(ledger_points),0)
    into v_mismatches,v_ledger_total
  from frozen;

  if v_mismatches<>0 then raise exception 'source snapshot reconciliation failed: % frozen-club point mismatches for season %',v_mismatches,p_source_season; end if;
  if coalesce(v_snapshot_total,0) is distinct from coalesce(v_ledger_total,0) then
    raise exception 'source snapshot reconciliation failed: frozen snapshot total % differs from frozen-club ledger total % for season %',v_snapshot_total,v_ledger_total,p_source_season;
  end if;
  if v_award_rows>0 and v_ledger_total>0 and v_nonzero_snapshot=0 then
    raise exception 'source snapshot reconciliation failed: frozen clubs have scoring points but snapshot is all zero for season %',p_source_season;
  end if;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'season_year',v_year,
    'snapshot_rows',v_snapshot_rows,'ranking_award_rows_all_teams',v_award_rows,'snapshot_points_total',v_snapshot_total,
    'frozen_club_ledger_points_total',v_ledger_total,'all_award_points_total',v_ledger_total_all,
    'frozen_club_point_mismatches',v_mismatches,'clubs_with_nonzero_points',v_nonzero_snapshot,
    'out_of_snapshot_points',v_ledger_total_all-v_ledger_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_new_season_fresh_state_v1(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_year integer:=1999+p_target_season;
  v_target_awards bigint;
  v_team_nonzero bigint;
  v_rider_rows bigint;
  v_club_points_nonzero bigint;
  v_winner_mismatch bigint;
  v_missing_winners bigint;
  v_bad_structure bigint;
  v_bad_january bigint;
  v_team_rows bigint;
  v_jan_races bigint;
  v_stale_contract_negotiations bigint;
begin
  if p_target_season<>p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select count(*) into v_target_awards
  from public.race_ranking_point_awards a
  join public.races r on r.id=a.race_id
  where extract(year from r.start_date)::integer=v_target_year;

  select count(*) into v_team_rows
  from public.clubs c
  where c.deleted_at is null
    and coalesce(c.club_type,'main')<>'developing'
    and c.club_tier::text in('worldteam','proteam','continental','amateur');

  select count(distinct l.team_id) into v_team_nonzero
  from public.international_points_awards_ledger_v1 l
  where l.season_year=v_target_year
    and l.team_id is not null;

  select count(distinct l.rider_id) into v_rider_rows
  from public.international_points_awards_ledger_v1 l
  where l.season_year=v_target_year
    and l.rider_id is not null;

  select count(*) into v_club_points_nonzero
  from public.clubs c
  where c.deleted_at is null
    and c.club_tier::text in('worldteam','proteam','continental','amateur')
    and coalesce(c.season_points,0)<>0;

  select count(*) into v_winner_mismatch
  from public.team_ranking_past_winners p
  join public.team_ranking_season_snapshots s
    on s.season_number=p.season_number
   and s.division=p.division
   and s.final_position=1
  where p.season_number=p_source_season
    and (p.club_id,p.club_name,p.country_code,p.points)
        is distinct from
        (s.club_id,s.club_name,s.country_code,s.points);

  select count(*) into v_missing_winners
  from (
    select distinct division
    from public.team_ranking_season_snapshots
    where season_number=p_source_season
  ) d
  left join public.team_ranking_past_winners p
    on p.season_number=p_source_season
   and p.division=d.division
  where p.id is null;

  with grouped as (
    select c.club_tier::text tier,
      case
        when c.club_tier::text='worldteam' then 'WORLD'
        when c.club_tier::text='proteam' then c.tier2_division::text
        when c.club_tier::text='continental' then c.tier3_division::text
        when c.club_tier::text='amateur' then c.amateur_division::text
      end division,
      count(*) n
    from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in('worldteam','proteam','continental','amateur')
    group by 1,2
  )
  select count(*) into v_bad_structure
  from grouped
  where division is null
     or (tier='worldteam' and n<>25)
     or (tier='proteam' and n not between 20 and 25)
     or (tier='continental' and n not between 20 and 25)
     or (tier='amateur' and n<10);

  select count(*) into v_jan_races
  from public.races r
  where extract(year from r.start_date)::integer=v_target_year
    and extract(month from r.start_date)::integer=1
    and extract(day from r.start_date)::integer<=15
    and r.status<>'archived';

  select count(*) into v_bad_january
  from public.races r
  left join public.race_entry_rules e on e.race_id=r.id
  where extract(year from r.start_date)::integer=v_target_year
    and extract(month from r.start_date)::integer=1
    and extract(day from r.start_date)::integer<=15
    and r.status<>'archived'
    and (
      e.race_id is null
      or e.applications_open_season_number<>p_target_season
      or e.applications_open_month_number<>1
      or e.applications_open_day_number<>1
      or public.make_game_rule_date_v1(
           e.applications_close_season_number,
           e.applications_close_month_number,
           e.applications_close_day_number
         )<>r.start_date::date-1
      or public.make_game_rule_date_v1(
           e.team_list_announcement_season_number,
           e.team_list_announcement_month_number,
           e.team_list_announcement_day_number
         )<>r.start_date::date-1
      or public.make_game_rule_date_v1(
           e.rider_submission_deadline_season_number,
           e.rider_submission_deadline_month_number,
           e.rider_submission_deadline_day_number
         )<>r.start_date::date-1
      or public.make_game_rule_date_v1(
           e.ai_fill_deadline_season_number,
           e.ai_fill_deadline_month_number,
           e.ai_fill_deadline_day_number
         )<>r.start_date::date-1
    );

  select count(*) into v_stale_contract_negotiations
  from public.season_transition_stale_contract_negotiations_v1(p_source_season);

  if v_target_awards<>0
     or v_team_nonzero<>0
     or v_rider_rows<>0
     or v_club_points_nonzero<>0
     or v_winner_mismatch<>0
     or v_missing_winners<>0
     or v_bad_structure<>0
     or v_bad_january<>0
     or v_stale_contract_negotiations<>0 then
    raise exception 'new season freshness failed: target_awards %, team_nonzero %, rider_rows %, club_points_nonzero %, winner_mismatch %, missing_winners %, bad_structure %, bad_january %, stale_contract_negotiations %',
      v_target_awards,v_team_nonzero,v_rider_rows,v_club_points_nonzero,
      v_winner_mismatch,v_missing_winners,v_bad_structure,v_bad_january,
      v_stale_contract_negotiations;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'target_team_rows',v_team_rows,
    'target_team_nonzero_rows',v_team_nonzero,
    'target_rider_ranking_rows',v_rider_rows,
    'target_ranking_award_rows',v_target_awards,
    'clubs_with_nonzero_season_points',v_club_points_nonzero,
    'winner_mismatches',v_winner_mismatch,
    'missing_past_winners',v_missing_winners,
    'bad_competition_structure_groups',v_bad_structure,
    'early_january_races',v_jan_races,
    'bad_early_january_rules',v_bad_january,
    'stale_open_contract_negotiations',v_stale_contract_negotiations,
    'ranking_freshness_source','international_points_awards_ledger_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_execute_v2(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_mode text DEFAULT 'live'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_calendar jsonb;
  v_retirements jsonb;
  v_snapshot_rows integer;
  v_snapshot_check jsonb;
  v_history jsonb;
  v_competition jsonb;
  v_rider_contracts jsonb;
  v_staff_contracts jsonb;
  v_contract_negotiations jsonb;
  v_ai jsonb;
  v_sponsors jsonb;
  v_developing jsonb;
  v_rewards_preflight jsonb;
  v_fresh jsonb;
  v_report jsonb;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'Season transition requires target = source + 1';
  end if;

  if p_mode not in ('live','lab','recovery') then
    raise exception 'Unsupported season transition mode: %', p_mode;
  end if;

  if not exists (
    select 1
    from public.season_transition_runs_v1 r
    where r.id = p_transition_run_id
      and r.source_season = p_source_season
      and r.target_season = p_target_season
      and r.status = 'running'
  ) then
    raise exception 'Running transition record not found or does not match source/target';
  end if;

  if exists (
    select 1
    from public.season_transition_component_readiness_v1
    where required = true
      and status <> 'ready'
  ) then
    raise exception 'Season transition readiness gate is not fully green';
  end if;

  perform set_config('app.season_transition_active','0',true);
  perform set_config('app.season_transition_coin_reason','',true);

  begin
    if not exists (
      select 1 from public.races r
      where extract(year from r.start_date)::integer = 1999 + p_target_season
        and r.metadata->>'calendar_source_season' = p_source_season::text
    ) then
      perform public.prepare_next_season_race_calendar_v1(p_source_season,p_target_season,true);
    end if;

    v_calendar := public.run_race_calendar_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    perform set_config('app.season_transition_active','1',true);

    v_snapshot_rows := public.snapshot_team_rankings_for_season_v1(p_source_season);
    v_snapshot_check := public.verify_season_transition_source_snapshot_v1(p_source_season);

    update public.season_transition_runs_v1
    set snapshot_rows = v_snapshot_rows,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'engine_version',2,
          'engine_mode',p_mode,
          'source_snapshot_reconciliation',v_snapshot_check
        )
    where id = p_transition_run_id;

    v_history := public.run_rankings_history_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_retirements := public.run_retirement_season_transition_v1(
      p_source_season,p_target_season
    );

    v_competition := public.run_competition_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_rider_contracts := public.process_rider_contract_season_expiry_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_staff_contracts := public.process_staff_contract_season_expiry_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_contract_negotiations := public.cleanup_stale_contract_negotiations_for_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_ai := public.run_ai_roster_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_sponsors := public.process_sponsors_for_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_developing := public.run_developing_team_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_rewards_preflight := public.run_finances_rewards_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_fresh := public.verify_new_season_fresh_state_v1(
      p_source_season,p_target_season
    );

    v_report := jsonb_build_object(
      'ok',true,
      'engine_version',2,
      'mode',p_mode,
      'source_season',p_source_season,
      'target_season',p_target_season,
      'calendar',v_calendar,
      'canonical_snapshot_rows',v_snapshot_rows,
      'source_snapshot_reconciliation',v_snapshot_check,
      'rankings_history',v_history,
      'retirements',v_retirements,
      'competition',v_competition,
      'rider_contracts',v_rider_contracts,
      'staff_contracts',v_staff_contracts,
      'contract_negotiations',v_contract_negotiations,
      'ai_rosters',v_ai,
      'sponsors',v_sponsors,
      'developing_team',v_developing,
      'rewards_preflight',v_rewards_preflight,
      'new_season_fresh_state',v_fresh
    );

    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    return v_report;
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_simulate_v1(p_source_season integer, p_target_season integer, p_seed double precision DEFAULT 0.271828)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  raise exception
    'season_transition_lab_simulate_v1 is disabled. Use season_transition_lab_simulate_v2(checkpoint_id, seed), which requires an exact READY Dec-31 checkpoint.';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_assert_pair_v2(p_source_season integer, p_target_season integer)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  if p_source_season is null or p_source_season <= 0 then
    raise exception 'source season must be a positive integer';
  end if;
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1 (source %, target %)', p_source_season, p_target_season;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_source_fingerprint_v2(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_year integer;
  v_snapshot_rows integer;
  v_snapshot_points numeric;
  v_snapshot_hash text;
  v_winner_rows integer;
  v_winner_hash text;
  v_snapshot_verify jsonb;
  v_verify_error text;
begin
  perform public.season_transition_engine_assert_pair_v2(p_source_season,p_source_season+1);
  v_year := public.game_year_from_season(p_source_season);

  select count(*)::integer,
         coalesce(sum(s.international_points),0),
         md5(coalesce(string_agg(
           concat_ws('|',
             s.division,
             s.club_id::text,
             s.final_position::text,
             coalesce(s.international_points,0)::text,
             coalesce(s.completed_race_count,0)::text,
             coalesce(s.race_reputation_value,0)::text,
             coalesce(s.club_tier,''),
             coalesce(s.tier2_division,''),
             coalesce(s.tier3_division,''),
             coalesce(s.amateur_division,'')
           ),
           '||' order by s.division,s.final_position,s.club_id
         ),''))
  into v_snapshot_rows,v_snapshot_points,v_snapshot_hash
  from public.team_ranking_season_snapshots s
  where s.season_number=p_source_season;

  select count(*)::integer,
         md5(coalesce(string_agg(
           concat_ws('|',w.division,w.club_id::text,coalesce(w.points,0)::text),
           '||' order by w.division,w.club_id
         ),''))
  into v_winner_rows,v_winner_hash
  from public.team_ranking_past_winners w
  where w.season_number=p_source_season;

  if v_snapshot_rows > 0 then
    begin
      v_snapshot_verify := public.verify_season_transition_source_snapshot_v1(p_source_season);
    exception when others then
      v_verify_error := sqlerrm;
      v_snapshot_verify := jsonb_build_object('ok',false,'error',v_verify_error);
    end;
  else
    v_snapshot_verify := jsonb_build_object('ok',false,'reason','source_snapshot_missing');
  end if;

  return jsonb_build_object(
    'source_season',p_source_season,
    'source_year',v_year,
    'snapshot_rows',v_snapshot_rows,
    'snapshot_points',v_snapshot_points,
    'snapshot_hash',v_snapshot_hash,
    'winner_rows',v_winner_rows,
    'winner_hash',v_winner_hash,
    'snapshot_verification',v_snapshot_verify
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_live_fingerprint_v2(p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_year integer;
  v_competition_hash text;
  v_roster_hash text;
  v_contract_hash text;
  v_team_points_nonzero integer;
  v_rider_points_nonzero integer;
  v_target_awards integer;
  v_live_clubs integer;
  v_roster_rows integer;
  v_active_contracts integer;
begin
  if p_target_season is null or p_target_season <= 0 then
    raise exception 'target season must be positive';
  end if;
  v_target_year := public.game_year_from_season(p_target_season);

  select count(*)::integer,
         md5(coalesce(string_agg(
           concat_ws('|',
             c.id::text,
             c.club_tier::text,
             coalesce(c.tier2_division::text,''),
             coalesce(c.tier3_division::text,''),
             coalesce(c.amateur_division::text,''),
             coalesce(c.is_active,true)::text,
             coalesce(c.is_ai,false)::text
           ),
           '||' order by c.id
         ),''))
  into v_live_clubs,v_competition_hash
  from public.clubs c
  where c.deleted_at is null
    and c.club_tier::text in ('worldteam','proteam','continental','amateur');

  select count(*)::integer,
         md5(coalesce(string_agg(
           concat_ws('|',cr.club_id::text,cr.rider_id::text,coalesce(cr.assigned_role::text,'')),
           '||' order by cr.club_id,cr.rider_id
         ),''))
  into v_roster_rows,v_roster_hash
  from public.club_riders cr
  join public.clubs c on c.id=cr.club_id
  where c.deleted_at is null;

  select count(*)::integer,
         md5(coalesce(string_agg(
           concat_ws('|',rc.rider_id::text,rc.club_id::text,rc.start_season_number::text,rc.end_season_number::text,rc.status::text),
           '||' order by rc.rider_id,rc.club_id,rc.id
         ),''))
  into v_active_contracts,v_contract_hash
  from public.rider_contracts rc
  where rc.status='active';

  select count(*)::integer into v_team_points_nonzero
  from public.team_international_points_by_season_v1 t
  where t.season_year=v_target_year and coalesce(t.international_points,0)<>0;

  select count(*)::integer into v_rider_points_nonzero
  from public.rider_international_points_by_season_v1 r
  where r.season_year=v_target_year and coalesce(r.international_points,0)<>0;

  select count(*)::integer into v_target_awards
  from public.race_ranking_point_awards a
  join public.races rr on rr.id=a.race_id
  where extract(year from rr.start_date)::integer=v_target_year;

  return jsonb_build_object(
    'target_season',p_target_season,
    'target_year',v_target_year,
    'live_competition_clubs',v_live_clubs,
    'competition_hash',v_competition_hash,
    'roster_rows',v_roster_rows,
    'roster_hash',v_roster_hash,
    'active_contracts',v_active_contracts,
    'active_contract_hash',v_contract_hash,
    'team_points_nonzero',v_team_points_nonzero,
    'rider_points_nonzero',v_rider_points_nonzero,
    'target_ranking_awards',v_target_awards
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_preflight_v2(p_source_season integer, p_target_season integer, p_mode text DEFAULT 'lab'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_live_season integer;
  v_live_date date;
  v_source_end date;
  v_target_start date;
  v_readiness jsonb;
  v_persistence jsonb;
  v_source_fingerprint jsonb;
  v_live_fingerprint jsonb;
  v_ready_components boolean;
  v_guard_ok boolean;
  v_snapshot_exists boolean;
  v_checkpoint_ready boolean := false;
  v_checkpoint_count integer := 0;
  v_pair_ok boolean := true;
  v_mode_ok boolean;
  v_context_ok boolean;
  v_errors jsonb := '[]'::jsonb;
begin
  begin
    perform public.season_transition_engine_assert_pair_v2(p_source_season,p_target_season);
  exception when others then
    v_pair_ok := false;
    v_errors := v_errors || jsonb_build_array(sqlerrm);
  end;

  v_mode_ok := p_mode in ('production','lab');
  if not v_mode_ok then
    v_errors := v_errors || jsonb_build_array('mode must be production or lab');
  end if;

  v_source_end := public.get_game_date_for_season_end(p_source_season);
  v_target_start := public.get_game_date_for_season_start(p_target_season);
  v_live_season := public.get_current_season_number();
  v_live_date := public.get_current_game_date_date();
  v_readiness := public.get_season_transition_preflight_v1();
  v_persistence := public.get_season_transition_persistence_guard_status_v1();
  v_source_fingerprint := public.season_transition_engine_source_fingerprint_v2(p_source_season);
  v_live_fingerprint := public.season_transition_engine_live_fingerprint_v2(p_target_season);

  v_ready_components := coalesce((v_readiness->>'ready_for_arming')::boolean,false);
  v_guard_ok := coalesce((v_persistence->>'ok')::boolean,false);
  v_snapshot_exists := coalesce((v_source_fingerprint->>'snapshot_rows')::integer,0) > 0;

  select count(*)::integer,
         coalesce(bool_or(c.status='ready'),false)
  into v_checkpoint_count,v_checkpoint_ready
  from public.season_transition_lab_checkpoints_v1 c
  where c.source_season=p_source_season
    and c.source_end_date=v_source_end
    and c.status in ('registered','ready');

  -- Context requirements are intentionally different:
  -- production freeze must happen while source season is still live;
  -- lab mode requires an exact isolated checkpoint and may be inspected from another live season.
  if p_mode='production' then
    v_context_ok := v_live_season=p_source_season and v_live_date=v_source_end;
  else
    v_context_ok := v_checkpoint_ready;
  end if;

  return jsonb_build_object(
    'ok',v_pair_ok and v_mode_ok and v_ready_components and v_guard_ok and v_context_ok,
    'pair_ok',v_pair_ok,
    'mode',p_mode,
    'mode_ok',v_mode_ok,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'source_end_date',v_source_end,
    'target_start_date',v_target_start,
    'live_season',v_live_season,
    'live_game_date',v_live_date,
    'component_readiness_ok',v_ready_components,
    'persistence_guard_ok',v_guard_ok,
    'source_snapshot_exists',v_snapshot_exists,
    'exact_checkpoint_candidates',v_checkpoint_count,
    'exact_checkpoint_ready',v_checkpoint_ready,
    'context_ok',v_context_ok,
    'source_fingerprint',v_source_fingerprint,
    'live_fingerprint',v_live_fingerprint,
    'readiness',v_readiness,
    'persistence',v_persistence,
    'errors',v_errors
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_register_checkpoint_v1(p_label text, p_source_season integer, p_restore_method text, p_external_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_end date;
begin
  if p_label is null or btrim(p_label)='' then
    raise exception 'checkpoint label is required';
  end if;
  if p_source_season is null or p_source_season<=0 then
    raise exception 'source season must be positive';
  end if;
  if p_restore_method not in ('pitr_clone','database_clone','schema_snapshot','external_restore') then
    raise exception 'unsupported restore method %',p_restore_method;
  end if;
  v_end := public.get_game_date_for_season_end(p_source_season);

  insert into public.season_transition_lab_checkpoints_v1(
    label,source_season,source_end_date,restore_method,external_reference,status,notes
  ) values(
    p_label,p_source_season,v_end,p_restore_method,p_external_reference,'registered',p_notes
  )
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_mark_checkpoint_ready_v1(p_checkpoint_id uuid, p_baseline_fingerprint jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists(select 1 from public.season_transition_lab_checkpoints_v1 where id=p_checkpoint_id) then
    raise exception 'checkpoint not found';
  end if;
  if p_baseline_fingerprint is null then
    raise exception 'baseline fingerprint is required';
  end if;

  update public.season_transition_lab_checkpoints_v1
  set status='ready',
      baseline_fingerprint=p_baseline_fingerprint,
      verified_at=now(),
      updated_at=now()
  where id=p_checkpoint_id;

  return jsonb_build_object('ok',true,'checkpoint_id',p_checkpoint_id,'status','ready');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_create_run_v2(p_source_season integer, p_target_season integer, p_mode text, p_checkpoint_id uuid DEFAULT NULL::uuid, p_random_seed double precision DEFAULT NULL::double precision, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_preflight jsonb;
  v_source_end date;
  v_target_start date;
begin
  perform public.season_transition_engine_assert_pair_v2(p_source_season,p_target_season);
  if p_mode not in ('production','lab') then raise exception 'mode must be production or lab'; end if;
  if p_mode='lab' and p_checkpoint_id is null then raise exception 'lab run requires checkpoint_id'; end if;
  if p_mode='lab' and not exists(
    select 1 from public.season_transition_lab_checkpoints_v1 c
    where c.id=p_checkpoint_id and c.source_season=p_source_season and c.status='ready'
  ) then
    raise exception 'lab checkpoint is not ready for source season %',p_source_season;
  end if;

  v_preflight := public.season_transition_engine_preflight_v2(p_source_season,p_target_season,p_mode);
  if not coalesce((v_preflight->>'ok')::boolean,false) then
    raise exception 'v2 preflight is not green: %',v_preflight::text;
  end if;

  v_source_end := public.get_game_date_for_season_end(p_source_season);
  v_target_start := public.get_game_date_for_season_start(p_target_season);

  insert into public.season_transition_engine_runs_v2(
    source_season,target_season,mode,status,source_end_date,target_start_date,
    checkpoint_id,random_seed,note,source_fingerprint,metadata
  ) values(
    p_source_season,p_target_season,p_mode,'created',v_source_end,v_target_start,
    p_checkpoint_id,p_random_seed,p_note,v_preflight->'source_fingerprint',
    jsonb_build_object('preflight',v_preflight,'phase1_only',true)
  ) returning id into v_id;

  insert into public.season_transition_engine_events_v2(run_id,phase,event_type,payload)
  values(v_id,'created','run_created',jsonb_build_object('mode',p_mode,'preflight',v_preflight));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_checkpoint_fingerprint_v2(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_season integer := p_source_season + 1;
  v_source_year integer;
  v_target_year integer;
  v_game_state jsonb;
  v_clubs jsonb;
  v_rosters jsonb;
  v_riders jsonb;
  v_contracts jsonb;
  v_free_agents jsonb;
  v_staff jsonb;
  v_staff_market jsonb;
  v_sponsors jsonb;
  v_sponsor_offers jsonb;
  v_technical jsonb;
  v_developing jsonb;
  v_wallets jsonb;
  v_coin_ledger jsonb;
  v_retirements jsonb;
  v_finance_balances jsonb;
  v_loans jsonb;
  v_calendar jsonb;
  v_preseason_ops jsonb;
  v_snapshot jsonb;
begin
  perform public.season_transition_engine_assert_pair_v2(p_source_season,v_target_season);
  v_source_year := public.game_year_from_season(p_source_season);
  v_target_year := public.game_year_from_season(v_target_season);

  select jsonb_build_object(
    'season_number',g.season_number,
    'month_number',g.month_number,
    'day_number',g.day_number,
    'hour_number',g.hour_number,
    'minute_number',g.minute_number,
    'tick_version',g.tick_version,
    'is_paused',g.is_paused
  ) into v_game_state
  from public.game_state g where g.id=true;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',
      c.id::text,coalesce(c.owner_user_id::text,''),c.name,coalesce(c.country_code,''),
      coalesce(c.club_tier::text,''),coalesce(c.tier2_division::text,''),coalesce(c.tier3_division::text,''),
      coalesce(c.amateur_division::text,''),coalesce(c.club_type,''),coalesce(c.parent_club_id::text,''),
      coalesce(c.max_promotion_tier,''),coalesce(c.is_ai,false)::text,coalesce(c.is_active,true)::text,
      coalesce(c.deleted_at::text,''),coalesce(c.season_points,0)::text,coalesce(c.cash_balance,0)::text,
      coalesce(c.inactivity_status,''),coalesce(c.inactivity_days_snapshot,0)::text,
      coalesce(c.season_end_transition_pending,false)::text,coalesce(c.inactivity_season_end_action,'')
    ),'||' order by c.id),'')))
  into v_clubs from public.clubs c;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',cr.club_id::text,cr.rider_id::text,coalesce(cr.assigned_role::text,'')),
      '||' order by cr.club_id,cr.rider_id),'')))
  into v_rosters from public.club_riders cr;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',
      r.id::text,coalesce(r.country_code,''),coalesce(r.first_name,''),coalesce(r.last_name,''),coalesce(r.role::text,''),
      coalesce(r.birth_date::text,''),coalesce(r.sprint,0)::text,coalesce(r.climbing,0)::text,coalesce(r.time_trial,0)::text,
      coalesce(r.endurance,0)::text,coalesce(r.flat,0)::text,coalesce(r.recovery,0)::text,coalesce(r.resistance,0)::text,
      coalesce(r.race_iq,0)::text,coalesce(r.teamwork,0)::text,coalesce(r.morale,0)::text,coalesce(r.potential,0)::text,
      coalesce(r.availability_status::text,''),coalesce(r.contract_expires_season,0)::text,coalesce(r.contract_expires_at::text,''),
      coalesce(r.market_value,0)::text,coalesce(r.salary,0)::text
    ),'||' order by r.id),'')))
  into v_riders from public.riders r;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'active_rows',count(*) filter(where rc.status::text='active')::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',
      rc.id::text,rc.rider_id::text,rc.club_id::text,rc.status::text,coalesce(rc.salary_weekly,0)::text,
      coalesce(rc.starts_on::text,''),coalesce(rc.expires_on::text,''),coalesce(rc.start_season_number,0)::text,
      coalesce(rc.end_season_number,0)::text,coalesce(rc.acquisition_type::text,'')
    ),'||' order by rc.id),'')))
  into v_contracts from public.rider_contracts rc;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'available_rows',count(*) filter(where fa.status='available')::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',fa.id::text,fa.rider_id::text,coalesce(fa.source_type,''),
      coalesce(fa.source_club_id::text,''),coalesce(fa.desired_tier::text,''),coalesce(fa.status,''),
      coalesce(fa.available_from_game_date::text,''),coalesce(fa.expires_on_game_date::text,'')),
      '||' order by fa.id),'')))
  into v_free_agents from public.rider_free_agents fa;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'active_rows',count(*) filter(where cs.is_active)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',cs.id::text,cs.club_id::text,coalesce(cs.role_type::text,''),
      coalesce(cs.staff_name,''),coalesce(cs.contract_expires_at::text,''),coalesce(cs.is_active,false)::text,
      coalesce(cs.salary_weekly,0)::text), '||' order by cs.id),'')))
  into v_staff from public.club_staff cs;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'available_rows',count(*) filter(where sc.is_available)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',sc.id::text,coalesce(sc.role_type::text,''),coalesce(sc.staff_name,''),
      coalesce(sc.is_available,false)::text,coalesce(sc.salary_weekly,0)::text,coalesce(sc.market_region,'')),
      '||' order by sc.id),'')))
  into v_staff_market from public.staff_candidates sc;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'source_active',count(*) filter(where s.season_number=p_source_season and s.status='active')::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',s.id::text,s.club_id::text,s.season_number::text,
      coalesce(s.company_id::text,''),coalesce(s.sponsor_kind::text,''),coalesce(s.status,''),coalesce(s.is_main,false)::text,
      coalesce(s.guaranteed_amount,0)::text,coalesce(s.bonus_pool_amount,0)::text),
      '||' order by s.id),'')))
  into v_sponsors from public.club_sponsors s;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'source_open',count(*) filter(where o.season_number=p_source_season and o.status='offered')::integer,
    'target_open',count(*) filter(where o.season_number=v_target_season and o.status='offered')::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',o.id::text,o.club_id::text,o.season_number::text,
      coalesce(o.company_id::text,''),coalesce(o.sponsor_kind::text,''),coalesce(o.status,''),
      coalesce(o.guaranteed_amount,0)::text,coalesce(o.bonus_pool_amount,0)::text),
      '||' order by o.id),'')))
  into v_sponsor_offers from public.club_sponsor_offers o;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'active_rows',count(*) filter(where b.status='active')::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',b.id::text,b.club_id::text,coalesce(b.club_sponsor_id::text,''),
      coalesce(b.game_season,0)::text,coalesce(b.status,''),coalesce(b.expires_game_date::text,'')),
      '||' order by b.id),'')))
  into v_technical from public.club_technical_sponsor_benefits b;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',d.main_club_id::text,d.developing_club_id::text,
      coalesce(d.access_status,''),coalesce(d.active_season,0)::text,coalesce(d.expires_after_season,0)::text,
      coalesce(d.auto_renew,false)::text), '||' order by d.main_club_id,d.developing_club_id),'')))
  into v_developing from public.developing_team_season_access d;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'balance_total',coalesce(sum(w.balance),0),
    'hash',md5(coalesce(string_agg(concat_ws('|',w.user_id::text,w.balance::text,coalesce(w.first_charge_day_of_year,0)::text),
      '||' order by w.user_id),'')))
  into v_wallets from public.user_wallets w;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'delta_total',coalesce(sum(l.delta),0),
    'hash',md5(coalesce(string_agg(concat_ws('|',l.id::text,l.user_id::text,l.delta::text,coalesce(l.reason,'')),
      '||' order by l.id),'')))
  into v_coin_ledger from public.user_coin_ledger l;

  select jsonb_build_object(
    'source_rows',count(*)::integer,
    'pending_rows',count(*) filter(where d.status not in ('finalized','cancelled'))::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',d.id::text,d.subject_type,d.subject_id::text,
      coalesce(d.club_id::text,''),d.season_number::text,d.status,coalesce(d.effective_game_date::text,'')),
      '||' order by d.id),'')))
  into v_retirements from public.retirement_decisions d
  where d.season_number=p_source_season;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'balance_total',coalesce(sum(ab.balance),0),
    'hash',md5(coalesce(string_agg(concat_ws('|',ab.account_id::text,ab.balance::text),
      '||' order by ab.account_id),'')))
  into v_finance_balances from finance.account_balances ab;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'open_rows',count(*) filter(where el.status not in ('paid','closed','cancelled'))::integer,
    'outstanding_total',coalesce(sum(el.outstanding_principal),0),
    'hash',md5(coalesce(string_agg(concat_ws('|',el.id::text,el.club_id::text,el.rescue_number::text,
      el.outstanding_principal::text,coalesce(el.status,'')), '||' order by el.id),'')))
  into v_loans from finance.emergency_loans el;

  select jsonb_build_object(
    'source_races',count(*) filter(where extract(year from r.start_date)::integer=v_source_year)::integer,
    'target_races',count(*) filter(where extract(year from r.start_date)::integer=v_target_year)::integer,
    'target_stages',(select count(*)::integer from public.race_stages s where extract(year from s.stage_date)::integer=v_target_year),
    'target_race_hash',md5(coalesce(string_agg(concat_ws('|',r.id::text,r.name,r.start_date::text,r.end_date::text,
      coalesce(r.category,''),coalesce(r.status,'')), '||' order by r.id)
      filter(where extract(year from r.start_date)::integer=v_target_year),''))
  ) into v_calendar from public.races r;

  select jsonb_build_object(
    'target_applications',(select count(*)::integer from public.race_team_applications a join public.races r on r.id=a.race_id where extract(year from r.start_date)::integer=v_target_year),
    'target_entries',(select count(*)::integer from public.race_team_entries e join public.races r on r.id=e.race_id where extract(year from r.start_date)::integer=v_target_year),
    'target_participant_teams',(select count(*)::integer from public.race_participant_teams pt join public.races r on r.id=pt.race_id where extract(year from r.start_date)::integer=v_target_year),
    'target_participant_riders',(select count(*)::integer from public.race_participant_riders pr join public.races r on r.id=pr.race_id where extract(year from r.start_date)::integer=v_target_year),
    'target_preparations',(select count(*)::integer from public.race_preparations p join public.races r on r.id=p.race_id where extract(year from r.start_date)::integer=v_target_year),
    'hash',md5(concat_ws('|',
      (select count(*) from public.race_team_applications a join public.races r on r.id=a.race_id where extract(year from r.start_date)::integer=v_target_year)::text,
      (select count(*) from public.race_team_entries e join public.races r on r.id=e.race_id where extract(year from r.start_date)::integer=v_target_year)::text,
      (select count(*) from public.race_participant_teams pt join public.races r on r.id=pt.race_id where extract(year from r.start_date)::integer=v_target_year)::text,
      (select count(*) from public.race_participant_riders pr join public.races r on r.id=pr.race_id where extract(year from r.start_date)::integer=v_target_year)::text,
      (select count(*) from public.race_preparations p join public.races r on r.id=p.race_id where extract(year from r.start_date)::integer=v_target_year)::text
    ))
  ) into v_preseason_ops;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',s.division,s.club_id::text,s.final_position::text,
      coalesce(s.international_points,0)::text), '||' order by s.division,s.final_position,s.club_id),'')))
  into v_snapshot from public.team_ranking_season_snapshots s
  where s.season_number=p_source_season;

  return jsonb_build_object(
    'source_season',p_source_season,
    'target_season',v_target_season,
    'source_year',v_source_year,
    'target_year',v_target_year,
    'game_state',v_game_state,
    'clubs',v_clubs,
    'rosters',v_rosters,
    'riders',v_riders,
    'rider_contracts',v_contracts,
    'rider_free_agents',v_free_agents,
    'club_staff',v_staff,
    'staff_candidates',v_staff_market,
    'club_sponsors',v_sponsors,
    'sponsor_offers',v_sponsor_offers,
    'technical_benefits',v_technical,
    'developing_team',v_developing,
    'wallets',v_wallets,
    'coin_ledger',v_coin_ledger,
    'retirements',v_retirements,
    'finance_balances',v_finance_balances,
    'emergency_loans',v_loans,
    'calendar',v_calendar,
    'preseason_operations',v_preseason_ops,
    'source_snapshot',v_snapshot
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_verify_checkpoint_v2(p_checkpoint_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.season_transition_lab_checkpoints_v1%rowtype;
  v_live_season integer;
  v_live_date date;
  v_paused boolean;
  v_armed boolean;
  v_fingerprint jsonb;
begin
  select * into c
  from public.season_transition_lab_checkpoints_v1
  where id=p_checkpoint_id
  for update;
  if not found then raise exception 'checkpoint not found'; end if;
  if c.status='retired' then raise exception 'checkpoint is retired'; end if;

  select g.season_number,public.get_current_game_date_date(),g.is_paused
  into v_live_season,v_live_date,v_paused
  from public.game_state g where g.id=true;

  select coalesce(t.is_armed,false) into v_armed
  from public.season_transition_control_v1 t where t.id=true;

  if v_live_season is distinct from c.source_season then
    raise exception 'checkpoint verification requires restored source season %, current season is %',c.source_season,v_live_season;
  end if;
  if v_live_date is distinct from c.source_end_date then
    raise exception 'checkpoint verification requires source end date %, current game date is %',c.source_end_date,v_live_date;
  end if;
  if not coalesce(v_paused,false) then
    raise exception 'checkpoint verification requires the restored game to be paused';
  end if;
  if coalesce(v_armed,false) then
    raise exception 'checkpoint verification requires season transition control to be disarmed';
  end if;

  v_fingerprint := public.season_transition_lab_checkpoint_fingerprint_v2(c.source_season);

  update public.season_transition_lab_checkpoints_v1
  set status='ready',baseline_fingerprint=v_fingerprint,verified_at=now(),updated_at=now()
  where id=c.id;

  return jsonb_build_object(
    'ok',true,
    'checkpoint_id',c.id,
    'label',c.label,
    'source_season',c.source_season,
    'source_end_date',c.source_end_date,
    'status','ready',
    'baseline_fingerprint',v_fingerprint
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_compare_checkpoint_v2(p_checkpoint_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.season_transition_lab_checkpoints_v1%rowtype;
  v_current jsonb;
  v_match boolean;
begin
  select * into c from public.season_transition_lab_checkpoints_v1 where id=p_checkpoint_id;
  if not found then raise exception 'checkpoint not found'; end if;
  if c.baseline_fingerprint is null then
    return jsonb_build_object('ok',false,'checkpoint_id',c.id,'reason','baseline_fingerprint_missing');
  end if;
  v_current := public.season_transition_lab_checkpoint_fingerprint_v2(c.source_season);
  v_match := c.baseline_fingerprint = v_current;
  return jsonb_build_object(
    'ok',v_match,
    'checkpoint_id',c.id,
    'label',c.label,
    'status',c.status,
    'matches_baseline',v_match,
    'baseline',c.baseline_fingerprint,
    'current',v_current
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_source_freeze_report_v2(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_source_end date := public.get_game_date_for_season_end(p_source_season);
  v_snapshot jsonb;
  v_preview jsonb;
  v_winners jsonb;
  v_contracts jsonb;
  v_staff jsonb;
  v_retirements jsonb;
  v_sponsors jsonb;
  v_inactivity jsonb;
  v_developing jsonb;
begin
  perform public.season_transition_engine_assert_pair_v2(p_source_season,p_source_season+1);

  select jsonb_build_object(
    'rows',count(*)::integer,
    'points_total',coalesce(sum(s.international_points),0),
    'hash',md5(coalesce(string_agg(concat_ws('|',s.division,s.club_id::text,s.final_position::text,
      coalesce(s.international_points,0)::text,coalesce(s.completed_race_count,0)::text,
      coalesce(s.race_reputation_value,0)::text), '||' order by s.division,s.final_position,s.club_id),''))
  ) into v_snapshot from public.team_ranking_season_snapshots s where s.season_number=p_source_season;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'direct_promotions',count(*) filter(where p.movement_type='direct_promotion')::integer,
    'playoff_promotions',count(*) filter(where p.movement_type='playoff_promotion')::integer,
    'relegations',count(*) filter(where p.movement_type='relegated')::integer,
    'playoff_not_promoted',count(*) filter(where p.movement_type='playoff_not_promoted')::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',p.club_id::text,p.movement_type,
      coalesce(p.target_tier,''),coalesce(p.target_division,''),coalesce(p.playoff_pool,''),
      coalesce(p.playoff_pool_rank,0)::text), '||' order by p.club_id),''))
  ) into v_preview
  from public.preview_competition_transition_v1(p_source_season,true) p;

  select jsonb_build_object(
    'rows',count(*)::integer,
    'hash',md5(coalesce(string_agg(concat_ws('|',s.division,s.club_id::text,
      coalesce(s.international_points,0)::text), '||' order by s.division,s.club_id),''))
  ) into v_winners
  from public.team_ranking_season_snapshots s
  where s.season_number=p_source_season and s.final_position=1;

  select jsonb_build_object(
    'expiring_active',count(*) filter(where rc.status::text='active' and (
      rc.end_season_number<=p_source_season or rc.expires_on<=v_source_end
    ))::integer,
    'continuing_active',count(*) filter(where rc.status::text='active' and
      coalesce(rc.end_season_number,p_source_season+1)>p_source_season and
      coalesce(rc.expires_on,v_source_end+1)>v_source_end
    )::integer
  ) into v_contracts from public.rider_contracts rc;

  select jsonb_build_object(
    'expiring_active',count(*) filter(where cs.is_active and cs.contract_expires_at is not null and cs.contract_expires_at::date<=v_source_end)::integer,
    'continuing_active',count(*) filter(where cs.is_active and (cs.contract_expires_at is null or cs.contract_expires_at::date>v_source_end))::integer
  ) into v_staff from public.club_staff cs;

  select jsonb_build_object(
    'source_rows',count(*)::integer,
    'pending',count(*) filter(where d.status not in ('finalized','cancelled'))::integer
  ) into v_retirements from public.retirement_decisions d where d.season_number=p_source_season;

  select jsonb_build_object(
    'source_active_contracts',count(*) filter(where s.season_number=p_source_season and s.status='active')::integer,
    'source_open_offers',(select count(*)::integer from public.club_sponsor_offers o where o.season_number=p_source_season and o.status='offered')
  ) into v_sponsors from public.club_sponsors s;

  select jsonb_build_object(
    'pending_removal',count(*) filter(where c.deleted_at is null and c.season_end_transition_pending=true)::integer,
    'inactive',count(*) filter(where c.deleted_at is null and c.inactivity_status='inactive')::integer
  ) into v_inactivity from public.clubs c;

  select jsonb_build_object(
    'source_active',count(*) filter(where d.active_season=p_source_season and d.access_status='active')::integer,
    'auto_renew_on',count(*) filter(where d.active_season=p_source_season and d.access_status='active' and d.auto_renew)::integer
  ) into v_developing from public.developing_team_season_access d;

  return jsonb_build_object(
    'source_season',p_source_season,
    'source_end_date',v_source_end,
    'snapshot',v_snapshot,
    'competition_preview',v_preview,
    'division_winners',v_winners,
    'rider_contracts',v_contracts,
    'staff_contracts',v_staff,
    'retirements',v_retirements,
    'sponsors',v_sponsors,
    'inactivity',v_inactivity,
    'developing_team',v_developing
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_freeze_source_v2(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  c public.season_transition_lab_checkpoints_v1%rowtype;
  v_live_season integer;
  v_live_date date;
  v_paused boolean;
  v_checkpoint_compare jsonb;
  v_snapshot_rows integer;
  v_source_fingerprint jsonb;
  v_freeze_report jsonb;
  v_snapshot_ok boolean;
  v_result jsonb;
  v_error text;
begin
  select * into r from public.season_transition_engine_runs_v2 where id=p_run_id for update;
  if not found then raise exception 'v2 transition run not found'; end if;

  if r.status='source_frozen' then
    return jsonb_build_object('ok',true,'status','already_frozen','run_id',r.id,
      'source_fingerprint',r.source_fingerprint,'freeze_report',r.metadata->'source_freeze_report');
  end if;
  if r.status<>'created' then
    raise exception 'source freeze requires run status created, current status %',r.status;
  end if;

  select g.season_number,public.get_current_game_date_date(),g.is_paused
  into v_live_season,v_live_date,v_paused
  from public.game_state g where g.id=true;

  if v_live_season is distinct from r.source_season then
    raise exception 'source freeze requires current season %, found %',r.source_season,v_live_season;
  end if;
  if v_live_date is distinct from r.source_end_date then
    raise exception 'source freeze requires game date %, found %',r.source_end_date,v_live_date;
  end if;
  if not coalesce(v_paused,false) then
    raise exception 'source freeze requires the game to be paused';
  end if;

  if r.mode='lab' then
    select * into c from public.season_transition_lab_checkpoints_v1 where id=r.checkpoint_id;
    if not found or c.status<>'ready' then raise exception 'lab checkpoint is not ready'; end if;
    v_checkpoint_compare := public.season_transition_lab_compare_checkpoint_v2(c.id);
    if not coalesce((v_checkpoint_compare->>'ok')::boolean,false) then
      raise exception 'restored lab database does not match checkpoint baseline';
    end if;
  end if;

  -- Freeze the canonical final source standings. This is the only sporting/history data write in Phase 2.
  v_snapshot_rows := public.snapshot_team_rankings_for_season_v1(r.source_season);
  v_source_fingerprint := public.season_transition_engine_source_fingerprint_v2(r.source_season);
  v_snapshot_ok := coalesce((v_source_fingerprint->'snapshot_verification'->>'ok')::boolean,false);
  if not v_snapshot_ok then
    raise exception 'source snapshot reconciliation failed: %',v_source_fingerprint->'snapshot_verification';
  end if;

  v_freeze_report := public.season_transition_engine_source_freeze_report_v2(r.source_season);
  if coalesce((v_freeze_report->'snapshot'->>'rows')::integer,0)<>v_snapshot_rows then
    raise exception 'source freeze snapshot row-count mismatch';
  end if;
  if coalesce((v_freeze_report->'division_winners'->>'rows')::integer,0)=0 then
    raise exception 'source freeze has no division winners';
  end if;

  update public.season_transition_engine_runs_v2
  set status='source_frozen',
      source_fingerprint=v_source_fingerprint,
      source_frozen_at=now(),
      updated_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'source_freeze_report',v_freeze_report,
        'source_snapshot_rows',v_snapshot_rows,
        'checkpoint_compare',v_checkpoint_compare
      )
  where id=r.id;

  insert into public.season_transition_engine_events_v2(run_id,phase,event_type,payload)
  values(r.id,'source_frozen','source_frozen',jsonb_build_object(
    'snapshot_rows',v_snapshot_rows,
    'source_fingerprint',v_source_fingerprint,
    'freeze_report',v_freeze_report
  ));

  v_result := jsonb_build_object(
    'ok',true,
    'run_id',r.id,
    'status','source_frozen',
    'snapshot_rows',v_snapshot_rows,
    'source_fingerprint',v_source_fingerprint,
    'freeze_report',v_freeze_report
  );
  return v_result;
exception when others then
  v_error := sqlerrm;
  if r.id is null then
    raise;
  end if;
  -- The EXCEPTION block rolls back any snapshot/freeze work from the failed attempt.
  -- We then persist only the failed run/event state and RETURN it to the caller.
  update public.season_transition_engine_runs_v2
  set status='failed',error_message=v_error,updated_at=now()
  where id=r.id and status='created';
  insert into public.season_transition_engine_events_v2(run_id,phase,event_type,payload)
  values(r.id,'source_freeze','source_freeze_failed',jsonb_build_object('error',v_error));
  return jsonb_build_object('ok',false,'run_id',r.id,'status','failed','error',v_error);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_lab_simulate_v2(p_checkpoint_id uuid, p_seed double precision DEFAULT 0.271828)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c public.season_transition_lab_checkpoints_v1%rowtype;
  v_source_season integer;
  v_target_season integer;
  v_source_end date;
  v_target_start date;

  v_live_season integer;
  v_live_date date;
  v_paused boolean;
  v_armed boolean;
  v_compare jsonb;

  v_v2_run_id uuid;
  v_freeze jsonb;
  v_core jsonb;
  v_rewards jsonb;
  v_communications jsonb;
  v_final jsonb;
  v_legacy_run_id uuid;
  v_fingerprint jsonb;
  v_result jsonb;
  v_error text;
begin
  if p_checkpoint_id is null then
    return jsonb_build_object(
      'ok',false,'rolled_back',true,'error','checkpoint_id is required'
    );
  end if;

  select *
  into c
  from public.season_transition_lab_checkpoints_v1
  where id=p_checkpoint_id;

  if not found then
    return jsonb_build_object(
      'ok',false,'rolled_back',true,'error','checkpoint not found'
    );
  end if;

  if c.status<>'ready' then
    return jsonb_build_object(
      'ok',false,
      'rolled_back',true,
      'checkpoint_id',c.id,
      'checkpoint_status',c.status,
      'error','checkpoint is not READY'
    );
  end if;

  v_source_season := c.source_season;
  v_target_season := c.source_season+1;
  v_source_end := public.get_game_date_for_season_end(v_source_season);
  v_target_start := public.get_game_date_for_season_start(v_target_season);

  select
    g.season_number,
    public.get_current_game_date_date(),
    g.is_paused
  into
    v_live_season,
    v_live_date,
    v_paused
  from public.game_state g
  where g.id=true;

  select coalesce(t.is_armed,false)
  into v_armed
  from public.season_transition_control_v1 t
  where t.id=true;

  if v_live_season is distinct from v_source_season
     or v_live_date is distinct from v_source_end
     or not coalesce(v_paused,false)
     or coalesce(v_armed,false) then
    return jsonb_build_object(
      'ok',false,
      'rolled_back',true,
      'checkpoint_id',c.id,
      'error','database is not in exact paused/disarmed source-season Dec-31 checkpoint context',
      'required',jsonb_build_object(
        'season',v_source_season,
        'date',v_source_end,
        'paused',true,
        'armed',false
      ),
      'actual',jsonb_build_object(
        'season',v_live_season,
        'date',v_live_date,
        'paused',v_paused,
        'armed',v_armed
      )
    );
  end if;

  v_compare := public.season_transition_lab_compare_checkpoint_v2(c.id);

  if not coalesce((v_compare->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'rolled_back',true,
      'checkpoint_id',c.id,
      'error','current database does not exactly match checkpoint baseline',
      'checkpoint_compare',v_compare
    );
  end if;

  begin
    perform setseed(greatest(-1.0,least(1.0,coalesce(p_seed,0.271828))));

    v_v2_run_id := public.season_transition_engine_create_run_v2(
      v_source_season,
      v_target_season,
      'lab',
      c.id,
      p_seed,
      'Phase-3 rollback-only lab run'
    );

    v_freeze := public.season_transition_engine_freeze_source_v2(v_v2_run_id);
    if not coalesce((v_freeze->>'ok')::boolean,false) then
      raise exception 'source freeze failed: %',v_freeze::text;
    end if;

    -- Boundary exists only inside rollback scope.
    update public.game_state
    set season_number=v_target_season,
        month_number=1,
        day_number=1,
        hour_number=0,
        minute_number=0,
        is_paused=true,
        last_advanced_at=now()
    where id=true;

    update public.game_clock_config
    set base_real_at=now(),
        base_game_at=v_target_start::timestamp,
        base_season=v_target_season,
        is_paused=true
    where id=true;

    v_core := public.season_transition_engine_apply_core_v2(v_v2_run_id);
    if not coalesce((v_core->>'ok')::boolean,false) then
      raise exception 'core failed: %',v_core::text;
    end if;

    v_rewards := public.season_transition_engine_apply_rewards_v2(v_v2_run_id);
    if not coalesce((v_rewards->>'ok')::boolean,false) then
      raise exception 'rewards failed: %',v_rewards::text;
    end if;

    v_communications :=
      public.season_transition_engine_dispatch_communications_v2(v_v2_run_id);
    if not coalesce((v_communications->>'ok')::boolean,false) then
      raise exception 'communications failed: %',v_communications::text;
    end if;

    v_final := public.season_transition_engine_finalize_v2(v_v2_run_id);
    if not coalesce((v_final->>'ok')::boolean,false) then
      raise exception 'finalization failed: %',v_final::text;
    end if;

    v_legacy_run_id :=
      public.season_transition_engine_legacy_run_id_v2(v_v2_run_id);

    v_fingerprint := public.season_transition_lab_fingerprint_v1(
      v_source_season,
      v_target_season,
      v_legacy_run_id
    );

    v_result := jsonb_build_object(
      'ok',true,
      'rolled_back',true,
      'checkpoint_id',c.id,
      'checkpoint_label',c.label,
      'source_season',v_source_season,
      'target_season',v_target_season,
      'seed',p_seed,
      'source_freeze',v_freeze,
      'core',v_core,
      'rewards',v_rewards,
      'communications',v_communications,
      'finalization',v_final,
      'semantic_fingerprint',v_fingerprint
    );

    raise exception using
      errcode='P0001',
      message='__SEASON_TRANSITION_PHASE3_LAB_ROLLBACK__';

  exception
    when sqlstate 'P0001' then
      if sqlerrm <> '__SEASON_TRANSITION_PHASE3_LAB_ROLLBACK__' then
        raise;
      end if;
  end;

  return v_result;

exception when others then
  v_error := sqlerrm;
  return jsonb_build_object(
    'ok',false,
    'rolled_back',true,
    'checkpoint_id',p_checkpoint_id,
    'error',v_error
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_apply_core_v2(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  v_live_season integer;
  v_live_date date;
  v_paused boolean;

  v_timeline_id uuid;
  v_armed boolean;
  v_armed_source integer;
  v_armed_target integer;

  v_legacy_run_id uuid;
  v_engine_mode text;
  v_engine jsonb;
  v_validation jsonb;
  v_error text;
begin
  select *
  into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','v2 transition run not found');
  end if;

  if r.status in (
    'core_validated','rewards_applied','communication_pending',
    'communication_done','final_validated','completed'
  ) then
    return jsonb_build_object(
      'ok',true,
      'status',r.status,
      'already_applied',true,
      'run_id',r.id,
      'core_report',r.core_report,
      'validation_report',r.validation_report
    );
  end if;

  if r.status <> 'source_frozen' then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'error','core apply requires source_frozen status'
    );
  end if;

  select
    g.season_number,
    public.get_current_game_date_date(),
    g.is_paused
  into
    v_live_season,
    v_live_date,
    v_paused
  from public.game_state g
  where g.id=true;

  if v_live_season is distinct from r.target_season then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'retryable',true,
      'error',format(
        'core apply requires target season %s; current season is %s',
        r.target_season,v_live_season
      )
    );
  end if;

  if v_live_date is distinct from r.target_start_date then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'retryable',true,
      'error',format(
        'core apply requires target start date %s; current date is %s',
        r.target_start_date,v_live_date
      )
    );
  end if;

  if not coalesce(v_paused,false) then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'retryable',true,
      'error','core apply requires game_state to remain paused'
    );
  end if;

  select
    t.timeline_id,
    coalesce(t.is_armed,false),
    t.armed_source_season,
    t.armed_target_season
  into
    v_timeline_id,
    v_armed,
    v_armed_source,
    v_armed_target
  from public.season_transition_control_v1 t
  where t.id=true;

  if v_timeline_id is null then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'retryable',true,
      'error','transition control timeline is missing'
    );
  end if;

  if r.mode='production' then
    if not v_armed
       or v_armed_source is distinct from r.source_season
       or v_armed_target is distinct from r.target_season then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status',r.status,
        'retryable',true,
        'error','production core apply requires transition control armed for the exact source/target pair'
      );
    end if;
    v_engine_mode := 'live';
  else
    if r.checkpoint_id is null then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status',r.status,
        'retryable',true,
        'error','lab core apply requires checkpoint_id'
      );
    end if;

    if not coalesce((r.metadata->'checkpoint_compare'->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status',r.status,
        'retryable',true,
        'error','lab source freeze did not record a successful checkpoint baseline comparison'
      );
    end if;

    v_engine_mode := 'lab';
  end if;

  v_legacy_run_id := public.season_transition_engine_legacy_run_id_v2(r.id);

  if v_legacy_run_id is not null then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'legacy_transition_run_id',v_legacy_run_id,
      'retryable',false,
      'error','legacy transition run is already attached while v2 status is source_frozen'
    );
  end if;

  begin
    if exists(
      select 1
      from public.season_transition_runs_v1 x
      where x.timeline_id=v_timeline_id
        and x.source_season=r.source_season
        and x.target_season=r.target_season
        and x.status in ('running','completed')
    ) then
      raise exception
        'current timeline already contains a running/completed Season % -> % transition',
        r.source_season,r.target_season;
    end if;

    insert into public.season_transition_runs_v1(
      timeline_id,
      source_season,
      target_season,
      status,
      metadata
    )
    values(
      v_timeline_id,
      r.source_season,
      r.target_season,
      'running',
      jsonb_build_object(
        'engine_version',2,
        'v2_run_id',r.id,
        'v2_mode',r.mode,
        'checkpoint_id',r.checkpoint_id,
        'random_seed',r.random_seed
      )
    )
    returning id into v_legacy_run_id;

    update public.season_transition_engine_runs_v2
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'legacy_transition_run_id',v_legacy_run_id
        ),
        updated_at=now()
    where id=r.id;

    v_engine := public.season_transition_engine_execute_v2(
      v_legacy_run_id,
      r.source_season,
      r.target_season,
      v_engine_mode
    );

    update public.season_transition_engine_runs_v2
    set status='core_applied',
        core_report=v_engine,
        core_applied_at=now(),
        updated_at=now()
    where id=r.id;

    v_validation := public.verify_new_season_fresh_state_v1(
      r.source_season,
      r.target_season
    );

    if not coalesce((v_validation->>'ok')::boolean,false) then
      raise exception 'core validation failed: %',v_validation::text;
    end if;

    update public.season_transition_runs_v1
    set status='completed',
        finished_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'v2_core_validated',true,
          'v2_core_validation',v_validation
        )
    where id=v_legacy_run_id;

    update public.season_transition_engine_runs_v2
    set status='core_validated',
        validation_report=jsonb_build_object('core',v_validation),
        error_message=null,
        updated_at=now()
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(
      r.id,
      'core_validated',
      'core_validated',
      jsonb_build_object(
        'legacy_transition_run_id',v_legacy_run_id,
        'engine_report',v_engine,
        'validation',v_validation
      )
    );

  exception when others then
    v_error := sqlerrm;

    -- All core mutations above are rolled back by this EXCEPTION block.
    -- Keep the exact source freeze available for a retry.
    update public.season_transition_engine_runs_v2
    set status='source_frozen',
        core_report=null,
        core_applied_at=null,
        error_message=v_error,
        updated_at=now(),
        metadata=(coalesce(metadata,'{}'::jsonb) - 'legacy_transition_run_id')
          || jsonb_build_object(
            'last_core_failure',v_error,
            'core_retryable',true
          )
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(
      r.id,
      'core',
      'core_failed_retryable',
      jsonb_build_object('error',v_error,'retryable',true)
    );

    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status','source_frozen',
      'retryable',true,
      'error',v_error
    );
  end;

  return jsonb_build_object(
    'ok',true,
    'run_id',r.id,
    'status','core_validated',
    'legacy_transition_run_id',v_legacy_run_id,
    'engine',v_engine,
    'validation',v_validation
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_apply_rewards_v2(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  v_legacy_run_id uuid;
  v_report jsonb;
  v_error text;
begin
  select *
  into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','v2 transition run not found');
  end if;

  if r.status in (
    'rewards_applied','communication_pending','communication_done',
    'final_validated','completed'
  ) then
    return jsonb_build_object(
      'ok',true,
      'run_id',r.id,
      'status',r.status,
      'already_applied',true,
      'reward_report',r.reward_report
    );
  end if;

  if r.status <> 'core_validated' then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'error','reward apply requires core_validated status'
    );
  end if;

  v_legacy_run_id := public.season_transition_engine_legacy_run_id_v2(r.id);

  if v_legacy_run_id is null or not exists(
    select 1
    from public.season_transition_runs_v1 x
    where x.id=v_legacy_run_id
      and x.source_season=r.source_season
      and x.target_season=r.target_season
      and x.status='completed'
  ) then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'error','completed legacy transition bridge row is missing'
    );
  end if;

  begin
    v_report := public.season_transition_engine_apply_rewards_trusted_v2(
      r.source_season
    );

    update public.season_transition_engine_runs_v2
    set status='rewards_applied',
        reward_report=v_report,
        error_message=null,
        updated_at=now()
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(r.id,'rewards','rewards_applied',v_report);

  exception when others then
    v_error := sqlerrm;

    update public.season_transition_engine_runs_v2
    set error_message=v_error,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'reward_failure',v_error
        )
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(r.id,'rewards','rewards_failed',jsonb_build_object(
      'error',v_error,'retryable',true
    ));

    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status','core_validated',
      'retryable',true,
      'error',v_error
    );
  end;

  return jsonb_build_object(
    'ok',true,
    'run_id',r.id,
    'status','rewards_applied',
    'report',v_report
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_dispatch_communications_v2(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  v_legacy_run_id uuid;
  v_report jsonb;
  v_error text;
begin
  select *
  into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','v2 transition run not found');
  end if;

  if r.status in ('communication_done','final_validated','completed') then
    return jsonb_build_object(
      'ok',true,
      'run_id',r.id,
      'status',r.status,
      'already_applied',true,
      'communication_report',r.communication_report
    );
  end if;

  if r.status not in ('rewards_applied','communication_pending') then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'error','communication requires rewards_applied or communication_pending status'
    );
  end if;

  v_legacy_run_id := public.season_transition_engine_legacy_run_id_v2(r.id);

  if v_legacy_run_id is null then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'error','legacy transition run id is missing'
    );
  end if;

  begin
    v_report := public.run_post_season_transition_notifications_v1(
      v_legacy_run_id,
      r.source_season,
      r.target_season
    );

    update public.season_transition_engine_runs_v2
    set status='communication_done',
        communication_report=v_report,
        error_message=null,
        updated_at=now()
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(r.id,'communications','communications_done',v_report);

  exception when others then
    v_error := sqlerrm;

    update public.season_transition_engine_runs_v2
    set status='communication_pending',
        error_message=v_error,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'communication_failure',v_error
        )
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(
      r.id,
      'communications',
      'communications_failed',
      jsonb_build_object('error',v_error,'retryable',true)
    );

    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status','communication_pending',
      'retryable',true,
      'error',v_error
    );
  end;

  return jsonb_build_object(
    'ok',true,
    'run_id',r.id,
    'status','communication_done',
    'report',v_report
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_finalize_v2(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  v_fresh jsonb;
  v_source jsonb;
  v_persistence jsonb;
  v_legacy_run_id uuid;
  v_reward_guard boolean;
  v_reward_rows integer;
  v_ok boolean;
  v_report jsonb;
  v_error text;
begin
  select *
  into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','v2 transition run not found');
  end if;

  if r.status='completed' then
    return jsonb_build_object(
      'ok',true,
      'run_id',r.id,
      'status','completed',
      'already_completed',true,
      'validation_report',r.validation_report
    );
  end if;

  if r.status <> 'communication_done' then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'error','finalize requires communication_done status'
    );
  end if;

  begin
    v_fresh := public.verify_new_season_fresh_state_v1(
      r.source_season,
      r.target_season
    );

    v_source := public.verify_season_transition_source_snapshot_v1(
      r.source_season
    );

    v_persistence := public.get_season_transition_persistence_guard_status_v1();

    v_legacy_run_id := public.season_transition_engine_legacy_run_id_v2(r.id);

    select exists(
      select 1
      from public.season_reward_guard g
      where g.source_season=r.source_season
    )
    into v_reward_guard;

    select count(*)::integer
    into v_reward_rows
    from public.club_season_reward_grants g
    where g.source_season=r.source_season;

    v_ok :=
      coalesce((v_fresh->>'ok')::boolean,false)
      and coalesce((v_source->>'ok')::boolean,false)
      and coalesce((v_persistence->>'ok')::boolean,false)
      and coalesce(v_reward_guard,false)
      and v_reward_rows>0
      and v_legacy_run_id is not null
      and exists(
        select 1
        from public.season_transition_runs_v1 x
        where x.id=v_legacy_run_id
          and x.source_season=r.source_season
          and x.target_season=r.target_season
          and x.status='completed'
      );

    v_report := jsonb_build_object(
      'ok',v_ok,
      'source_season',r.source_season,
      'target_season',r.target_season,
      'source_snapshot',v_source,
      'target_fresh_state',v_fresh,
      'persistence',v_persistence,
      'reward_guard_present',v_reward_guard,
      'reward_grant_rows',v_reward_rows,
      'legacy_transition_run_id',v_legacy_run_id,
      'legacy_transition_completed',
        exists(
          select 1
          from public.season_transition_runs_v1 x
          where x.id=v_legacy_run_id and x.status='completed'
        )
    );

    if not v_ok then
      raise exception 'final transition validation failed: %',v_report::text;
    end if;

    update public.season_transition_engine_runs_v2
    set status='final_validated',
        validation_report=coalesce(validation_report,'{}'::jsonb)||
          jsonb_build_object('final',v_report),
        error_message=null,
        updated_at=now()
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(r.id,'final_validation','final_validation_passed',v_report);

    update public.season_transition_engine_runs_v2
    set status='completed',
        completed_at=now(),
        updated_at=now()
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(
      r.id,
      'completed',
      'transition_completed',
      jsonb_build_object(
        'source_season',r.source_season,
        'target_season',r.target_season,
        'mode',r.mode
      )
    );

    if r.mode='production' then
      update public.season_transition_control_v1
      set is_armed=false,
          armed_source_season=null,
          armed_target_season=null,
          armed_at=null,
          armed_note=null,
          updated_at=now()
      where id=true
        and is_armed=true
        and armed_source_season=r.source_season
        and armed_target_season=r.target_season;
    end if;

  exception when others then
    v_error := sqlerrm;

    -- Core/rewards/communications are already committed by design.
    -- Leave status at communication_done so final validation can be retried
    -- after the underlying invariant is repaired.
    update public.season_transition_engine_runs_v2
    set status='communication_done',
        error_message=v_error,
        updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'final_validation_failure',v_error
        )
    where id=r.id;

    insert into public.season_transition_engine_events_v2(
      run_id,phase,event_type,payload
    )
    values(
      r.id,
      'final_validation',
      'final_validation_failed',
      jsonb_build_object('error',v_error,'retryable',true)
    );

    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status','communication_done',
      'retryable',true,
      'error',v_error
    );
  end;

  return jsonb_build_object(
    'ok',true,
    'run_id',r.id,
    'status','completed',
    'validation',v_report
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_apply_rewards_trusted_v2(p_source_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_prev_claim_role text;
  v_result jsonb;
begin
  v_prev_claim_role := current_setting('request.jwt.claim.role', true);

  perform set_config('request.jwt.claim.role','service_role',true);

  begin
    v_result := public.admin_apply_competition_rewards_after_transition_v1(
      p_source_season
    );
  exception when others then
    perform set_config(
      'request.jwt.claim.role',
      coalesce(v_prev_claim_role,''),
      true
    );
    raise;
  end;

  perform set_config(
    'request.jwt.claim.role',
    coalesce(v_prev_claim_role,''),
    true
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_resume_completed_v2(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  v_current_season integer;
  v_current_date date;
  v_target_ts timestamp;
begin
  select *
  into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'error','v2 transition run not found');
  end if;

  if r.status<>'completed' then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'status',r.status,
      'error','resume requires completed transition'
    );
  end if;

  v_current_season := public.get_current_season_number();
  v_current_date := public.get_current_game_date_date();
  v_target_ts := r.target_start_date::timestamp;

  if v_current_season is distinct from r.target_season
     or v_current_date is distinct from r.target_start_date then
    return jsonb_build_object(
      'ok',false,
      'run_id',r.id,
      'error','resume requires game to remain at target Jan-1 boundary',
      'expected_season',r.target_season,
      'expected_date',r.target_start_date,
      'current_season',v_current_season,
      'current_date',v_current_date
    );
  end if;

  update public.game_clock_config
  set base_real_at=clock_timestamp(),
      base_game_at=v_target_ts,
      base_season=r.target_season,
      is_paused=false
  where id=true;

  update public.game_state
  set is_paused=false,
      last_advanced_at=clock_timestamp()
  where id=true;

  update public.season_transition_engine_runs_v2
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'resumed_at',now(),
        'resumed_game_date',r.target_start_date
      ),
      updated_at=now()
  where id=r.id;

  insert into public.season_transition_engine_events_v2(
    run_id,phase,event_type,payload
  )
  values(
    r.id,
    'resume',
    'game_resumed',
    jsonb_build_object(
      'season',r.target_season,
      'game_date',r.target_start_date
    )
  );

  return jsonb_build_object(
    'ok',true,
    'run_id',r.id,
    'status','completed',
    'resumed',true,
    'season',r.target_season,
    'game_date',r.target_start_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_continue_v2(p_run_id uuid, p_resume_after_success boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r public.season_transition_engine_runs_v2%rowtype;
  v_step jsonb;
  v_result jsonb := '{}'::jsonb;
begin
  if not pg_try_advisory_xact_lock(
    hashtext('public.season_transition_engine_continue_v2')::bigint
  ) then
    return jsonb_build_object(
      'ok',false,'retryable',true,'error','transition continuation lock is busy'
    );
  end if;

  select *
  into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id;

  if not found then
    return jsonb_build_object('ok',false,'error','v2 transition run not found');
  end if;

  if r.status='source_frozen' then
    v_step := public.season_transition_engine_apply_core_v2(r.id);
    v_result := v_result||jsonb_build_object('core',v_step);
    if not coalesce((v_step->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status','source_frozen',
        'retryable',true,
        'steps',v_result
      );
    end if;
  end if;

  select * into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id;

  if r.status='core_validated' then
    v_step := public.season_transition_engine_apply_rewards_v2(r.id);
    v_result := v_result||jsonb_build_object('rewards',v_step);
    if not coalesce((v_step->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status','core_validated',
        'retryable',true,
        'steps',v_result
      );
    end if;
  end if;

  select * into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id;

  if r.status in ('rewards_applied','communication_pending') then
    v_step := public.season_transition_engine_dispatch_communications_v2(r.id);
    v_result := v_result||jsonb_build_object('communications',v_step);
    if not coalesce((v_step->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status','communication_pending',
        'retryable',true,
        'steps',v_result
      );
    end if;
  end if;

  select * into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id;

  if r.status='communication_done' then
    v_step := public.season_transition_engine_finalize_v2(r.id);
    v_result := v_result||jsonb_build_object('finalize',v_step);
    if not coalesce((v_step->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status','communication_done',
        'retryable',true,
        'steps',v_result
      );
    end if;
  end if;

  select * into r
  from public.season_transition_engine_runs_v2
  where id=p_run_id;

  if r.status='completed' and coalesce(p_resume_after_success,false) then
    v_step := public.season_transition_engine_resume_completed_v2(r.id);
    v_result := v_result||jsonb_build_object('resume',v_step);
    if not coalesce((v_step->>'ok')::boolean,false) then
      return jsonb_build_object(
        'ok',false,
        'run_id',r.id,
        'status','completed',
        'retryable',true,
        'steps',v_result
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok',r.status='completed',
    'run_id',r.id,
    'status',r.status,
    'steps',v_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_boundary_controller_v2(p_old_date date, p_new_date date, p_resume_after_success boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source integer;
  v_target integer;
  v_source_end date;
  v_target_start date;

  v_current_season integer;
  v_current_date date;
  v_state_paused boolean;

  v_control public.season_transition_control_v1%rowtype;
  v_v2_run_id uuid;
  v_existing_run public.season_transition_engine_runs_v2%rowtype;

  v_arm jsonb;
  v_freeze jsonb;
  v_continue jsonb;
  v_result jsonb;
begin
  if p_old_date is null or p_new_date is null then
    return jsonb_build_object(
      'ok',false,'error','boundary controller requires old and new dates'
    );
  end if;

  v_source := public.season_from_game_date(p_old_date);
  v_target := public.season_from_game_date(p_new_date);

  if v_target<=v_source then
    return jsonb_build_object(
      'ok',true,
      'boundary_crossed',false,
      'source_season',v_source,
      'target_season',v_target
    );
  end if;

  if v_target<>v_source+1 then
    return jsonb_build_object(
      'ok',false,
      'boundary_crossed',true,
      'error','invalid season jump',
      'source_season',v_source,
      'target_season',v_target
    );
  end if;

  v_source_end := public.get_game_date_for_season_end(v_source);
  v_target_start := public.get_game_date_for_season_start(v_target);

  if p_old_date is distinct from v_source_end
     or p_new_date is distinct from v_target_start then
    return jsonb_build_object(
      'ok',false,
      'boundary_crossed',true,
      'error','season boundary must be exact Dec-31 -> Jan-1',
      'source_end_date',v_source_end,
      'target_start_date',v_target_start,
      'old_date',p_old_date,
      'new_date',p_new_date
    );
  end if;

  if not pg_try_advisory_xact_lock(
    hashtext('public.season_transition_boundary_controller_v2')::bigint
  ) then
    return jsonb_build_object(
      'ok',false,'retryable',true,'error','boundary controller lock is busy'
    );
  end if;

  select
    g.season_number,
    public.get_current_game_date_date(),
    g.is_paused
  into
    v_current_season,
    v_current_date,
    v_state_paused
  from public.game_state g
  where g.id=true
  for update;

  if v_current_season is distinct from v_source
     or v_current_date is distinct from v_source_end then
    return jsonb_build_object(
      'ok',false,
      'error','live game is not at the expected source-season Dec-31 boundary',
      'current_season',v_current_season,
      'current_date',v_current_date,
      'expected_season',v_source,
      'expected_date',v_source_end
    );
  end if;

  select *
  into v_control
  from public.season_transition_control_v1
  where id=true
  for update;

  if not found then
    update public.game_state set is_paused=true where id=true;
    update public.game_clock_config set is_paused=true where id=true;
    return jsonb_build_object(
      'ok',false,'error','season transition control is missing','game_paused',true
    );
  end if;

  -- If no pair was armed in advance, auto-arm at the exact boundary.
  -- admin_arm_season_transition_v1 itself enforces the 14-component gate.
  if not coalesce(v_control.is_armed,false) then
    begin
      v_arm := public.admin_arm_season_transition_v1(
        v_source,
        v_target,
        'Auto-armed by Season Transition Engine v2 at exact Dec-31 boundary'
      );
    exception when others then
      update public.game_state set is_paused=true where id=true;
      update public.game_clock_config set is_paused=true where id=true;
      return jsonb_build_object(
        'ok',false,
        'error','automatic boundary arming failed',
        'detail',sqlerrm,
        'game_paused',true
      );
    end;
  else
    if v_control.armed_source_season is distinct from v_source
       or v_control.armed_target_season is distinct from v_target then
      update public.game_state set is_paused=true where id=true;
      update public.game_clock_config set is_paused=true where id=true;
      return jsonb_build_object(
        'ok',false,
        'error','transition is armed for a different season pair',
        'armed_source',v_control.armed_source_season,
        'armed_target',v_control.armed_target_season,
        'expected_source',v_source,
        'expected_target',v_target,
        'game_paused',true
      );
    end if;
  end if;

  -- Fail closed from this point onward.
  update public.game_state set is_paused=true where id=true;
  update public.game_clock_config set is_paused=true where id=true;

  -- Refuse duplicate completed production v2 transition.
  select *
  into v_existing_run
  from public.season_transition_engine_runs_v2 r
  where r.source_season=v_source
    and r.target_season=v_target
    and r.mode='production'
    and r.status in (
      'created','source_frozen','core_applied','core_validated',
      'rewards_applied','communication_pending','communication_done',
      'final_validated','completed'
    )
  order by r.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok',false,
      'error','production v2 transition already exists for this pair',
      'run_id',v_existing_run.id,
      'status',v_existing_run.status,
      'game_paused',true
    );
  end if;

  begin
    v_v2_run_id := public.season_transition_engine_create_run_v2(
      v_source,
      v_target,
      'production',
      null,
      null,
      'Automatic production boundary transition'
    );
  exception when others then
    return jsonb_build_object(
      'ok',false,
      'error','v2 production run creation failed',
      'detail',sqlerrm,
      'game_paused',true
    );
  end;

  v_freeze := public.season_transition_engine_freeze_source_v2(v_v2_run_id);

  if not coalesce((v_freeze->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'run_id',v_v2_run_id,
      'status','freeze_failed',
      'source_freeze',v_freeze,
      'game_paused',true
    );
  end if;

  -- Move to exact target Jan-1 boundary while remaining paused.
  update public.game_state
  set season_number=v_target,
      month_number=1,
      day_number=1,
      hour_number=0,
      minute_number=0,
      tick_version=coalesce(tick_version,0)+1,
      is_paused=true,
      last_advanced_at=clock_timestamp()
  where id=true;

  update public.game_clock_config
  set base_real_at=clock_timestamp(),
      base_game_at=v_target_start::timestamp,
      base_season=v_target,
      is_paused=true
  where id=true;

  -- Preserve the existing deferred daily-processing architecture.
  insert into public.game_daily_tick_backlog_v1(
    current_game_date,
    season_number,
    month_number,
    day_number,
    tick_version,
    status,
    source,
    payload
  )
  select
    v_target_start,
    v_target,
    1,
    1,
    coalesce(g.tick_version,0),
    'pending',
    'season_transition_boundary_controller_v2',
    jsonb_build_object(
      'reason','target Jan-1 daily processors deferred until after v2 transition',
      'source_season',v_source,
      'target_season',v_target,
      'v2_run_id',v_v2_run_id,
      'created_at',now()
    )
  from public.game_state g
  where g.id=true
  on conflict(current_game_date) do update
  set status=case
        when public.game_daily_tick_backlog_v1.status='processed'
        then public.game_daily_tick_backlog_v1.status
        else 'pending'
      end,
      updated_at=now(),
      payload=public.game_daily_tick_backlog_v1.payload
        || excluded.payload
        || jsonb_build_object('touched_by_boundary_v2_at',now());

  v_continue := public.season_transition_engine_continue_v2(
    v_v2_run_id,
    p_resume_after_success
  );

  if not coalesce((v_continue->>'ok')::boolean,false) then
    return jsonb_build_object(
      'ok',false,
      'boundary_crossed',true,
      'run_id',v_v2_run_id,
      'source_season',v_source,
      'target_season',v_target,
      'source_freeze',v_freeze,
      'transition',v_continue,
      'game_paused',true,
      'retryable',true
    );
  end if;

  insert into public.season_reset_guard(
    season_number,
    reset_ran_on_month,
    reset_ran_on_day,
    created_at
  )
  values(v_target,1,1,now())
  on conflict(season_number) do update
  set reset_ran_on_month=excluded.reset_ran_on_month,
      reset_ran_on_day=excluded.reset_ran_on_day,
      created_at=excluded.created_at;

  update public.season_transition_engine_runs_v2
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'boundary_controller','season_transition_boundary_controller_v2',
        'boundary_old_date',p_old_date,
        'boundary_new_date',p_new_date,
        'resume_after_success',p_resume_after_success
      ),
      updated_at=now()
  where id=v_v2_run_id;

  v_result := jsonb_build_object(
    'ok',true,
    'boundary_crossed',true,
    'run_id',v_v2_run_id,
    'source_season',v_source,
    'target_season',v_target,
    'source_freeze',v_freeze,
    'transition',v_continue,
    'resumed',coalesce(p_resume_after_success,false)
  );

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_season_calendar_stage_point_reconciliation_v2(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source_year integer := 1999 + p_source_season;
  v_target_year integer := 1999 + p_target_season;
  v_source_rows integer := 0;
  v_target_rows integer := 0;
  v_allowed_derived_rows integer := 0;
  v_blocking_stage_count integer := 0;
  v_orphan_target_points integer := 0;
  v_blocking jsonb := '[]'::jsonb;
  rec record;
  v_expected jsonb;
  v_actual jsonb;
  v_point_results integer;
  v_stage_results integer;
  v_simulation_runs integer;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'target season must equal source season + 1';
  end if;

  select count(*)::integer
  into v_source_rows
  from public.race_stage_points p
  join public.race_stages s on s.id=p.stage_id
  join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::integer=v_source_year
    and r.status<>'archived';

  select count(*)::integer
  into v_target_rows
  from public.race_stage_points p
  join public.race_stages s on s.id=p.stage_id
  join public.races r on r.id=s.race_id
  where extract(year from r.start_date)::integer=v_target_year
    and r.metadata->>'calendar_source_season'=p_source_season::text;

  /*
   * Target points must belong to a deterministic target stage whose source
   * stage still exists in the final source calendar.
   */
  select count(*)::integer
  into v_orphan_target_points
  from public.race_stage_points p
  join public.race_stages ts on ts.id=p.stage_id
  join public.races tr on tr.id=ts.race_id
  where extract(year from tr.start_date)::integer=v_target_year
    and tr.metadata->>'calendar_source_season'=p_source_season::text
    and not exists (
      select 1
      from public.race_stages ss
      join public.races sr on sr.id=ss.race_id
      where extract(year from sr.start_date)::integer=v_source_year
        and sr.status<>'archived'
        and public.season_calendar_deterministic_uuid_v1(
              'stage|'||ss.id::text||'|season|'||p_target_season::text
            )=ts.id
    );

  if v_orphan_target_points>0 then
    v_blocking_stage_count := v_blocking_stage_count + 1;
    v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
      'reason','orphan_target_points',
      'rows',v_orphan_target_points
    ));
  end if;

  for rec in
    with paired as (
      select
        sr.name as race_name,
        ss.id as source_stage_id,
        ss.stage_number,
        ss.distance_km::numeric as distance_km,
        coalesce(ss.intermediate_sprints_json,'[]'::jsonb) as intermediate_sprints_json,
        coalesce(ss.mountain_climbs_json,'[]'::jsonb) as mountain_climbs_json,
        public.season_calendar_deterministic_uuid_v1(
          'stage|'||ss.id::text||'|season|'||p_target_season::text
        ) as target_stage_id,
        (select count(*)::integer from public.race_stage_points sp where sp.stage_id=ss.id) as source_count,
        (select count(*)::integer from public.race_stage_points tp
          where tp.stage_id=public.season_calendar_deterministic_uuid_v1(
            'stage|'||ss.id::text||'|season|'||p_target_season::text
          )) as target_count
      from public.race_stages ss
      join public.races sr on sr.id=ss.race_id
      where extract(year from sr.start_date)::integer=v_source_year
        and sr.status<>'archived'
    )
    select * from paired where source_count<>target_count
  loop
    /* Missing target rows or divergence from an existing source definition is unsafe. */
    if rec.target_count < rec.source_count or rec.source_count > 0 then
      v_blocking_stage_count := v_blocking_stage_count + 1;
      if jsonb_array_length(v_blocking)<25 then
        v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
          'race',rec.race_name,
          'stage',rec.stage_number,
          'source_stage_id',rec.source_stage_id,
          'target_stage_id',rec.target_stage_id,
          'source_rows',rec.source_count,
          'target_rows',rec.target_count,
          'reason',case when rec.target_count<rec.source_count
                        then 'target_missing_source_point_rows'
                        else 'target_diverges_from_existing_source_points' end
        ));
      end if;
      continue;
    end if;

    /*
     * The only self-healing allowance is source_count=0 and target_count>0.
     * Do not reinterpret a historical stage that already produced sporting output.
     */
    select
      (select count(*)::integer from public.race_stage_point_results x where x.stage_id=rec.source_stage_id),
      (select count(*)::integer from public.race_stage_results x where x.stage_id=rec.source_stage_id),
      (select count(*)::integer from public.race_stage_simulation_runs x where x.stage_id=rec.source_stage_id)
    into v_point_results,v_stage_results,v_simulation_runs;

    if v_point_results>0 or v_stage_results>0 or v_simulation_runs>0 then
      v_blocking_stage_count := v_blocking_stage_count + 1;
      if jsonb_array_length(v_blocking)<25 then
        v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
          'race',rec.race_name,
          'stage',rec.stage_number,
          'source_stage_id',rec.source_stage_id,
          'target_stage_id',rec.target_stage_id,
          'source_rows',rec.source_count,
          'target_rows',rec.target_count,
          'reason','source_stage_has_sporting_dependencies',
          'point_results',v_point_results,
          'stage_results',v_stage_results,
          'simulation_runs',v_simulation_runs
        ));
      end if;
      continue;
    end if;

    /*
     * Build the exact semantic point definition from SOURCE stage JSON.
     * We compare stable fields only; DB triggers may normalize bonus arrays.
     */
    with expected_rows as (
      select
        'START'::text as point_type,
        0::numeric as km_from_start,
        'Stage start'::text as point_name,
        null::text as kom_category,
        false as is_finish_point

      union all

      select
        case when upper(coalesce(x.item->>'point_type',''))='BONUS_SPRINT'
             then 'BONUS_SPRINT' else 'INTERMEDIATE_SPRINT' end,
        (x.item->>'km')::numeric,
        coalesce(nullif(x.item->>'name',''),'Intermediate sprint '||x.ordinal_number::text),
        null::text,
        false
      from jsonb_array_elements(rec.intermediate_sprints_json)
           with ordinality as x(item,ordinal_number)
      where nullif(x.item->>'km','') is not null

      union all

      select
        'KOM'::text,
        (x.item->>'km')::numeric,
        coalesce(nullif(x.item->>'name',''),'KOM '||x.ordinal_number::text),
        nullif(regexp_replace(coalesce(x.item->>'category',''),'^Cat[[:space:]]*','','i'),''),
        false
      from jsonb_array_elements(rec.mountain_climbs_json)
           with ordinality as x(item,ordinal_number)
      where nullif(x.item->>'km','') is not null

      union all

      select
        'FINISH'::text,
        rec.distance_km,
        'Finish sprint'::text,
        null::text,
        true
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'type',upper(point_type),
      'km',round(km_from_start,3),
      'name',point_name,
      'kom',coalesce(kom_category,''),
      'finish',is_finish_point
    ) order by km_from_start,upper(point_type),point_name,coalesce(kom_category,''),is_finish_point),'[]'::jsonb)
    into v_expected
    from expected_rows;

    select coalesce(jsonb_agg(jsonb_build_object(
      'type',upper(p.point_type),
      'km',round(p.km_from_start::numeric,3),
      'name',p.name,
      'kom',coalesce(p.kom_category,''),
      'finish',coalesce(p.is_finish_point,false)
    ) order by p.km_from_start,upper(p.point_type),p.name,coalesce(p.kom_category,''),coalesce(p.is_finish_point,false)),'[]'::jsonb)
    into v_actual
    from public.race_stage_points p
    where p.stage_id=rec.target_stage_id;

    if v_expected=v_actual then
      v_allowed_derived_rows := v_allowed_derived_rows + rec.target_count;
    else
      v_blocking_stage_count := v_blocking_stage_count + 1;
      if jsonb_array_length(v_blocking)<25 then
        v_blocking := v_blocking || jsonb_build_array(jsonb_build_object(
          'race',rec.race_name,
          'stage',rec.stage_number,
          'source_stage_id',rec.source_stage_id,
          'target_stage_id',rec.target_stage_id,
          'source_rows',rec.source_count,
          'target_rows',rec.target_count,
          'reason','target_rows_not_explained_by_source_stage_json'
        ));
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok',v_blocking_stage_count=0,
    'source_rows',v_source_rows,
    'target_rows',v_target_rows,
    'row_delta',v_target_rows-v_source_rows,
    'allowed_target_derived_rows',v_allowed_derived_rows,
    'blocking_stage_count',v_blocking_stage_count,
    'orphan_target_points',v_orphan_target_points,
    'blocking_sample',v_blocking,
    'policy','Allow target-only point definitions only when source relational rows are absent, source sporting dependencies are zero, and target rows exactly match source stage JSON.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_rider_contract_negotiation_rollover_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stale_before integer := 0;
  v_missing_club integer := 0;
  v_missing_roster integer := 0;
  v_missing_contract integer := 0;
  v_closed integer := 0;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'Contract negotiation rollover requires target = source + 1';
  end if;

  select
    count(*) filter (
      where
        not exists (
          select 1
          from public.clubs c
          where c.id = n.club_id
            and c.deleted_at is null
            and coalesce(c.is_active, true) = true
            and coalesce(c.club_type, 'main') = 'main'
        )
        or not exists (
          select 1
          from public.club_riders cr
          join public.clubs roster_club on roster_club.id = cr.club_id
          where cr.rider_id = n.rider_id
            and roster_club.deleted_at is null
            and (
              cr.club_id = n.club_id
              or (
                roster_club.parent_club_id = n.club_id
                and roster_club.club_type = 'developing'
              )
            )
        )
        or not exists (
          select 1
          from public.rider_contracts rc
          where rc.rider_id = n.rider_id
            and rc.club_id = n.club_id
            and rc.status = 'active'
            and coalesce(
              rc.end_season_number,
              public.season_from_game_date(rc.expires_on)
            ) >= p_target_season
        )
    ),
    count(*) filter (
      where not exists (
        select 1
        from public.clubs c
        where c.id = n.club_id
          and c.deleted_at is null
          and coalesce(c.is_active, true) = true
          and coalesce(c.club_type, 'main') = 'main'
      )
    ),
    count(*) filter (
      where not exists (
        select 1
        from public.club_riders cr
        join public.clubs roster_club on roster_club.id = cr.club_id
        where cr.rider_id = n.rider_id
          and roster_club.deleted_at is null
          and (
            cr.club_id = n.club_id
            or (
              roster_club.parent_club_id = n.club_id
              and roster_club.club_type = 'developing'
            )
          )
      )
    ),
    count(*) filter (
      where not exists (
        select 1
        from public.rider_contracts rc
        where rc.rider_id = n.rider_id
          and rc.club_id = n.club_id
          and rc.status = 'active'
          and coalesce(
            rc.end_season_number,
            public.season_from_game_date(rc.expires_on)
          ) >= p_target_season
      )
    )
  into
    v_stale_before,
    v_missing_club,
    v_missing_roster,
    v_missing_contract
  from public.rider_contract_negotiations n
  where n.status = 'open'
    and coalesce(n.opened_in_season, p_source_season) <= p_source_season;

  update public.rider_contract_negotiations n
  set
    status = 'expired',
    responded_at = coalesce(n.responded_at, now()),
    locked_until = null,
    closed_reason = 'season_transition_relationship_ended',
    notes_json = coalesce(n.notes_json, '{}'::jsonb) || jsonb_build_object(
      'season_transition_cleanup', true,
      'season_transition_source_season', p_source_season,
      'season_transition_target_season', p_target_season,
      'season_transition_run_id', p_transition_run_id,
      'season_transition_cleanup_reason', 'club_roster_or_contract_relationship_ended'
    ),
    updated_at = now()
  where n.status = 'open'
    and coalesce(n.opened_in_season, p_source_season) <= p_source_season
    and (
      not exists (
        select 1
        from public.clubs c
        where c.id = n.club_id
          and c.deleted_at is null
          and coalesce(c.is_active, true) = true
          and coalesce(c.club_type, 'main') = 'main'
      )
      or not exists (
        select 1
        from public.club_riders cr
        join public.clubs roster_club on roster_club.id = cr.club_id
        where cr.rider_id = n.rider_id
          and roster_club.deleted_at is null
          and (
            cr.club_id = n.club_id
            or (
              roster_club.parent_club_id = n.club_id
              and roster_club.club_type = 'developing'
            )
          )
      )
      or not exists (
        select 1
        from public.rider_contracts rc
        where rc.rider_id = n.rider_id
          and rc.club_id = n.club_id
          and rc.status = 'active'
          and coalesce(
            rc.end_season_number,
            public.season_from_game_date(rc.expires_on)
          ) >= p_target_season
      )
    );

  get diagnostics v_closed = row_count;

  return jsonb_build_object(
    'ok', true,
    'source_season', p_source_season,
    'target_season', p_target_season,
    'stale_before', v_stale_before,
    'closed', v_closed,
    'missing_live_club', v_missing_club,
    'missing_roster_relationship', v_missing_roster,
    'missing_active_contract', v_missing_contract,
    'close_status', 'expired',
    'close_reason', 'season_transition_relationship_ended'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_stale_contract_negotiations_for_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_closed integer:=0;
  v_by_reason jsonb:='{}'::jsonb;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'target season must equal source season + 1';
  end if;

  with stale as (
    select *
    from public.season_transition_stale_contract_negotiations_v1(p_source_season)
  ),
  updated as (
    update public.rider_contract_negotiations n
    set status='expired',
        responded_at=coalesce(n.responded_at,now()),
        locked_until=null,
        closed_reason='season_transition_'||s.stale_reason,
        notes_json=coalesce(n.notes_json,'{}'::jsonb)||jsonb_build_object(
          'season_transition_cleanup',true,
          'season_transition_cleanup_reason',s.stale_reason,
          'season_transition_run_id',p_transition_run_id,
          'source_season',p_source_season,
          'target_season',p_target_season
        ),
        updated_at=now()
    from stale s
    where n.id=s.negotiation_id
      and n.status='open'
    returning s.stale_reason
  ),
  grouped as (
    select stale_reason,count(*)::integer n
    from updated
    group by stale_reason
  )
  select
    coalesce(sum(n),0)::integer,
    coalesce(jsonb_object_agg(stale_reason,n),'{}'::jsonb)
  into v_closed,v_by_reason
  from grouped;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'closed_count',v_closed,
    'closed_by_reason',v_by_reason,
    'remaining_stale_open_count',(
      select count(*)
      from public.season_transition_stale_contract_negotiations_v1(p_source_season)
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_preflight_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game jsonb;
  v_transition_functions jsonb := '[]'::jsonb;
  v_transition_engine_present boolean := false;
  v_source_snapshot_rows bigint := 0;
  v_source_snapshot_clubs bigint := 0;
  v_snapshot_missing_clubs bigint := 0;
  v_snapshot_soft_deleted bigint := 0;
  v_snapshot_inactive bigint := 0;
  v_snapshot_tier_mismatch bigint := 0;
  v_snapshot_division_mismatch bigint := 0;
  v_main_clubs bigint := 0;
  v_developing_clubs bigint := 0;
  v_ai_main_clubs bigint := 0;
  v_user_main_clubs bigint := 0;
  v_duplicate_riders bigint := 0;
  v_country_mismatch_riders bigint := 0;
  v_locked_national_teams bigint := 0;
  v_locked_national_violations bigint := 0;
  v_missing_name_pool_clubs bigint := 0;
  v_missing_name_pool_details jsonb := '[]'::jsonb;
  v_s1_races bigint := 0;
  v_s1_stages bigint := 0;
  v_s1_results bigint := 0;
  v_s2_results bigint := 0;
  v_s1_points_ledger bigint := 0;
  v_s2_points_ledger bigint := 0;
  v_target jsonb;
  v_ready boolean;
begin
  select jsonb_build_object(
    'season', gs.season_number,
    'month', gs.month_number,
    'day', gs.day_number,
    'hour', gs.hour_number,
    'minute', gs.minute_number,
    'paused', gs.is_paused,
    'tick_version', gs.tick_version,
    'last_advanced_at', gs.last_advanced_at
  )
  into v_game
  from public.game_state gs
  limit 1;

  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'name', p.proname,
        'identity_arguments', pg_get_function_identity_arguments(p.oid),
        'definition_md5', md5(pg_get_functiondef(p.oid))
      )
      order by p.proname, pg_get_function_identity_arguments(p.oid)
    ), '[]'::jsonb),
    bool_or(p.proname = 'season_transition_engine_execute_v2')
  into v_transition_functions, v_transition_engine_present
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'season_transition_engine_execute_v2',
      'verify_new_season_fresh_state_v1',
      'process_rider_contract_negotiation_rollover_v1',
      'run_ai_roster_season_transition_v1'
    );

  select count(*), count(distinct s.club_id)
  into v_source_snapshot_rows, v_source_snapshot_clubs
  from public.team_ranking_season_snapshots s
  where s.season_number = 1;

  select count(*)
  into v_snapshot_missing_clubs
  from public.team_ranking_season_snapshots s
  left join public.clubs c on c.id = s.club_id
  where s.season_number = 1
    and c.id is null;

  select
    count(*) filter (where c.deleted_at is not null),
    count(*) filter (where coalesce(c.is_active, true) = false),
    count(*) filter (where lower(coalesce(c.club_tier::text,'')) <> lower(coalesce(s.club_tier,''))),
    count(*) filter (
      where coalesce(c.tier2_division::text,'') <> coalesce(s.tier2_division,'')
         or coalesce(c.tier3_division::text,'') <> coalesce(s.tier3_division,'')
         or coalesce(c.amateur_division::text,'') <> coalesce(s.amateur_division,'')
    )
  into
    v_snapshot_soft_deleted,
    v_snapshot_inactive,
    v_snapshot_tier_mismatch,
    v_snapshot_division_mismatch
  from public.team_ranking_season_snapshots s
  join public.clubs c on c.id = s.club_id
  where s.season_number = 1;

  select
    count(*) filter (where coalesce(c.club_type::text,'main') = 'main'),
    count(*) filter (where c.club_type::text = 'developing'),
    count(*) filter (where coalesce(c.club_type::text,'main') = 'main' and coalesce(c.is_ai,false)),
    count(*) filter (where coalesce(c.club_type::text,'main') = 'main' and not coalesce(c.is_ai,false))
  into v_main_clubs, v_developing_clubs, v_ai_main_clubs, v_user_main_clubs
  from public.clubs c
  where c.deleted_at is null;

  select count(*)
  into v_duplicate_riders
  from (
    select cr.rider_id
    from public.club_riders cr
    group by cr.rider_id
    having count(*) > 1
  ) d;

  select count(*)
  into v_country_mismatch_riders
  from public.club_riders cr
  join public.clubs c on c.id = cr.club_id
  join public.riders r on r.id = cr.rider_id
  where c.deleted_at is null
    and coalesce(c.club_type::text,'main') = 'main'
    and r.country_code is distinct from c.country_code;

  select count(*)
  into v_locked_national_teams
  from public.club_roster_country_rules rr
  join public.clubs c on c.id = rr.club_id
  where rr.rule_key = 'national_team_country_lock_v1'
    and rr.is_active = true
    and c.deleted_at is null;

  select count(*)
  into v_locked_national_violations
  from public.club_roster_country_rules rr
  join public.clubs c on c.id = rr.club_id
  join public.club_riders cr on cr.club_id = c.id
  join public.riders r on r.id = cr.rider_id
  where rr.rule_key = 'national_team_country_lock_v1'
    and rr.is_active = true
    and c.deleted_at is null
    and r.country_code is distinct from rr.allowed_country_code;

  with club_countries as (
    select distinct c.country_code
    from public.clubs c
    where c.deleted_at is null
      and coalesce(c.club_type::text,'main') = 'main'
      and c.country_code is not null
  ), missing as (
    select cc.country_code
    from club_countries cc
    where not exists (
      select 1 from public.first_names_master fn
      where upper(fn.country_code) = upper(cc.country_code)
    )
    or not exists (
      select 1 from public.last_names_master ln
      where upper(ln.country_code) = upper(cc.country_code)
    )
  )
  select
    count(*),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'country_code', m.country_code,
        'club_count', (
          select count(*) from public.clubs c2
          where c2.deleted_at is null
            and coalesce(c2.club_type::text,'main') = 'main'
            and upper(c2.country_code) = upper(m.country_code)
        ),
        'locked_national_team_count', (
          select count(*)
          from public.club_roster_country_rules rr2
          join public.clubs c3 on c3.id = rr2.club_id
          where rr2.rule_key = 'national_team_country_lock_v1'
            and rr2.is_active = true
            and c3.deleted_at is null
            and upper(rr2.allowed_country_code) = upper(m.country_code)
        )
      ) order by m.country_code
    ), '[]'::jsonb)
  into v_missing_name_pool_clubs, v_missing_name_pool_details
  from missing m;

  if to_regclass('public.races') is not null then
    select count(*) into v_s1_races
    from public.races r
    where extract(year from r.start_date)::integer = 2000;
  end if;

  if to_regclass('public.race_stages') is not null then
    select count(*) into v_s1_stages
    from public.race_stages s
    where extract(year from s.stage_date)::integer = 2000;
  end if;

  if to_regclass('public.race_stage_results') is not null then
    select count(*) into v_s1_results
    from public.race_stage_results rsr
    join public.race_stages s on s.id = rsr.stage_id
    where extract(year from s.stage_date)::integer = 2000;

    select count(*) into v_s2_results
    from public.race_stage_results rsr
    join public.race_stages s on s.id = rsr.stage_id
    where extract(year from s.stage_date)::integer = 2001;
  end if;

  if to_regclass('public.international_points_awards_ledger_v1') is not null then
    execute 'select count(*) from public.international_points_awards_ledger_v1 where season_year = 2000'
      into v_s1_points_ledger;
    execute 'select count(*) from public.international_points_awards_ledger_v1 where season_year = 2001'
      into v_s2_points_ledger;
  end if;

  v_target := jsonb_build_object(
    'season', 1,
    'month', 1,
    'day', 1,
    'hour', 1,
    'minute', 0,
    'paused', true
  );

  v_ready :=
    v_transition_engine_present
    and v_source_snapshot_clubs > 0
    and v_snapshot_missing_clubs = 0
    and v_duplicate_riders = 0
    and v_locked_national_violations = 0;

  return jsonb_build_object(
    'status', case when v_ready then 'ready_for_reset_build' else 'blocked' end,
    'read_only', true,
    'target_game_state', v_target,
    'current_game_state', coalesce(v_game, '{}'::jsonb),
    'season_transition_engine', jsonb_build_object(
      'present', v_transition_engine_present,
      'functions', v_transition_functions,
      'note', 'Function hashes are captured for comparison. The reset framework does not alter these functions.'
    ),
    'season1_competition_source', jsonb_build_object(
      'snapshot_rows', v_source_snapshot_rows,
      'distinct_clubs', v_source_snapshot_clubs,
      'missing_from_clubs', v_snapshot_missing_clubs,
      'currently_soft_deleted', v_snapshot_soft_deleted,
      'currently_inactive', v_snapshot_inactive,
      'tier_mismatches_vs_s1', v_snapshot_tier_mismatch,
      'division_mismatches_vs_s1', v_snapshot_division_mismatch
    ),
    'current_clubs', jsonb_build_object(
      'main', v_main_clubs,
      'developing', v_developing_clubs,
      'ai_main', v_ai_main_clubs,
      'user_main', v_user_main_clubs
    ),
    'roster_integrity', jsonb_build_object(
      'duplicate_rider_assignments', v_duplicate_riders,
      'main_team_country_mismatch_riders', v_country_mismatch_riders,
      'locked_national_teams', v_locked_national_teams,
      'locked_national_team_violations', v_locked_national_violations
    ),
    'native_name_pool_preflight', jsonb_build_object(
      'countries_missing_native_name_pool', v_missing_name_pool_clubs,
      'details', v_missing_name_pool_details,
      'policy_required', case when v_missing_name_pool_clubs > 0 then true else false end
    ),
    'season_data', jsonb_build_object(
      's1_races', v_s1_races,
      's1_stages', v_s1_stages,
      's1_stage_results', v_s1_results,
      's2_stage_results', v_s2_results,
      's1_international_points_ledger_rows', v_s1_points_ledger,
      's2_international_points_ledger_rows', v_s2_points_ledger
    ),
    'safety', jsonb_build_object(
      'changes_game_state', false,
      'changes_season_transition_engine', false,
      'performs_reset', false,
      'next_step', 'Build reset execution functions only after reviewing this preflight.'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_truncate_if_exists_v1(p_schema text, p_table text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reg regclass;
begin
  v_reg := to_regclass(format('%I.%I', p_schema, p_table));
  if v_reg is null then
    return 0;
  end if;

  execute format('truncate table %I.%I cascade', p_schema, p_table);
  return 1;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_prepare_v1(p_confirm text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_run_id uuid := gen_random_uuid();
  v_preflight jsonb;
  v_source jsonb;
begin
  if btrim(coalesce(p_confirm,'')) <> 'RESET TO SEASON 1' then
    raise exception 'Confirmation must be RESET TO SEASON 1';
  end if;

  v_preflight := public.game_world_reset_preflight_v1();
  if coalesce(v_preflight->>'status','') <> 'ready_for_reset_build' then
    raise exception 'Reset preflight is not ready: %', v_preflight;
  end if;

  select jsonb_build_object(
    'season', season_number,
    'month', month_number,
    'day', day_number,
    'hour', hour_number,
    'minute', minute_number,
    'paused', is_paused,
    'tick_version', tick_version,
    'last_advanced_at', last_advanced_at
  ) into v_source
  from public.game_state
  where id = true;

  insert into public.game_world_reset_runs(
    id, requested_by, status, target_season, target_month, target_day,
    target_hour, target_minute, source_game_state, preflight_report,
    created_at, updated_at
  ) values (
    v_run_id, auth.uid(), 'preflight', 1, 1, 1, 1, 0,
    v_source, v_preflight, now(), now()
  );

  insert into public.game_world_reset_checkpoints(reset_run_id, phase, checkpoint_type, payload)
  select v_run_id, 'preflight', 'transition_function_hashes',
         jsonb_agg(jsonb_build_object(
           'name', p.proname,
           'identity_arguments', pg_get_function_identity_arguments(p.oid),
           'definition_md5', md5(pg_get_functiondef(p.oid))
         ) order by p.proname)
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'season_transition_engine_execute_v2',
      'verify_new_season_fresh_state_v1',
      'process_rider_contract_negotiation_rollover_v1',
      'run_ai_roster_season_transition_v1'
    );

  return v_run_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_freeze_v1(p_reset_run_id uuid, p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_state jsonb;
begin
  if btrim(coalesce(p_confirm,'')) <> 'FREEZE RESET' then
    raise exception 'Confirmation must be FREEZE RESET';
  end if;

  if not exists (
    select 1 from public.game_world_reset_runs
    where id=p_reset_run_id and status in ('preflight','source_frozen')
  ) then
    raise exception 'Prepared reset run not found.';
  end if;

  perform pg_advisory_xact_lock(hashtext('game_world_reset_v1')::bigint);

  update public.game_state
  set is_paused=true
  where id=true;

  update public.game_clock_config
  set is_paused=true
  where id=true;

  update public.game_world_reset_runs
  set status='source_frozen', started_at=coalesce(started_at,now()), updated_at=now()
  where id=p_reset_run_id;

  select jsonb_build_object(
    'season',season_number,'month',month_number,'day',day_number,
    'hour',hour_number,'minute',minute_number,'paused',is_paused,
    'tick_version',tick_version
  ) into v_state
  from public.game_state where id=true;

  insert into public.game_world_reset_checkpoints(reset_run_id,phase,checkpoint_type,payload)
  values(p_reset_run_id,'source_frozen','game_state',v_state);

  return jsonb_build_object('ok',true,'reset_run_id',p_reset_run_id,'game_state',v_state);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_validate_core_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_clock_bad bigint;
  v_competition_bad bigint;
  v_points_bad bigint;
  v_main_roster_bad bigint;
  v_domestic_bad bigint;
  v_duplicates bigint;
  v_national_bad bigint;
  v_assigned_staff bigint;
  v_equipment_bad bigint;
  v_s1_results bigint;
  v_s1_classifications bigint;
  v_s1_rank_awards bigint;
  v_s1_points_ledger bigint;
  v_future_races bigint;
  v_s1_not_scheduled bigint;
  v_ranking_snapshots bigint;
  v_free_agents bigint;
  v_transition_armed bigint;
  v_transition_hash_bad bigint;
  v_user_sponsor_bad bigint;
  v_ok boolean;
begin
  select count(*) into v_clock_bad
  from public.game_state gs
  join public.game_clock_config gc on gc.id=true
  where gs.id=true and not (
    gs.season_number=1 and gs.month_number=1 and gs.day_number=1
    and gs.hour_number=1 and gs.minute_number=0 and gs.is_paused=true
    and gc.is_paused=true and gc.base_season=1
  );

  select count(*) into v_competition_bad
  from public.game_world_reset_s1_competition_baseline_v1 b
  join public.clubs c on c.id=b.club_id
  where c.deleted_at is not null
     or c.is_active is distinct from true
     or c.club_tier::text is distinct from b.club_tier
     or c.tier2_division is distinct from b.tier2_division
     or c.tier3_division is distinct from b.tier3_division
     or c.amateur_division is distinct from b.amateur_division
     or c.is_ai is distinct from (c.owner_user_id is null);

  select count(*) into v_points_bad
  from public.clubs c
  join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
  where coalesce(c.season_points,0)<>0;

  select count(*) into v_main_roster_bad
  from (
    select b.club_id, count(cr.rider_id) riders
    from public.game_world_reset_s1_competition_baseline_v1 b
    join public.clubs c on c.id=b.club_id and coalesce(c.club_type,'main')='main'
    left join public.club_riders cr on cr.club_id=b.club_id
    group by b.club_id
    having count(cr.rider_id)<>10
  ) x;

  select count(*) into v_domestic_bad
  from public.game_world_reset_s1_competition_baseline_v1 b
  join public.club_riders cr on cr.club_id=b.club_id
  join public.riders r on r.id=cr.rider_id
  join public.clubs c on c.id=b.club_id
  where upper(coalesce(r.country_code,'')) is distinct from upper(coalesce(c.country_code,''));

  select count(*) into v_duplicates
  from (
    select rider_id from public.club_riders group by rider_id having count(*)>1
  ) d;

  select count(*) into v_national_bad
  from public.club_roster_country_rules rule
  join public.club_riders cr on cr.club_id=rule.club_id
  join public.riders r on r.id=cr.rider_id
  where rule.rule_key='national_team_country_lock_v1'
    and rule.is_active=true
    and upper(coalesce(r.country_code,'')) is distinct from upper(coalesce(rule.allowed_country_code,''));

  select count(*) into v_assigned_staff from public.club_staff;

  select count(*) into v_equipment_bad
  from (
    select b.club_id, count(e.id) items
    from public.game_world_reset_s1_competition_baseline_v1 b
    left join public.club_equipment_inventory e
      on e.club_id=b.club_id and coalesce(e.status,'ready') not in ('sold','discarded')
    group by b.club_id
    having count(e.id)<>60
  ) e;

  select count(*) into v_s1_results
  from public.race_stage_results rr
  join public.race_stages s on s.id=rr.stage_id
  where s.stage_date >= date '2000-01-01' and s.stage_date < date '2001-01-01';

  select count(*) into v_s1_classifications
  from public.race_classification_standings rc
  join public.races r on r.id=rc.race_id
  where r.start_date >= date '2000-01-01' and r.start_date < date '2001-01-01';

  select count(*) into v_s1_rank_awards
  from public.race_ranking_point_awards a
  join public.race_stages s on s.id=a.stage_id
  where s.stage_date >= date '2000-01-01' and s.stage_date < date '2001-01-01';

  select count(*) into v_s1_points_ledger
  from public.international_points_awards_ledger_v1
  where season_year=2000;

  select count(*) into v_future_races
  from public.races where start_date >= date '2001-01-01';

  select count(*) into v_s1_not_scheduled
  from public.races
  where start_date >= date '2000-01-01' and start_date < date '2001-01-01'
    and status is distinct from 'scheduled';

  select count(*) into v_ranking_snapshots from public.team_ranking_season_snapshots;

  select count(*) into v_free_agents
  from public.rider_free_agents
  where status='available' and source_type='generated';

  select count(*) into v_transition_armed
  from public.season_transition_control_v1
  where id=true and (is_armed=true or armed_source_season is not null or armed_target_season is not null);

  select count(*) into v_transition_hash_bad
  from (values
    ('process_rider_contract_negotiation_rollover_v1','b1ad997c6a3b05345d06c141c18bd921'),
    ('run_ai_roster_season_transition_v1','e9e0335cd686fae666d0536d19eb3b4d'),
    ('season_transition_engine_execute_v2','14a891494404e7a0f4f5675d038388b8'),
    ('verify_new_season_fresh_state_v1','881c94d739df9b5f9590a6e7a2497b66')
  ) expected(name,expected_md5)
  left join pg_proc p on p.proname=expected.name
  left join pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  where p.oid is null or md5(pg_get_functiondef(p.oid)) is distinct from expected.expected_md5;

  select count(*) into v_user_sponsor_bad
  from public.clubs c
  join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
  where c.owner_user_id is not null
    and coalesce(c.club_type,'main')='main'
    and not exists (
      select 1 from public.club_sponsor_offers o
      where o.club_id=c.id and o.season_number=1 and o.status='offered'
    );

  v_ok := v_clock_bad=0
    and v_competition_bad=0
    and v_points_bad=0
    and v_main_roster_bad=0
    and v_domestic_bad=0
    and v_duplicates=0
    and v_national_bad=0
    and v_assigned_staff=0
    and v_equipment_bad=0
    and v_s1_results=0
    and v_s1_classifications=0
    and v_s1_rank_awards=0
    and v_s1_points_ledger=0
    and v_future_races=0
    and v_s1_not_scheduled=0
    and v_ranking_snapshots=0
    and v_free_agents=56
    and v_transition_armed=0
    and v_transition_hash_bad=0
    and v_user_sponsor_bad=0;

  return jsonb_build_object(
    'ok',v_ok,
    'clock_bad',v_clock_bad,
    'competition_bad',v_competition_bad,
    'points_bad',v_points_bad,
    'main_roster_bad',v_main_roster_bad,
    'domestic_rider_mismatches',v_domestic_bad,
    'duplicate_rider_assignments',v_duplicates,
    'national_team_violations',v_national_bad,
    'assigned_staff',v_assigned_staff,
    'equipment_bad_clubs',v_equipment_bad,
    's1_stage_results',v_s1_results,
    's1_classifications',v_s1_classifications,
    's1_ranking_awards',v_s1_rank_awards,
    's1_international_points_ledger',v_s1_points_ledger,
    'future_races',v_future_races,
    's1_races_not_scheduled',v_s1_not_scheduled,
    'ranking_snapshot_rows',v_ranking_snapshots,
    'available_generated_free_agents',v_free_agents,
    'transition_armed_rows',v_transition_armed,
    'transition_function_hash_mismatches',v_transition_hash_bad,
    'user_clubs_without_sponsor_offers',v_user_sponsor_bad
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_execute_core_v1(p_reset_run_id uuid, p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_validation jsonb;
  v_new_timeline uuid := gen_random_uuid();
  v_old_timeline uuid;
  v_temp_first_ids uuid[] := array[]::uuid[];
  v_temp_last_ids uuid[] := array[]::uuid[];
  v_staff_generated integer := 0;
  v_staff_pass integer := 0;
  v_fa record;
  v_rec record;
  v_coin_delta integer;
  v_previous_reset_at timestamptz;
  v_equipment_result jsonb;
  v_balance_result jsonb;
  v_before_counts jsonb;
  v_execution jsonb;
begin
  if btrim(coalesce(p_confirm,'')) <> 'EXECUTE RESET TO SEASON 1' then
    raise exception 'Confirmation must be EXECUTE RESET TO SEASON 1';
  end if;

  if not exists (
    select 1 from public.game_world_reset_runs
    where id=p_reset_run_id and status='source_frozen'
  ) then
    raise exception 'Reset run must be source_frozen before execution.';
  end if;

  if not exists (select 1 from public.game_state where id=true and is_paused=true)
     or not exists (select 1 from public.game_clock_config where id=true and is_paused=true) then
    raise exception 'Game must be paused in both game_state and game_clock_config.';
  end if;

  perform pg_advisory_xact_lock(hashtext('game_world_reset_v1')::bigint);
  perform pg_advisory_xact_lock(hashtext('public.run_game_minute_tick_if_unpaused_v1')::bigint);

  select jsonb_build_object(
    'riders',(select count(*) from public.riders),
    'club_riders',(select count(*) from public.club_riders),
    'club_staff',(select count(*) from public.club_staff),
    'equipment',(select count(*) from public.club_equipment_inventory),
    's1_stage_results',(select count(*) from public.race_stage_results rr join public.race_stages s on s.id=rr.stage_id where s.stage_date>=date '2000-01-01' and s.stage_date<date '2001-01-01'),
    'future_races',(select count(*) from public.races where start_date>=date '2001-01-01'),
    'sponsor_offers',(select count(*) from public.club_sponsor_offers),
    'sponsors',(select count(*) from public.club_sponsors)
  ) into v_before_counts;

  insert into public.game_world_reset_checkpoints(reset_run_id,phase,checkpoint_type,payload)
  values(p_reset_run_id,'source_frozen','world_counts_before_reset',v_before_counts);

  begin
    perform set_config('request.jwt.claim.role','service_role',true);
    perform set_config('finance.internal','1',true);

    -- Reset target clock, kept paused.
    update public.game_state
    set season_number=1, month_number=1, day_number=1, hour_number=1, minute_number=0,
        is_paused=true, last_advanced_at=null, tick_version=tick_version+1
    where id=true;

    update public.game_clock_config
    set base_real_at=clock_timestamp(),
        base_game_at=timestamp '2000-01-01 01:00:00',
        base_season=1,
        is_paused=true
    where id=true;

    -- New transition timeline; old transition runs remain immutable audit history.
    select timeline_id into v_old_timeline from public.season_transition_control_v1 where id=true for update;
    update public.season_transition_timeline_history_v1
    set closed_at=coalesce(closed_at,clock_timestamp()),
        closed_game_date=coalesce(closed_game_date,date '2001-01-02'),
        close_note=coalesce(close_note,'Closed by game world reset to Season 1')
    where timeline_id=v_old_timeline and closed_at is null;

    insert into public.season_transition_timeline_history_v1(
      timeline_id,opened_at,opened_game_date,open_note
    ) values (
      v_new_timeline,clock_timestamp(),date '2000-01-01',
      'Fresh Season 1 timeline created by game_world_reset_execute_v1 reset '||p_reset_run_id::text
    );

    update public.season_transition_control_v1
    set timeline_id=v_new_timeline,is_armed=false,armed_source_season=null,
        armed_target_season=null,armed_at=null,armed_note=null,updated_at=clock_timestamp()
    where id=true;

    -- Sponsors / commercial simulated state.
    perform public.game_world_reset_truncate_if_exists_v1('public','club_technical_sponsor_discount_ledger');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_technical_sponsor_benefits');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_sponsor_objectives');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_sponsor_offers');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_sponsors');

    -- Notifications/inbox simulated state.
    perform public.game_world_reset_truncate_if_exists_v1('public','notifications');

    -- Race preparation, participation, results, rankings, simulations and mutable race state.
    perform public.game_world_reset_truncate_if_exists_v1('public','race_preparations');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_team_applications');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_team_entries');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_participant_riders');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_participant_teams');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_classification_standings');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_prize_awards');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_ranking_point_awards');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_point_results');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_simulation_runs');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_replay_frames');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_report_events');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_authoritative_runs');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_automation_state');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_incidents');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_results');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_rider_states');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_team_states');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_plans');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_plan_management');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_plan_generation_log');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_team_stage_disqualifications');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_leader_snapshots');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_day_readiness_events');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_commitment_score_events');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_race_commitment_scores');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_stage_weather_exposure_events');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_wear_applications');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_supply_applications');
    perform public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_equipment_wear_applications');

    -- Training/camp runtime not guaranteed to be rider-FK-bound.
    perform public.game_world_reset_truncate_if_exists_v1('public','training_camp_bookings');
    perform public.game_world_reset_truncate_if_exists_v1('public','training_camp_daily_processing_log');
    perform public.game_world_reset_truncate_if_exists_v1('public','training_camp_daily_reports');

    -- Rider world: CASCADE clears contracts, free agents, transfers, health, training, development and rider-bound history.
    truncate table public.riders cascade;

    -- Assigned staff world and staff market.
    truncate table public.club_staff cascade;
    perform public.game_world_reset_truncate_if_exists_v1('public','staff_candidates');
    perform public.game_world_reset_truncate_if_exists_v1('public','staff_market_daily_runs');
    perform public.game_world_reset_truncate_if_exists_v1('public','staff_payroll_runs');

    -- Equipment/assets/supplies and infrastructure runtime.
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_maintenance_jobs');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_setup_presets');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_default_setup');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_starter_seed_log');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_auto_restock_rules');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_maintenance_reminders');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_equipment_inventory');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_assets');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_vehicles');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_asset_deliveries');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_asset_orders');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_vehicle_deliveries');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_vehicle_orders');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_race_supplies');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_race_supply_units');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_race_supplies_low_notification_state');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_supply_inventory');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_supplies');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_infrastructure_jobs');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_infrastructure_projects');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_infrastructure_asset_holdings');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_infrastructure_asset_repair_jobs');

    -- Mutable finance display/state. Immutable finance transactions/entries remain audit history.
    perform public.game_world_reset_truncate_if_exists_v1('public','club_finance_transactions');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_finance_transaction_history');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_finance_events');
    perform public.game_world_reset_truncate_if_exists_v1('public','finance_events');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_income_history');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_expense_history');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_tax_history');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_tax_records');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_tax_liabilities');
    perform public.game_world_reset_truncate_if_exists_v1('public','club_policy_history');
    perform public.game_world_reset_truncate_if_exists_v1('public','team_policy_history');
    truncate table public.club_finance_summary;
    truncate table finance.club_insolvency_state;
    truncate table finance.emergency_loan_repayment_runs;
    truncate table finance.emergency_loans cascade;
    truncate table finance.monthly_tax_audits;
    truncate table finance.event_locks;
    truncate table finance.system_state;

    -- Competition/reward end-of-season state. Baseline already persisted separately.
    perform public.game_world_reset_truncate_if_exists_v1('public','club_season_reward_grants');
    perform public.game_world_reset_truncate_if_exists_v1('public','season_reward_guard');
    perform public.game_world_reset_truncate_if_exists_v1('public','season_reward_runs');
    perform public.game_world_reset_truncate_if_exists_v1('public','season_reset_guard');
    perform public.game_world_reset_truncate_if_exists_v1('public','season_reset_runs');
    perform public.game_world_reset_truncate_if_exists_v1('public','team_ranking_past_winners');
    truncate table public.team_ranking_season_snapshots;

    -- Remove all future calendars. The existing S1 calendar remains the canonical S1 fixture set.
    delete from public.races where start_date >= date '2001-01-01';

    update public.races
    set status='scheduled', updated_at=clock_timestamp()
    where start_date >= date '2000-01-01' and start_date < date '2001-01-01';

    perform public.game_world_reset_clear_s1_race_weather_runtime_state_v1();

    perform * from public.recalculate_race_entry_deadlines_v1(null);
    perform public.sync_race_application_statuses_v1();

    -- Keep non-S1 club rows quarantined. Restore exactly the 499-club S1 competition universe.
    update public.clubs c
    set is_active=false
    where not exists (
      select 1 from public.game_world_reset_s1_competition_baseline_v1 b where b.club_id=c.id
    );

    update public.clubs c
    set club_tier=b.club_tier::public.club_tier,
        tier2_division=b.tier2_division,
        tier3_division=b.tier3_division,
        amateur_division=b.amateur_division,
        is_ai=case when c.owner_user_id is null then true else false end,
        is_active=true,
        deleted_at=null,
        season_points=0,
        reputation=0,
        cash_balance=0,
        inactivity_status='active',
        inactive_at=null,
        archived_at=null,
        inactivity_reason=null,
        inactive_ai_controlled=false,
        season_end_transition_pending=false,
        inactivity_days_snapshot=null,
        inactivity_effective_season=null,
        inactivity_season_end_action=null,
        created_game_date=date '2000-01-01',
        updated_at=clock_timestamp()
    from public.game_world_reset_s1_competition_baseline_v1 b
    where c.id=b.club_id;

    -- Reset finance account balances for S1 clubs; ledger rows are retained as pre-reset audit history.
    update finance.account_balances ab
    set balance=0, updated_at=clock_timestamp()
    from finance.accounts a
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=a.club_id
    where ab.account_id=a.id;

    -- Rider name pools are permanent and country-specific; no temporary cross-country fallback seeding is required.

    -- Main-team rosters use the existing canonical domestic generator, then canonical contracts.
    for v_rec in
      select c.id,c.is_ai,c.owner_user_id
      from public.clubs c
      join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
      where coalesce(c.club_type,'main')='main'
      order by c.id
    loop
      perform public._generate_domestic_roster_for_club(v_rec.id);
      perform public.initialize_club_rider_contracts(v_rec.id);
      select public.apply_new_club_creation_balance_v1(
        v_rec.id,
        (v_rec.is_ai=false and v_rec.owner_user_id is not null)
      ) into v_balance_result;
      select public.equipment_seed_starter_inventory_for_club_safe(v_rec.id) into v_equipment_result;
    end loop;

    perform public.game_world_reset_reconcile_starting_cash_v1(p_reset_run_id);

    -- Developing/U23 fixture stays a Developing Team and gets its configured 10-rider domestic U23 baseline.
    for v_rec in
      select c.id,c.country_code,c.parent_club_id
      from public.clubs c
      join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
      where c.club_type='developing'
      order by c.id
    loop
      perform public.seed_developing_team_roster(v_rec.id,v_rec.country_code,10);
      perform public.ensure_new_club_defaults_v1(v_rec.id);
      update public.clubs set cash_balance=0,season_points=0,reputation=0 where id=v_rec.id;
      insert into public.club_finance_summary(club_id,current_balance,weekly_income,weekly_expenses,wage_total)
      values(v_rec.id,0,0,0,0)
      on conflict(club_id) do update set current_balance=0,weekly_income=0,weekly_expenses=0,wage_total=0,updated_at=clock_timestamp();
      select public.equipment_seed_starter_inventory_for_club_safe(v_rec.id) into v_equipment_result;
    end loop;

    -- Temporary name rows are not part of the permanent master catalog.
    delete from public.first_names_master where id=any(v_temp_first_ids);
    delete from public.last_names_master where id=any(v_temp_last_ids);

    -- Ensure payroll rows exist for every fresh active contract, including Developing Team riders.
    insert into public.rider_payroll_state(
      contract_id,rider_id,club_id,payroll_status,missed_payment_weeks,
      outstanding_salary_debt,outstanding_breach_fine,release_due_to_nonpayment,last_paid_on
    )
    select rc.id,rc.rider_id,rc.club_id,'active',0,0,0,false,null
    from public.rider_contracts rc
    where rc.status='active'
      and not exists(select 1 from public.rider_payroll_state ps where ps.contract_id=rc.id);

    for v_rec in
      select club_id from public.game_world_reset_s1_competition_baseline_v1
    loop
      perform public.recompute_club_wage_total(v_rec.club_id);
    end loop;

    -- Fresh free-agent market: current canonical targets 30 Amateur + 18 Continental + 8 ProTeam.
    select * into v_fa from public.seed_generated_free_agent_pool(30,18,8);

    -- Fresh staff market: repeat the canonical capped refill until every role target is satisfied.
    loop
      exit when v_staff_pass >= 50;
      v_staff_generated := public.staff_market_refill_available_candidates(null);
      v_staff_pass := v_staff_pass + 1;
      exit when v_staff_generated=0;
    end loop;

    -- Preserve the existing Developing Team fixture for this S1 test universe, but reset it to Season 1 access.
    insert into public.developing_team_season_access(
      main_club_id,developing_club_id,access_status,active_season,expires_after_season,
      auto_renew,activated_at,renewed_at,updated_at
    )
    select c.parent_club_id,c.id,'active',1,1,true,clock_timestamp(),null,clock_timestamp()
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    where c.club_type='developing' and c.parent_club_id is not null
    on conflict(main_club_id) do update
      set developing_club_id=excluded.developing_club_id,
          access_status='active',active_season=1,expires_after_season=1,
          auto_renew=true,activated_at=excluded.activated_at,renewed_at=null,updated_at=excluded.updated_at;

    -- Rebase only simulated-world coin effects since the previous successful reset. Account purchases/Premium/customization remain.
    select max(completed_at) into v_previous_reset_at
    from public.game_world_reset_runs
    where id<>p_reset_run_id and status='completed';

    for v_rec in
      select l.user_id, coalesce(sum(l.delta),0)::integer as game_delta
      from public.user_coin_ledger l
      where (v_previous_reset_at is null or l.created_at>v_previous_reset_at)
        and (
          l.reason='daily_charge'
          or (l.reason in ('competition_reward_coins','competition_reward_correction') and coalesce((l.payload_json->>'source_season')::integer,1)=1)
          or (l.reason='developing_team_season_renewal' and coalesce((l.payload_json->>'season')::integer,2)>=2)
        )
      group by l.user_id
      having coalesce(sum(l.delta),0)<>0
    loop
      v_coin_delta := -v_rec.game_delta;
      perform public.apply_coin_delta(
        v_rec.user_id,
        v_coin_delta,
        'game_world_reset_coin_rebase',
        jsonb_build_object(
          'system_key','game_world_reset_coin_rebase:'||p_reset_run_id::text||':'||v_rec.user_id::text,
          'reset_run_id',p_reset_run_id,
          'reversed_game_delta',v_rec.game_delta,
          'preserved_account_entitlements',true
        )
      );
    end loop;

    -- New finance visibility epoch for user clubs: old immutable statement rows remain audit history but are before this restart marker.
    insert into public.club_restart_history(
      user_id,club_id,club_name,preserved_slot,released_rider_count,reset_summary,created_at
    )
    select c.owner_user_id,c.id,c.name,
      jsonb_build_object(
        'club_id',c.id,'club_tier',c.club_tier,'tier2_division',c.tier2_division,
        'tier3_division',c.tier3_division,'amateur_division',c.amateur_division
      ),
      0,
      jsonb_build_object('source','game_world_reset_v1','reset_run_id',p_reset_run_id,'target','S1 Jan 1 01:00'),
      clock_timestamp()
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    where c.owner_user_id is not null and coalesce(c.club_type,'main')='main';

    -- Fresh Season 1 sponsor offers only for player-controlled main clubs; no contract is auto-signed.
    for v_rec in
      select c.id
      from public.clubs c
      join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
      where c.owner_user_id is not null and coalesce(c.club_type,'main')='main'
      order by c.id
    loop
      perform public.sponsor_generate_offers(v_rec.id,true);
    end loop;

    update public.game_world_reset_runs
    set status='teams_rebuilt',updated_at=clock_timestamp()
    where id=p_reset_run_id;

    v_validation := public.game_world_reset_validate_v2();
    if coalesce((v_validation->>'ok')::boolean,false) is not true then
      raise exception 'Fresh S1 reset validation failed: %',v_validation;
    end if;

    update public.game_world_reset_runs
    set status='world_validated',validation_report=v_validation,updated_at=clock_timestamp()
    where id=p_reset_run_id;

    v_execution := jsonb_build_object(
      'target','Season 1 · January 1 · 01:00',
      'paused',true,
      'competition_clubs',(select count(*) from public.game_world_reset_s1_competition_baseline_v1),
      'riders',(select count(*) from public.riders),
      'assigned_riders',(select count(*) from public.club_riders),
      'generated_free_agents',(select count(*) from public.rider_free_agents where status='available' and source_type='generated'),
      'equipment_items',(select count(*) from public.club_equipment_inventory),
      'staff_candidates',(select count(*) from public.staff_candidates where coalesce(is_available,false)=true),
      'new_timeline_id',v_new_timeline,
      'old_timeline_id',v_old_timeline,
      'transition_engine_modified',false
    );

    insert into public.game_world_reset_checkpoints(reset_run_id,phase,checkpoint_type,payload)
    values(p_reset_run_id,'world_validated','validation',v_validation);

    update public.game_world_reset_runs
    set status='completed',execution_report=v_execution,validation_report=v_validation,
        completed_at=clock_timestamp(),updated_at=clock_timestamp(),error_text=null
    where id=p_reset_run_id;

    return jsonb_build_object('ok',true,'reset_run_id',p_reset_run_id,'execution',v_execution,'validation',v_validation);

  exception when others then
    update public.game_world_reset_runs
    set status='failed',error_text=sqlerrm,
        rollback_report=jsonb_build_object(
          'world_changes_rolled_back',true,
          'game_remains_paused',true,
          'error',sqlerrm
        ),
        updated_at=clock_timestamp()
    where id=p_reset_run_id;

    insert into public.game_world_reset_checkpoints(reset_run_id,phase,checkpoint_type,payload)
    values(p_reset_run_id,'source_frozen','execution_failed',jsonb_build_object('error',sqlerrm,'world_changes_rolled_back',true));

    return jsonb_build_object('ok',false,'reset_run_id',p_reset_run_id,'error',sqlerrm,'world_changes_rolled_back',true,'game_remains_paused',true);
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_reconcile_starting_cash_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  r record;
  v_current numeric;
  v_delta bigint;
  v_credited integer:=0;
  v_debited integer:=0;
begin
  perform set_config('request.jwt.claim.role','service_role',true);
  perform set_config('finance.internal','1',true);

  for r in
    select c.id,c.name,c.club_tier::text as tier,tbp.starting_cash_user::bigint as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
    where coalesce(c.club_type,'main')='main'
      and c.owner_user_id is not null
      and c.is_ai=false
    order by c.id
  loop
    select coalesce(cash_balance,0) into v_current from public.clubs where id=r.id for update;
    if v_current < r.expected_cash then
      v_delta := (r.expected_cash-v_current)::bigint;
      perform public.finance_credit_to_club(
        r.id,v_delta,'game_world_reset_starting_cash','TREASURY',
        'game_world_reset_starting_cash:'||p_reset_run_id::text||':'||r.id::text,
        jsonb_build_object('reset_run_id',p_reset_run_id,'target_starting_cash',r.expected_cash,'reason','fresh_s1_starting_cash_reconcile')
      );
      v_credited:=v_credited+1;
    elsif v_current > r.expected_cash then
      v_delta := (v_current-r.expected_cash)::bigint;
      perform public.finance_spend_from_club(
        r.id,v_delta,'game_world_reset_starting_cash_rebase','SINK',
        'game_world_reset_starting_cash_rebase:'||p_reset_run_id::text||':'||r.id::text,
        jsonb_build_object('reset_run_id',p_reset_run_id,'target_starting_cash',r.expected_cash,'reason','fresh_s1_starting_cash_reconcile')
      );
      v_debited:=v_debited+1;
    end if;

    perform public.apply_new_club_creation_balance_v1(r.id,false);
  end loop;

  return jsonb_build_object('ok',true,'credited_clubs',v_credited,'debited_clubs',v_debited);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_validate_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare
  v_base jsonb;
  v_bad_club_cash bigint;
  v_bad_account_cash bigint;
  v_bad_summary bigint;
  v_backlog_rows bigint;
  v_hourly_rows bigint;
  v_day_rows bigint;
  v_race_runtime_flags bigint;
  v_forward_activation_bad bigint;
  v_race_activation_bad bigint;
  v_ok boolean;
begin
  v_base:=public.game_world_reset_validate_v1();

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash,
      c.cash_balance
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ) select count(*) into v_bad_club_cash from expected where coalesce(cash_balance,0)<>expected_cash;

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ), acct as (
    select a.club_id,coalesce(ab.balance,0)::numeric as balance
    from finance.accounts a join finance.account_balances ab on ab.account_id=a.id
    where a.currency='CASH' and a.kind='main' and a.club_id is not null
  ) select count(*) into v_bad_account_cash from expected e left join acct a on a.club_id=e.id
    where coalesce(a.balance,0)<>e.expected_cash;

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ) select count(*) into v_bad_summary from expected e left join public.club_finance_summary s on s.club_id=e.id
    where coalesce(s.current_balance,0)<>e.expected_cash;

  select count(*) into v_backlog_rows from public.game_daily_tick_backlog_v1;
  select count(*) into v_hourly_rows from public.hourly_game_processor_runs;
  select count(*) into v_day_rows from public.game_day_processor_runs;

  select count(*) into v_race_runtime_flags
  from public.races r
  where r.start_date>=date '2000-01-01' and r.start_date<date '2001-01-01'
    and coalesce(r.metadata,'{}'::jsonb) ?| array[
      'team_list_announcement_finalized','team_list_announcement_processed',
      'race_startlist_captains_finalized','captains_pending_rider_deadline',
      'forward_only_terminal_closure'
    ];

  select count(*) into v_forward_activation_bad
  from public.automation_forward_activation_v1 a
  where a.id=true and (
    a.activated_game_date<>date '2000-01-01'
    or a.daily_processing_starts_on<>date '2000-01-02'
    or a.activated_game_timestamp<>timestamptz '2000-01-01 01:00:00+00'
  );

  select count(*) into v_race_activation_bad
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true
    and c.active_engine='typescript_v1'
    and coalesce(c.typescript_lifecycle_enabled,false)=true
    and c.typescript_activation_game_at is distinct from timestamp '2000-01-01 01:00:00';

  v_ok:=coalesce((v_base->>'ok')::boolean,false)
        and v_bad_club_cash=0 and v_bad_account_cash=0 and v_bad_summary=0
        and v_backlog_rows=0 and v_hourly_rows=0 and v_day_rows=0
        and v_race_runtime_flags=0 and v_forward_activation_bad=0 and v_race_activation_bad=0;

  return v_base || jsonb_build_object(
    'ok',v_ok,
    'bad_club_starting_cash',v_bad_club_cash,
    'bad_finance_account_starting_cash',v_bad_account_cash,
    'bad_finance_summary_starting_cash',v_bad_summary,
    'runtime_backlog_rows',v_backlog_rows,
    'runtime_hourly_processor_runs',v_hourly_rows,
    'runtime_daily_processor_runs',v_day_rows,
    'runtime_race_metadata_flags',v_race_runtime_flags,
    'forward_activation_bad',v_forward_activation_bad,
    'typescript_activation_bad',v_race_activation_bad
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_clear_s1_race_weather_runtime_state_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_races integer := 0;
  v_stages integer := 0;
begin
  update public.races
  set metadata = coalesce(metadata,'{}'::jsonb)
      - array[
          'weather_total_stage_count',
          'weather_result_stage_count',
          'weather_state_finalized_at',
          'weather_cancellation_status',
          'weather_completed_run_count',
          'weather_all_stages_cancelled',
          'weather_cancelled_stage_count',
          'weather_all_stages_have_completed_runs'
        ]::text[],
      updated_at = clock_timestamp()
  where start_date >= date '2000-01-01'
    and start_date < date '2001-01-01'
    and (
      metadata ? 'weather_total_stage_count'
      or metadata ? 'weather_result_stage_count'
      or metadata ? 'weather_state_finalized_at'
      or metadata ? 'weather_cancellation_status'
      or metadata ? 'weather_completed_run_count'
      or metadata ? 'weather_all_stages_cancelled'
      or metadata ? 'weather_cancelled_stage_count'
      or metadata ? 'weather_all_stages_have_completed_runs'
    );
  get diagnostics v_races = row_count;

  update public.race_stages
  set weather_snapshot='{}'::jsonb,
      weather_summary=null,
      weather_cancelled=false,
      weather_cancellation_reason=null,
      weather_cancelled_at=null
  where stage_date >= date '2000-01-01'
    and stage_date < date '2001-01-01';
  get diagnostics v_stages = row_count;

  return jsonb_build_object(
    'ok',true,
    'races_runtime_weather_cleared',v_races,
    'stages_weather_reset',v_stages
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_club_starting_cash_v1(p_club_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_amount bigint;
begin
  select case
    when coalesce(c.is_ai,false) = true
      or c.owner_user_id is null
      or coalesce(c.club_type,'main') = 'developing'
      then 0::bigint
    else coalesce(tbp.starting_cash_user,0)::bigint
  end
  into v_amount
  from public.clubs c
  left join public.team_tier_balance_profiles tbp
    on tbp.tier_key = public._get_club_balance_tier_key(c.id)
  where c.id = p_club_id;

  if not found then
    raise exception 'Club not found: %', p_club_id;
  end if;

  return coalesce(v_amount,0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_charge_club_rider_wages(p_club_id uuid, p_idempotency_key text, p_payroll_date date DEFAULT NULL::date)
 RETURNS TABLE(transaction_id uuid, total_wages bigint, rider_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
  v_ai_finance_enabled boolean := false;
begin
  select
    case when c.club_type='developing' then c.parent_club_id else c.id end
  into v_finance_club_id
  from public.clubs c
  where c.id=p_club_id
  limit 1;

  if v_finance_club_id is null then
    raise exception 'Could not resolve finance club for club %',p_club_id;
  end if;

  select
    coalesce(c.is_ai,false),
    coalesce(tbp.ai_finance_enabled,false)
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
  select *
  from public._finance_charge_club_rider_wages_core_v1(
    p_club_id,p_idempotency_key,p_payroll_date
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_weekly_rider_wages()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_finalize_main_offer_portfolio_v2(p_club_id uuid, p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_club public.clubs%rowtype;
  v_club_group text;
  v_desired_nonregional integer := 0;
  v_desired_naming integer := 0;
  v_current_nonregional integer := 0;
  v_current_naming integer := 0;
  v_missing_nonregional integer := 0;
  v_missing_naming integer := 0;
  v_geo_replaced integer := 0;
  v_naming_prepared integer := 0;
  v_renewal_prepared integer := 0;

  v_source_season integer;
  v_prior record;
  v_prior_objectives integer := 0;
  v_prior_completed integer := 0;
  v_success_rate numeric := 0;
  v_final_position integer;
  v_division text;
  v_division_size integer := 0;
  v_performance_percentile numeric := 1;
  v_renewal_probability numeric := 0;
  v_renewal_roll numeric := 1;
  v_renewal_uplift numeric := 0;
  v_renew_offer record;
  v_base_guaranteed bigint;
  v_base_bonus bigint;
  v_new_full_guaranteed bigint;
  v_new_full_bonus bigint;
  v_new_guaranteed bigint;
  v_new_bonus bigint;
  v_new_monthly bigint;

  v_offer record;
  v_candidate record;
  v_naming_uplift numeric;
begin
  if p_club_id is null or p_season is null then
    raise exception 'Club id and season are required.';
  end if;

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null
    and c.is_active = true
    and coalesce(c.club_type::text, 'main') = 'main'
  limit 1;

  if not found then
    raise exception 'Live main club not found.';
  end if;

  if auth.role() <> 'service_role'
     and auth.uid() is not null
     and not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed to finalize sponsor offers for this club.';
  end if;

  if not exists (
    select 1
    from public.club_sponsor_offers o
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
  ) then
    return jsonb_build_object(
      'ok', true,
      'club_id', p_club_id,
      'season_number', p_season,
      'main_offers', 0,
      'nonregional_replacements', 0,
      'naming_rights_prepared', 0,
      'renewal_prepared', 0
    );
  end if;

  select cgm.group_code
    into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = upper(v_club.country_code)
  limit 1;

  case v_club.club_tier
    when 'worldteam' then
      v_desired_nonregional := 6;
      v_desired_naming := 2;
    when 'proteam' then
      v_desired_nonregional := 3;
      v_desired_naming := 1;
    else
      v_desired_nonregional := 0;
      v_desired_naming := 0;
  end case;

  /*
    Previous-main-sponsor renewal.
    Only season-start portfolios can receive a renewal offer.
    The decision is deterministic so transition retries cannot change it.
  */
  v_source_season := p_season - 1;

  if v_source_season >= 1 and public.get_current_game_month() = 1 then
    select
      s.id,
      s.company_id,
      s.main_sponsor_deal_type,
      s.full_season_guaranteed_amount,
      s.full_season_bonus_pool_amount,
      s.guaranteed_amount,
      s.bonus_pool_amount,
      sc.name as company_name,
      sc.country_code as company_country_code,
      sc.logo_url,
      sc.home_group_code
    into v_prior
    from public.club_sponsors s
    join public.sponsor_companies sc
      on sc.id = s.company_id
     and sc.is_active = true
     and sc.sponsor_kind = 'main'
    where s.club_id = p_club_id
      and s.season_number = v_source_season
      and s.sponsor_kind = 'main'
    order by s.created_at desc
    limit 1;

    if found and v_prior.company_id is not null then
      select
        count(*)::integer,
        count(*) filter (
          where coalesce(o.objective_result_state, '') in ('completed', 'paid')
             or coalesce(o.status, '') in ('completed', 'paid')
        )::integer
      into v_prior_objectives, v_prior_completed
      from public.club_sponsor_objectives o
      where o.club_sponsor_id = v_prior.id;

      if v_prior_objectives > 0 then
        v_success_rate := v_prior_completed::numeric / v_prior_objectives::numeric;
      else
        v_success_rate := 0;
      end if;

      select s.final_position, s.division
        into v_final_position, v_division
      from public.team_ranking_season_snapshots s
      where s.season_number = v_source_season
        and s.club_id = p_club_id
      order by s.created_at desc
      limit 1;

      if v_final_position is not null then
        if v_division is not null then
          select count(*)::integer
            into v_division_size
          from public.team_ranking_season_snapshots s
          where s.season_number = v_source_season
            and s.division = v_division
            and coalesce(s.is_active, true) = true;
        else
          select count(*)::integer
            into v_division_size
          from public.team_ranking_season_snapshots s
          where s.season_number = v_source_season
            and s.club_tier = v_club.club_tier::text
            and coalesce(s.is_active, true) = true;
        end if;

        if v_division_size > 0 then
          v_performance_percentile := least(
            1,
            greatest(0, v_final_position::numeric / v_division_size::numeric)
          );
        end if;
      end if;

      if v_success_rate >= 0.90 and v_performance_percentile <= 0.10 then
        v_renewal_probability := 1.00;
        v_renewal_uplift := 15;
      elsif v_success_rate >= 0.75 and v_performance_percentile <= 0.25 then
        v_renewal_probability := 0.80;
        v_renewal_uplift := 10;
      elsif v_success_rate >= 0.60 and v_performance_percentile <= 0.50 then
        v_renewal_probability := 0.55;
        v_renewal_uplift := 5;
      else
        v_renewal_probability := 0;
        v_renewal_uplift := 0;
      end if;

      v_renewal_roll := (
        ('x' || substr(md5(
          p_club_id::text || '|' ||
          v_prior.company_id::text || '|' ||
          v_source_season::text || '|renewal'
        ), 1, 8))::bit(32)::bigint
      )::numeric / 4294967295::numeric;

      if v_renewal_probability > 0
         and v_renewal_roll <= v_renewal_probability
         and not exists (
           select 1
           from public.club_sponsor_offers x
           where x.club_id = p_club_id
             and x.season_number = p_season
             and x.company_id = v_prior.company_id
             and x.status <> 'offered'
         ) then

        select o.*
          into v_renew_offer
        from public.club_sponsor_offers o
        where o.club_id = p_club_id
          and o.season_number = p_season
          and o.sponsor_kind = 'main'
          and o.status = 'offered'
          and o.company_id = v_prior.company_id
        limit 1;

        if not found then
          select o.*
            into v_renew_offer
          from public.club_sponsor_offers o
          where o.club_id = p_club_id
            and o.season_number = p_season
            and o.sponsor_kind = 'main'
            and o.status = 'offered'
          order by md5(o.id::text || '|renewal-slot|' || p_season::text)
          limit 1;
        end if;

        if v_renew_offer.id is not null then
          v_base_guaranteed := coalesce(
            nullif(v_prior.full_season_guaranteed_amount, 0),
            nullif(v_prior.guaranteed_amount, 0),
            nullif(v_renew_offer.full_season_guaranteed_amount, 0),
            v_renew_offer.guaranteed_amount,
            0
          );
          v_base_bonus := coalesce(
            nullif(v_prior.full_season_bonus_pool_amount, 0),
            nullif(v_prior.bonus_pool_amount, 0),
            nullif(v_renew_offer.full_season_bonus_pool_amount, 0),
            v_renew_offer.bonus_pool_amount,
            0
          );

          v_new_full_guaranteed := round(
            v_base_guaranteed::numeric * (1 + v_renewal_uplift / 100.0)
          )::bigint;
          v_new_full_bonus := round(
            v_base_bonus::numeric * (1 + (v_renewal_uplift / 2.0) / 100.0)
          )::bigint;
          v_new_guaranteed := round(
            v_new_full_guaranteed::numeric * coalesce(v_renew_offer.proration_factor, 1)
          )::bigint;
          v_new_bonus := round(
            v_new_full_bonus::numeric * coalesce(v_renew_offer.proration_factor, 1)
          )::bigint;
          v_new_monthly := case
            when coalesce(v_renew_offer.coverage_months, 0) > 0
              then round(v_new_guaranteed::numeric / v_renew_offer.coverage_months)::bigint
            else v_new_guaranteed
          end;

          update public.club_sponsor_offers o
          set
            company_id = v_prior.company_id,
            main_sponsor_deal_type = 'standard',
            naming_rights_uplift_pct = 0,
            full_season_guaranteed_amount = v_new_full_guaranteed,
            full_season_bonus_pool_amount = v_new_full_bonus,
            guaranteed_amount = v_new_guaranteed,
            bonus_pool_amount = v_new_bonus,
            monthly_amount = v_new_monthly,
            metadata = (
              coalesce(o.metadata, '{}'::jsonb)
              - array[
                'deal_type',
                'main_sponsor_deal_type',
                'requires_team_name_change',
                'naming_rights_uplift_pct',
                'season_display_name',
                'naming_rights_display_name',
                'full_display_name',
                'full_display_name_preview',
                'team_name_preview',
                'branding_locked_fields'
              ]
            ) || jsonb_build_object(
              'company_name', v_prior.company_name,
              'company_country_code', v_prior.company_country_code,
              'logo_url', v_prior.logo_url,
              'is_renewal_offer', true,
              'renewal_from_season', v_source_season,
              'previous_contract_id', v_prior.id,
              'objective_success_rate', round(v_success_rate, 4),
              'previous_final_position', v_final_position,
              'previous_division_size', v_division_size,
              'sporting_performance_percentile', round(v_performance_percentile, 4),
              'renewal_probability', v_renewal_probability,
              'renewal_roll', round(v_renewal_roll, 4),
              'renewal_uplift_pct', v_renewal_uplift,
              'renewal_terms_improved', true,
              'portfolio_policy_version', 'v2'
            )
          where o.id = v_renew_offer.id;

          v_renewal_prepared := 1;

          if coalesce(v_prior.main_sponsor_deal_type, 'standard') = 'naming_rights' then
            v_naming_uplift := 20 + (
              (
                ('x' || substr(md5(v_renew_offer.id::text || '|renewal-naming'), 1, 8))::bit(32)::bigint
              ) % 1001
            )::numeric / 100.0;

            perform public.sponsor_prepare_main_offer_deal_metadata_v1(
              v_renew_offer.id,
              'naming_rights',
              v_naming_uplift,
              v_prior.company_name || ' Team'
            );

            update public.club_sponsor_offers o
            set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
              'full_display_name', (o.metadata->>'season_display_name') || ' (' || v_club.name || ')',
              'renewal_preserves_naming_rights', true
            )
            where o.id = v_renew_offer.id;
          end if;
        end if;
      end if;
    end if;
  end if;

  /*
    WorldTeam: minimum 6 of 15 main offers are outside the club market group.
    ProTeam: minimum 3 of 10 are outside the club market group.
    Local/regional shortages may naturally result in a larger non-regional share.
  */
  if v_desired_nonregional > 0 then
    select count(*)::integer
      into v_current_nonregional
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      );

    v_missing_nonregional := greatest(0, v_desired_nonregional - v_current_nonregional);

    for v_offer in
      select o.id
      from public.club_sponsor_offers o
      join public.sponsor_companies sc on sc.id = o.company_id
      left join public.country_market_group_members scm
        on upper(scm.country_code) = upper(sc.country_code)
      where o.club_id = p_club_id
        and o.season_number = p_season
        and o.sponsor_kind = 'main'
        and o.status = 'offered'
        and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
        and (
          upper(coalesce(sc.country_code, '')) = upper(coalesce(v_club.country_code, ''))
          or (
            v_club_group is not null
            and coalesce(sc.home_group_code, scm.group_code) = v_club_group
          )
        )
      order by md5(o.id::text || '|nonregional-slot|' || p_season::text)
      limit v_missing_nonregional
    loop
      select
        sc.id,
        sc.name,
        sc.country_code,
        sc.logo_url,
        coalesce(sc.home_group_code, scm.group_code) as sponsor_group_code
      into v_candidate
      from public.sponsor_companies sc
      left join public.country_market_group_members scm
        on upper(scm.country_code) = upper(sc.country_code)
      where sc.is_active = true
        and sc.sponsor_kind = 'main'
        and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
        and (
          v_club_group is null
          or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
        )
        and not exists (
          select 1
          from public.club_sponsor_offers x
          where x.club_id = p_club_id
            and x.season_number = p_season
            and x.company_id = sc.id
        )
        and not exists (
          select 1
          from public.club_sponsors s
          where s.club_id = p_club_id
            and s.season_number = p_season
            and s.company_id = sc.id
        )
      order by md5(sc.id::text || '|' || p_club_id::text || '|' || p_season::text || '|' || v_offer.id::text)
      limit 1;

      if not found then
        exit;
      end if;

      update public.club_sponsor_offers o
      set
        company_id = v_candidate.id,
        main_sponsor_deal_type = 'standard',
        naming_rights_uplift_pct = 0,
        metadata = (
          coalesce(o.metadata, '{}'::jsonb)
          - array[
            'deal_type',
            'main_sponsor_deal_type',
            'requires_team_name_change',
            'naming_rights_uplift_pct',
            'season_display_name',
            'naming_rights_display_name',
            'full_display_name',
            'full_display_name_preview',
            'team_name_preview',
            'branding_locked_fields',
            'is_renewal_offer',
            'renewal_from_season',
            'previous_contract_id',
            'objective_success_rate',
            'previous_final_position',
            'previous_division_size',
            'sporting_performance_percentile',
            'renewal_probability',
            'renewal_roll',
            'renewal_uplift_pct',
            'renewal_terms_improved'
          ]
        ) || jsonb_build_object(
          'company_name', v_candidate.name,
          'company_country_code', v_candidate.country_code,
          'logo_url', v_candidate.logo_url,
          'market_priority_bucket', 2,
          'market_match', 'non_regional',
          'portfolio_policy_version', 'v2'
        )
      where o.id = v_offer.id;

      v_geo_replaced := v_geo_replaced + 1;
    end loop;
  end if;

  /* Guarantee naming-rights choice for top two tiers. */
  select count(*)::integer
    into v_current_naming
  from public.club_sponsor_offers o
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and (
      o.main_sponsor_deal_type = 'naming_rights'
      or o.metadata->>'main_sponsor_deal_type' = 'naming_rights'
      or o.metadata->>'deal_type' = 'naming_rights'
    );

  v_missing_naming := greatest(0, v_desired_naming - v_current_naming);

  for v_offer in
    select o.id, sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce(o.main_sponsor_deal_type, 'standard') <> 'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
    order by md5(o.id::text || '|naming-slot|' || p_season::text)
    limit v_missing_naming
  loop
    v_naming_uplift := 20 + (
      (
        ('x' || substr(md5(v_offer.id::text || '|naming-uplift'), 1, 8))::bit(32)::bigint
      ) % 1001
    )::numeric / 100.0;

    perform public.sponsor_prepare_main_offer_deal_metadata_v1(
      v_offer.id,
      'naming_rights',
      v_naming_uplift,
      v_offer.company_name || ' Team'
    );

    update public.club_sponsor_offers o
    set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'full_display_name', (o.metadata->>'season_display_name') || ' (' || v_club.name || ')',
      'auto_generated_naming_rights', true,
      'portfolio_policy_version', 'v2'
    )
    where o.id = v_offer.id;

    v_naming_prepared := v_naming_prepared + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'club_id', p_club_id,
    'season_number', p_season,
    'tier', v_club.club_tier::text,
    'desired_nonregional', v_desired_nonregional,
    'nonregional_replacements', v_geo_replaced,
    'desired_naming_rights', v_desired_naming,
    'naming_rights_prepared', v_naming_prepared,
    'renewal_prepared', v_renewal_prepared
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_generate_offers(p_club_id uuid, p_force boolean DEFAULT false)
 RETURNS TABLE(season_number integer, game_month integer, coverage_months integer, proration_factor numeric, inserted_count integer, main_offers integer, secondary_offers integer, technical_offers integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_core record; v_finalize jsonb; v_headlines integer;
begin
  select * into v_core from public.sponsor_generate_offers_core_v1(p_club_id,p_force);
  if not found then return; end if;
  v_finalize:=public.sponsor_finalize_main_offer_portfolio_v6(p_club_id,v_core.season_number);
  v_headlines:=public.sponsor_set_main_offer_total_value_headlines_v1(p_club_id,v_core.season_number);
  return query select
    v_core.season_number::integer,v_core.game_month::integer,v_core.coverage_months::integer,v_core.proration_factor::numeric,v_core.inserted_count::integer,
    (select count(*)::integer from public.club_sponsor_offers o where o.club_id=p_club_id and o.season_number=v_core.season_number and o.sponsor_kind='main' and o.status='offered'),
    (select count(*)::integer from public.club_sponsor_offers o where o.club_id=p_club_id and o.season_number=v_core.season_number and o.sponsor_kind='secondary' and o.status='offered'),
    (select count(*)::integer from public.club_sponsor_offers o where o.club_id=p_club_id and o.season_number=v_core.season_number and o.sponsor_kind='technical' and o.status='offered');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_finalize_main_offer_portfolio_v3(p_club_id uuid, p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_club public.clubs%rowtype;
  v_club_group text;
  v_desired_worldwide integer := 0;
  v_current_worldwide integer := 0;
  v_missing_worldwide integer := 0;
  v_invalid_replaced integer := 0;
  v_quota_replaced integer := 0;
  v_offer record;
  v_candidate record;
begin
  v_base := public.sponsor_finalize_main_offer_portfolio_v2(p_club_id, p_season);

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null
    and c.is_active = true
    and coalesce(c.club_type::text, 'main') = 'main'
  limit 1;

  if not found then
    raise exception 'Live main club not found.';
  end if;

  select cgm.group_code
    into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = upper(v_club.country_code)
  limit 1;

  case v_club.club_tier
    when 'worldteam' then v_desired_worldwide := 6;
    when 'proteam' then v_desired_worldwide := 3;
    else v_desired_worldwide := 0;
  end case;

  if v_desired_worldwide = 0 then
    return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
      'worldwide_pool_policy_version', 'v3',
      'desired_worldwide_nonregional', 0,
      'invalid_nonregional_replaced', 0,
      'worldwide_quota_replaced', 0
    );
  end if;

  /*
    Replace ordinary out-of-region offers that are not from the explicit
    worldwide pool. Renewal offers are intentionally exempt because they
    preserve an existing sponsor relationship.
  */
  for v_offer in
    select
      o.id,
      coalesce(o.main_sponsor_deal_type, 'standard') as deal_type
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      )
      and not exists (
        select 1
        from public.sponsor_company_eligibility e
        where e.company_id = sc.id
          and e.is_active = true
          and e.scope_type = 'worldwide'
          and v_club.club_tier between e.min_club_tier and e.max_club_tier
      )
    order by md5(o.id::text || '|replace-invalid-worldwide|' || p_season::text)
  loop
    select distinct on (sc.id)
      sc.id,
      sc.name,
      sc.country_code,
      sc.logo_url,
      coalesce(sc.home_group_code, scm.group_code) as sponsor_group_code
    into v_candidate
    from public.sponsor_companies sc
    join public.sponsor_company_eligibility e
      on e.company_id = sc.id
     and e.is_active = true
     and e.scope_type = 'worldwide'
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where sc.is_active = true
      and sc.sponsor_kind = 'main'
      and v_club.club_tier between e.min_club_tier and e.max_club_tier
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      )
      and not exists (
        select 1
        from public.club_sponsor_offers x
        where x.club_id = p_club_id
          and x.season_number = p_season
          and x.company_id = sc.id
      )
      and not exists (
        select 1
        from public.club_sponsors s
        where s.club_id = p_club_id
          and s.season_number = p_season
          and s.company_id = sc.id
      )
    order by sc.id,
      md5(sc.id::text || '|' || p_club_id::text || '|' || p_season::text || '|' || v_offer.id::text);

    if not found then
      exit;
    end if;

    update public.club_sponsor_offers o
    set
      company_id = v_candidate.id,
      metadata = (
        coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'company_name', v_candidate.name,
          'company_country_code', v_candidate.country_code,
          'logo_url', v_candidate.logo_url,
          'market_priority_bucket', 2,
          'market_match', 'worldwide',
          'worldwide_eligibility', true,
          'worldwide_pool_version', 'v3',
          'portfolio_policy_version', 'v3'
        )
        || case
          when coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights'
            then jsonb_build_object(
              'season_display_name', v_candidate.name || ' Team',
              'naming_rights_display_name', v_candidate.name || ' Team',
              'full_display_name', v_candidate.name || ' Team (' || v_club.name || ')',
              'team_name_preview', v_candidate.name || ' Team (' || v_club.name || ')'
            )
          else '{}'::jsonb
        end
      )
    where o.id = v_offer.id;

    v_invalid_replaced := v_invalid_replaced + 1;
  end loop;

  select count(*)::integer
    into v_current_worldwide
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  left join public.country_market_group_members scm
    on upper(scm.country_code) = upper(sc.country_code)
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
    and (
      v_club_group is null
      or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
    )
    and exists (
      select 1
      from public.sponsor_company_eligibility e
      where e.company_id = sc.id
        and e.is_active = true
        and e.scope_type = 'worldwide'
        and v_club.club_tier between e.min_club_tier and e.max_club_tier
    );

  v_missing_worldwide := greatest(0, v_desired_worldwide - v_current_worldwide);

  /* Fill any remaining international quota only from the explicit worldwide pool. */
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
      and (
        upper(coalesce(sc.country_code, '')) = upper(coalesce(v_club.country_code, ''))
        or (
          v_club_group is not null
          and coalesce(sc.home_group_code, scm.group_code) = v_club_group
        )
      )
    order by md5(o.id::text || '|worldwide-quota-slot|' || p_season::text)
    limit v_missing_worldwide
  loop
    select distinct on (sc.id)
      sc.id,
      sc.name,
      sc.country_code,
      sc.logo_url,
      coalesce(sc.home_group_code, scm.group_code) as sponsor_group_code
    into v_candidate
    from public.sponsor_companies sc
    join public.sponsor_company_eligibility e
      on e.company_id = sc.id
     and e.is_active = true
     and e.scope_type = 'worldwide'
    left join public.country_market_group_members scm
      on upper(scm.country_code) = upper(sc.country_code)
    where sc.is_active = true
      and sc.sponsor_kind = 'main'
      and v_club.club_tier between e.min_club_tier and e.max_club_tier
      and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
      and (
        v_club_group is null
        or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
      )
      and not exists (
        select 1
        from public.club_sponsor_offers x
        where x.club_id = p_club_id
          and x.season_number = p_season
          and x.company_id = sc.id
      )
      and not exists (
        select 1
        from public.club_sponsors s
        where s.club_id = p_club_id
          and s.season_number = p_season
          and s.company_id = sc.id
      )
    order by sc.id,
      md5(sc.id::text || '|' || p_club_id::text || '|' || p_season::text || '|' || v_offer.id::text);

    if not found then
      exit;
    end if;

    update public.club_sponsor_offers o
    set
      company_id = v_candidate.id,
      metadata = (
        coalesce(o.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'company_name', v_candidate.name,
          'company_country_code', v_candidate.country_code,
          'logo_url', v_candidate.logo_url,
          'market_priority_bucket', 2,
          'market_match', 'worldwide',
          'worldwide_eligibility', true,
          'worldwide_pool_version', 'v3',
          'portfolio_policy_version', 'v3'
        )
        || case
          when coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights'
            then jsonb_build_object(
              'season_display_name', v_candidate.name || ' Team',
              'naming_rights_display_name', v_candidate.name || ' Team',
              'full_display_name', v_candidate.name || ' Team (' || v_club.name || ')',
              'team_name_preview', v_candidate.name || ' Team (' || v_club.name || ')'
            )
          else '{}'::jsonb
        end
      )
    where o.id = v_offer.id;

    v_quota_replaced := v_quota_replaced + 1;
  end loop;

  select count(*)::integer
    into v_current_worldwide
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  left join public.country_market_group_members scm
    on upper(scm.country_code) = upper(sc.country_code)
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and upper(coalesce(sc.country_code, '')) <> upper(coalesce(v_club.country_code, ''))
    and (
      v_club_group is null
      or coalesce(sc.home_group_code, scm.group_code) is distinct from v_club_group
    )
    and exists (
      select 1
      from public.sponsor_company_eligibility e
      where e.company_id = sc.id
        and e.is_active = true
        and e.scope_type = 'worldwide'
        and v_club.club_tier between e.min_club_tier and e.max_club_tier
    );

  return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
    'worldwide_pool_policy_version', 'v3',
    'desired_worldwide_nonregional', v_desired_worldwide,
    'final_worldwide_nonregional', v_current_worldwide,
    'invalid_nonregional_replaced', v_invalid_replaced,
    'worldwide_quota_replaced', v_quota_replaced
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v2(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_club_country text;
  v_club_group text;
  v_sponsor_group text;
  v_bonus bigint := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;

  v_reward_1 bigint := 0;
  v_reward_2 bigint := 0;
  v_reward_3 bigint := 0;
  v_reward_4 bigint := 0;
  v_reward_5 bigint := 0;

  v_race_1 jsonb;
  v_race_2 jsonb;
  v_race_3 jsonb;
  v_race_4 jsonb;
  v_race_5 jsonb;
  v_used uuid[] := array[]::uuid[];
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_club_country := v_offer.club_country_code;
  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());

  select cgm.group_code
    into v_club_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_club_country
  limit 1;

  select cgm.group_code
    into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  -- The five advertised rewards always add up to the full advertised bonus pool.
  v_reward_1 := round(v_bonus::numeric * 0.28)::bigint;
  v_reward_2 := round(v_bonus::numeric * 0.24)::bigint;
  v_reward_3 := round(v_bonus::numeric * 0.20)::bigint;
  v_reward_4 := round(v_bonus::numeric * 0.16)::bigint;
  v_reward_5 := greatest(0, v_bonus - v_reward_1 - v_reward_2 - v_reward_3 - v_reward_4);

  -- 1) Sponsor-country race; if unavailable, use sponsor-group or prestige fallback.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_1
  from public.races r
  left join public.country_market_group_members cgm
    on upper(cgm.country_code) = upper(r.country_code)
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and (
      upper(r.country_code) = v_offer.sponsor_country_code
      or (v_sponsor_group is not null and cgm.group_code = v_sponsor_group)
      or (
        v_offer.club_tier in ('worldteam','proteam')
        and (
          r.category ilike '%UWT%'
          or r.category ilike '%Pro%'
          or r.category in ('2.1','1.1')
        )
      )
    )
  order by
    case
      when upper(r.country_code) = v_offer.sponsor_country_code then 0
      when v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 1
      else 2
    end,
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-1')
  limit 1;

  if coalesce(v_race_1, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_1 ->> 'race_id')::uuid;
  end if;

  -- 2) Another sponsor-market / prestige race for a podium target.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_2
  from public.races r
  left join public.country_market_group_members cgm
    on upper(cgm.country_code) = upper(r.country_code)
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
    and (
      (v_sponsor_group is not null and cgm.group_code = v_sponsor_group)
      or upper(r.country_code) = v_offer.sponsor_country_code
      or (
        v_offer.club_tier in ('worldteam','proteam')
        and (
          r.category ilike '%UWT%'
          or r.category ilike '%Pro%'
          or r.category in ('2.1','1.1')
        )
      )
    )
  order by
    case
      when v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 0
      when upper(r.country_code) = v_offer.sponsor_country_code then 1
      else 2
    end,
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-2')
  limit 1;

  if coalesce(v_race_2, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_2 ->> 'race_id')::uuid;
  end if;

  -- 3) Home-market race, preferring a stage race for the stage top-5 target.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_3
  from public.races r
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and upper(r.country_code) = v_club_country
    and not (r.id = any(v_used))
  order by
    case when lower(coalesce(r.race_type,'')) = 'stage_race' then 0 else 1 end,
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-3')
  limit 1;

  if coalesce(v_race_3, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_3 ->> 'race_id')::uuid;
  end if;

  -- 4) Prestige stage race for a final GC top-10 target.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_4
  from public.races r
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
    and lower(coalesce(r.race_type,'')) = 'stage_race'
    and (
      r.category ilike '%UWT%'
      or r.category ilike '%Pro%'
      or r.category in ('2.1','1.1','2.2')
    )
  order by
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-4')
  limit 1;

  if coalesce(v_race_4, '{}'::jsonb) ? 'race_id' then
    v_used := v_used || (v_race_4 ->> 'race_id')::uuid;
  end if;

  -- 5) Remaining useful race for classification visibility.
  select jsonb_build_object(
    'race_id', r.id,
    'race_name', r.name,
    'country_code', r.country_code,
    'category', r.category,
    'race_type', r.race_type,
    'check_date', coalesce(r.end_date, r.start_date)
  )
  into v_race_5
  from public.races r
  where r.start_date between v_from_date and v_season_end
    and lower(coalesce(r.status::text, 'scheduled')) not in ('finished','completed','canceled','cancelled')
    and not (r.id = any(v_used))
  order by
    case
      when r.category ilike '%UWT%' then 0
      when r.category ilike '%Pro%' then 1
      when r.category in ('2.1','1.1') then 2
      else 3
    end,
    md5(r.id::text || p_offer_id::text || '|preview-5')
  limit 1;

  -- Fallbacks keep all five objectives concrete even in sparse national calendars.
  v_race_1 := coalesce(v_race_1, v_race_2, v_race_4, v_race_5, '{}'::jsonb);
  v_race_2 := coalesce(v_race_2, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_3 := coalesce(v_race_3, v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_4 := coalesce(v_race_4, v_race_5, v_race_1, '{}'::jsonb);
  v_race_5 := coalesce(v_race_5, v_race_4, v_race_1, '{}'::jsonb);

  return jsonb_build_array(
    jsonb_build_object(
      'objective_code', 'race_start',
      'title', coalesce(v_race_1 ->> 'race_name', 'Sponsor-market race') || ': start the race',
      'description', 'Start this sponsor-market race with your team. The objective is completed when your team appears on the race start list.',
      'target_race_id', v_race_1 ->> 'race_id',
      'target_race_name', v_race_1 ->> 'race_name',
      'target_country_code', v_race_1 ->> 'country_code',
      'target_category', v_race_1 ->> 'category',
      'target_race_type', v_race_1 ->> 'race_type',
      'check_date', v_race_1 ->> 'check_date',
      'target_check_game_date', v_race_1 ->> 'check_date',
      'required_result', 'race_start',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_start_count',
      'progress_source', 'race_entries',
      'estimated_reward_amount', v_reward_1,
      'reward_amount', v_reward_1,
      'reward_label', '$' || to_char(v_reward_1, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'race_podium',
      'title', coalesce(v_race_2 ->> 'race_name', 'Sponsor-connected event') || ': finish on the podium',
      'description', 'Deliver a headline result for the sponsor by finishing in the top 3 of this race.',
      'target_race_id', v_race_2 ->> 'race_id',
      'target_race_name', v_race_2 ->> 'race_name',
      'target_country_code', v_race_2 ->> 'country_code',
      'target_category', v_race_2 ->> 'category',
      'target_race_type', v_race_2 ->> 'race_type',
      'check_date', v_race_2 ->> 'check_date',
      'target_check_game_date', v_race_2 ->> 'check_date',
      'required_result', 'race_podium',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_final_result',
      'progress_source', 'race_results',
      'estimated_reward_amount', v_reward_2,
      'reward_amount', v_reward_2,
      'reward_label', '$' || to_char(v_reward_2, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'stage_top_5',
      'title', coalesce(v_race_3 ->> 'race_name', 'Home-market event') || ': stage top 5',
      'description', 'Give the sponsor strong home-market visibility by placing a rider in the top 5 of a stage in this race.',
      'target_race_id', v_race_3 ->> 'race_id',
      'target_race_name', v_race_3 ->> 'race_name',
      'target_country_code', v_race_3 ->> 'country_code',
      'target_category', v_race_3 ->> 'category',
      'target_race_type', v_race_3 ->> 'race_type',
      'check_date', v_race_3 ->> 'check_date',
      'target_check_game_date', v_race_3 ->> 'check_date',
      'required_result', 'stage_top_5',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'stage_result_count',
      'progress_source', 'stage_results',
      'estimated_reward_amount', v_reward_3,
      'reward_amount', v_reward_3,
      'reward_label', '$' || to_char(v_reward_3, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'gc_top_10',
      'title', coalesce(v_race_4 ->> 'race_name', 'Prestige stage race') || ': final GC top 10',
      'description', 'Finish a rider inside the final general-classification top 10 of this prestige stage race.',
      'target_race_id', v_race_4 ->> 'race_id',
      'target_race_name', v_race_4 ->> 'race_name',
      'target_country_code', v_race_4 ->> 'country_code',
      'target_category', v_race_4 ->> 'category',
      'target_race_type', v_race_4 ->> 'race_type',
      'check_date', v_race_4 ->> 'check_date',
      'target_check_game_date', v_race_4 ->> 'check_date',
      'required_result', 'gc_top_10',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_final_result',
      'progress_source', 'race_results',
      'estimated_reward_amount', v_reward_4,
      'reward_amount', v_reward_4,
      'reward_label', '$' || to_char(v_reward_4, 'FM999,999,999')
    ),
    jsonb_build_object(
      'objective_code', 'classification_visibility',
      'title', coalesce(v_race_5 ->> 'race_name', 'Classification race') || ': classification visibility',
      'description', 'Place your team in the final published classifications of this race to deliver sponsor exposure.',
      'target_race_id', v_race_5 ->> 'race_id',
      'target_race_name', v_race_5 ->> 'race_name',
      'target_country_code', v_race_5 ->> 'country_code',
      'target_category', v_race_5 ->> 'category',
      'target_race_type', v_race_5 ->> 'race_type',
      'check_date', v_race_5 ->> 'check_date',
      'target_check_game_date', v_race_5 ->> 'check_date',
      'required_result', 'classification_visibility',
      'target_value', 1,
      'current_value', 0,
      'evaluation_mode', 'race_final_result',
      'progress_source', 'race_results',
      'estimated_reward_amount', v_reward_5,
      'reward_amount', v_reward_5,
      'reward_label', '$' || to_char(v_reward_5, 'FM999,999,999')
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_finalize_main_offer_portfolio_v4(p_club_id uuid, p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_club public.clubs%rowtype;
  v_desired_naming integer := 0;
  v_fixed_naming integer := 0;
  v_missing_naming integer := 0;
  v_auto_naming integer := 0;
  v_previewed integer := 0;
  v_offer record;
  v_preview jsonb;
  v_preview_total bigint;
  v_uplift numeric;
begin
  v_base := public.sponsor_finalize_main_offer_portfolio_v3(p_club_id, p_season);

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null
    and c.is_active = true
    and coalesce(c.club_type::text, 'main') = 'main'
  limit 1;

  if not found then
    raise exception 'Live main club not found.';
  end if;

  case v_club.club_tier
    when 'worldteam' then v_desired_naming := 2;
    when 'proteam' then v_desired_naming := 1;
    else v_desired_naming := 0;
  end case;

  -- Preserve relationship-driven/manual naming deals, but enforce the 30% minimum.
  for v_offer in
    select o.id, o.naming_rights_uplift_pct, sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights'
      and (
        coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = true
        or coalesce((o.metadata->>'auto_generated_naming_rights')::boolean, false) = false
      )
  loop
    perform public.sponsor_prepare_main_offer_deal_metadata_v1(
      v_offer.id,
      'naming_rights',
      greatest(30, coalesce(v_offer.naming_rights_uplift_pct, 30)),
      v_offer.company_name || ' Team'
    );
  end loop;

  -- Reset previously auto-generated naming slots. V4 will reassign them to the
  -- strongest underlying offers so naming-rights choices visibly beat standard terms.
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
      and coalesce((o.metadata->>'auto_generated_naming_rights')::boolean, false) = true
  loop
    perform public.sponsor_prepare_main_offer_deal_metadata_v1(v_offer.id, 'standard', 0, null);
    update public.club_sponsor_offers o
    set metadata = (
      coalesce(o.metadata, '{}'::jsonb)
      - array[
        'season_display_name',
        'naming_rights_display_name',
        'full_display_name',
        'full_display_name_preview',
        'team_name_preview',
        'branding_locked_fields'
      ]
    ) || jsonb_build_object(
      'auto_generated_naming_rights', false,
      'naming_rights_policy_version', 'v4_strongest_offer_30_40'
    )
    where o.id = v_offer.id;
  end loop;

  select count(*)::integer
    into v_fixed_naming
  from public.club_sponsor_offers o
  where o.club_id = p_club_id
    and o.season_number = p_season
    and o.sponsor_kind = 'main'
    and o.status = 'offered'
    and coalesce(o.main_sponsor_deal_type, 'standard') = 'naming_rights';

  v_missing_naming := greatest(0, v_desired_naming - v_fixed_naming);

  for v_offer in
    select o.id, sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id = o.company_id
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
      and coalesce(o.main_sponsor_deal_type, 'standard') <> 'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean, false) = false
    order by
      coalesce(o.full_season_guaranteed_amount, o.guaranteed_amount, 0) desc,
      coalesce(o.full_season_bonus_pool_amount, o.bonus_pool_amount, 0) desc,
      md5(o.id::text || '|naming-v4|' || p_season::text)
    limit v_missing_naming
  loop
    v_uplift := 30 + (((('x' || substr(md5(v_offer.id::text || '|naming-uplift-v4'), 1, 8))::bit(32)::bigint) % 1001)::numeric / 100.0);

    perform public.sponsor_prepare_main_offer_deal_metadata_v1(
      v_offer.id,
      'naming_rights',
      v_uplift,
      v_offer.company_name || ' Team'
    );

    update public.club_sponsor_offers o
    set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'full_display_name', (o.metadata->>'season_display_name') || ' (' || v_club.name || ')',
      'auto_generated_naming_rights', true,
      'naming_rights_policy_version', 'v4_strongest_offer_30_40',
      'naming_rights_minimum_premium_pct', 30,
      'naming_rights_maximum_premium_pct', 40
    )
    where o.id = v_offer.id;

    v_auto_naming := v_auto_naming + 1;
  end loop;

  -- Build the full five-target objective preview after all financial/deal adjustments.
  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id = p_club_id
      and o.season_number = p_season
      and o.sponsor_kind = 'main'
      and o.status = 'offered'
  loop
    v_preview := public.sponsor_build_offer_preview_objectives_v2(v_offer.id);

    select coalesce(sum((x.value->>'estimated_reward_amount')::bigint), 0)::bigint
      into v_preview_total
    from jsonb_array_elements(coalesce(v_preview, '[]'::jsonb)) as x(value);

    update public.club_sponsor_offers o
    set metadata = coalesce(o.metadata, '{}'::jsonb) || jsonb_build_object(
      'preview_objectives', coalesce(v_preview, '[]'::jsonb),
      'preview_objectives_version', 'five_target_v2',
      'preview_objective_count', jsonb_array_length(coalesce(v_preview, '[]'::jsonb)),
      'preview_objective_total_reward', v_preview_total,
      'preview_objectives_match_bonus_pool', v_preview_total = coalesce(o.bonus_pool_amount, 0),
      'preview_objectives_refreshed_at', now()
    )
    where o.id = v_offer.id;

    v_previewed := v_previewed + 1;
  end loop;

  return coalesce(v_base, '{}'::jsonb) || jsonb_build_object(
    'naming_policy_version', 'v4_strongest_offer_30_40',
    'desired_naming_rights', v_desired_naming,
    'fixed_naming_rights', v_fixed_naming,
    'auto_naming_rights_prepared', v_auto_naming,
    'preview_policy_version', 'five_target_v2',
    'offers_with_five_target_preview', v_previewed
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_staff_birth_date_v1(p_role_type text, p_reference_date date DEFAULT NULL::date)
 RETURNS date
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_reference_date date := coalesce(p_reference_date, public.get_current_game_date_date());
  v_role text := lower(coalesce(trim(p_role_type), ''));
  v_min_age integer;
  v_max_age integer;
  v_age integer;
  v_day_offset integer;
begin
  if v_reference_date is null then
    return null;
  end if;

  case v_role
    when 'head_coach' then
      v_min_age := 32;
      v_max_age := 64;
    when 'sport_director' then
      v_min_age := 32;
      v_max_age := 64;
    when 'team_doctor' then
      v_min_age := 30;
      v_max_age := 64;
    when 'u23_head_coach' then
      v_min_age := 28;
      v_max_age := 58;
    when 'trainer' then
      v_min_age := 27;
      v_max_age := 60;
    when 'physio' then
      v_min_age := 27;
      v_max_age := 60;
    when 'nutritionist' then
      v_min_age := 27;
      v_max_age := 60;
    when 'mechanic' then
      v_min_age := 27;
      v_max_age := 62;
    when 'scout_analyst' then
      v_min_age := 27;
      v_max_age := 62;
    else
      v_min_age := 27;
      v_max_age := 62;
  end case;

  v_age := v_min_age + floor(random() * (v_max_age - v_min_age + 1))::integer;
  v_day_offset := floor(random() * 365)::integer;

  return (
    v_reference_date
    - make_interval(years => v_age)
    - make_interval(days => v_day_offset)
  )::date;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v3(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_bonus bigint := 0;
  v_objective_count integer := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;
  v_sponsor_group text;
  v_used uuid[] := array[]::uuid[];
  v_result jsonb := '[]'::jsonb;
  v_weights numeric[] := array[0.65, 0.75, 0.90, 1.00, 1.15, 1.30];
  v_weight_sum numeric := 0;
  v_index integer;
  v_weight numeric;
  v_reward bigint;
  v_allocated bigint := 0;
  v_race record;
  v_required_result text;
  v_title text;
  v_description text;
  v_evaluation_mode text;
  v_progress_source text;
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then
    return '[]'::jsonb;
  end if;

  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  if v_bonus <= 0 then
    return '[]'::jsonb;
  end if;

  -- Scale between three and six visible objectives. The current offer UI
  -- renders six objective cards, so every advertised target remains visible.
  v_objective_count := least(
    6,
    greatest(
      3,
      ceil(v_bonus::numeric / 90000.0)::integer
    )
  );

  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());

  select cgm.group_code
  into v_sponsor_group
  from public.country_market_group_members cgm
  where upper(cgm.country_code) = v_offer.sponsor_country_code
  limit 1;

  select coalesce(sum(x), 0)
  into v_weight_sum
  from unnest(v_weights[1:v_objective_count]) as u(x);

  for v_index in 1..v_objective_count loop
    select
      r.id,
      r.name,
      r.start_date,
      coalesce(r.end_date, r.start_date) as end_date,
      r.country_code,
      r.category,
      r.race_type
    into v_race
    from public.races r
    left join public.country_market_group_members cgm
      on upper(cgm.country_code) = upper(r.country_code)
    where r.start_date between v_from_date and v_season_end
      and lower(coalesce(r.status::text, 'scheduled')) not in (
        'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
      )
      and not (r.id = any(v_used))
      and (
        v_index not in (3, 4, 6)
        or lower(coalesce(r.race_type, '')) = 'stage_race'
      )
    order by
      case
        when v_index = 1 and upper(r.country_code) = v_offer.sponsor_country_code then 0
        when v_index = 1 and v_sponsor_group is not null and cgm.group_code = v_sponsor_group then 1
        when v_index = 3 and upper(r.country_code) = v_offer.club_country_code then 0
        when v_index in (4, 5, 6) and r.category ilike '%UWT%' then 0
        when v_index in (4, 5, 6) and r.category ilike '%Pro%' then 1
        when v_index in (4, 5, 6) and r.category in ('2.1','1.1') then 2
        else 3
      end,
      md5(r.id::text || p_offer_id::text || '|objective-v3-' || v_index::text)
    limit 1;

    if not found and v_index not in (3, 4, 6) then
      select
        r.id,
        r.name,
        r.start_date,
        coalesce(r.end_date, r.start_date) as end_date,
        r.country_code,
        r.category,
        r.race_type
      into v_race
      from public.races r
      where r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text, 'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
      order by md5(r.id::text || p_offer_id::text || '|fallback-v3-' || v_index::text)
      limit 1;
    end if;

    if not found then
      exit;
    end if;

    v_used := v_used || v_race.id;

    case v_index
      when 1 then
        v_required_result := 'race_start';
        v_title := v_race.name || ': start the race';
        v_description := 'Start ' || v_race.name || ' with your team. The objective is completed when your team appears on the race start list.';
        v_evaluation_mode := 'race_start_count';
        v_progress_source := 'race_entries';
      when 2 then
        v_required_result := 'classification_visibility';
        v_title := v_race.name || ': appear in the final classification';
        v_description := 'Finish the race with at least one rider listed in the published final classifications.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 3 then
        v_required_result := 'stage_top_5';
        v_title := v_race.name || ': stage top 5';
        v_description := 'Place at least one rider in the top 5 of a stage in ' || v_race.name || '.';
        v_evaluation_mode := 'stage_result_count';
        v_progress_source := 'stage_results';
      when 4 then
        v_required_result := 'gc_top_10';
        v_title := v_race.name || ': final GC top 10';
        v_description := 'Finish at least one rider inside the final general-classification top 10 of ' || v_race.name || '.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 5 then
        v_required_result := 'race_podium';
        v_title := v_race.name || ': finish on the podium';
        v_description := 'Finish in the top 3 of ' || v_race.name || ' to deliver a headline result for the sponsor.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      else
        v_required_result := 'stage_win';
        v_title := v_race.name || ': win a stage';
        v_description := 'Win at least one stage of ' || v_race.name || '.';
        v_evaluation_mode := 'stage_result_count';
        v_progress_source := 'stage_results';
    end case;

    v_weight := v_weights[v_index];

    if v_index = v_objective_count then
      v_reward := greatest(0, v_bonus - v_allocated);
    else
      v_reward := round(v_bonus::numeric * v_weight / nullif(v_weight_sum, 0))::bigint;
      v_allocated := v_allocated + v_reward;
    end if;

    v_result := v_result || jsonb_build_array(
      jsonb_build_object(
        'objective_code', v_required_result,
        'title', v_title,
        'description', v_description,
        'target_race_id', v_race.id::text,
        'target_race_name', v_race.name,
        'target_country_code', v_race.country_code,
        'target_category', v_race.category,
        'target_race_type', v_race.race_type,
        'target_race_start_date', v_race.start_date::text,
        'target_race_end_date', v_race.end_date::text,
        'check_date', v_race.end_date::text,
        'target_check_game_date', v_race.end_date::text,
        'required_result', v_required_result,
        'target_value', 1,
        'current_value', 0,
        'evaluation_mode', v_evaluation_mode,
        'progress_source', v_progress_source,
        'estimated_reward_amount', v_reward,
        'reward_amount', v_reward,
        'reward_label', '$' || to_char(v_reward, 'FM999,999,999'),
        'objective_number', v_index,
        'objective_count', v_objective_count,
        'bonus_pool_amount', v_bonus,
        'preview_policy_version', 'v3_scaled_exact_races_max6'
      )
    );
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_finalize_main_offer_portfolio_v5(p_club_id uuid, p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_club public.clubs%rowtype;
  v_desired_naming integer := 0;
  v_fixed_naming integer := 0;
  v_missing_naming integer := 0;
  v_auto_naming integer := 0;
  v_standard_reference_total bigint := 0;
  v_offer record;
  v_base_total bigint;
  v_full_total bigint;
  v_full_guaranteed bigint;
  v_full_bonus bigint;
  v_current_total bigint;
  v_current_guaranteed bigint;
  v_current_bonus bigint;
  v_monthly bigint;
  v_factor numeric;
  v_guarantee_share numeric;
  v_bonus_share numeric;
  v_uplift numeric;
  v_rotation_stamp text;
  v_stored_rotation_stamp text;
  v_preview jsonb;
  v_preview_total bigint;
  v_previewed integer := 0;
begin
  v_base := public.sponsor_finalize_main_offer_portfolio_v3(p_club_id, p_season);

  select * into v_club
  from public.clubs c
  where c.id = p_club_id
    and c.deleted_at is null
    and c.is_active = true
    and coalesce(c.club_type::text, 'main') = 'main'
  limit 1;

  if not found then raise exception 'Live main club not found.'; end if;

  case v_club.club_tier
    when 'worldteam' then v_desired_naming := 2;
    when 'proteam' then v_desired_naming := 1;
    else v_desired_naming := 0;
  end case;

  update public.club_sponsor_offers o
  set main_sponsor_deal_type='standard',
      naming_rights_uplift_pct=0,
      metadata=(coalesce(o.metadata,'{}'::jsonb)-array[
        'season_display_name','naming_rights_display_name','full_display_name',
        'full_display_name_preview','team_name_preview','branding_locked_fields'
      ]) || jsonb_build_object(
        'auto_generated_naming_rights',false,
        'naming_rights_policy_version','v5_standard_reference_30_50'
      )
  where o.club_id=p_club_id
    and o.season_number=p_season
    and o.sponsor_kind='main'
    and o.status='offered'
    and coalesce((o.metadata->>'is_renewal_offer')::boolean,false)=false
    and coalesce((o.metadata->>'auto_generated_naming_rights')::boolean,false)=true;

  select count(*)::integer into v_fixed_naming
  from public.club_sponsor_offers o
  where o.club_id=p_club_id and o.season_number=p_season
    and o.sponsor_kind='main' and o.status='offered'
    and coalesce(o.main_sponsor_deal_type,'standard')='naming_rights';

  v_missing_naming:=greatest(0,v_desired_naming-v_fixed_naming);

  for v_offer in
    select o.id, sc.name as company_name,
      case when coalesce(o.metadata->>'economic_model_v5_base_contract_total','') ~ '^[0-9]+$'
        then (o.metadata->>'economic_model_v5_base_contract_total')::bigint
        else greatest(0,coalesce(o.full_season_guaranteed_amount,o.guaranteed_amount,0)) end as base_total
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id=o.company_id
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
      and coalesce(o.main_sponsor_deal_type,'standard')<>'naming_rights'
      and coalesce((o.metadata->>'is_renewal_offer')::boolean,false)=false
    order by
      case when coalesce(o.metadata->>'economic_model_v5_base_contract_total','') ~ '^[0-9]+$'
        then (o.metadata->>'economic_model_v5_base_contract_total')::bigint
        else greatest(0,coalesce(o.full_season_guaranteed_amount,o.guaranteed_amount,0)) end desc,
      md5(o.id::text||'|naming-slot-v5|'||p_season::text)
    limit v_missing_naming
  loop
    v_uplift:=30+(((('x'||substr(md5(v_offer.id::text||'|naming-uplift-v5'),1,8))::bit(32)::bigint)%2001)::numeric/100.0);
    update public.club_sponsor_offers o
    set main_sponsor_deal_type='naming_rights',
        naming_rights_uplift_pct=v_uplift,
        metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
          'deal_type','naming_rights','main_sponsor_deal_type','naming_rights',
          'requires_team_name_change',true,'naming_rights_uplift_pct',v_uplift,
          'season_display_name',v_offer.company_name||' Team',
          'naming_rights_display_name',v_offer.company_name||' Team',
          'full_display_name',v_offer.company_name||' Team ('||v_club.name||')',
          'team_name_preview',v_offer.company_name||' Team ('||v_club.name||')',
          'branding_locked_fields',jsonb_build_array('name','primary_color','secondary_color'),
          'auto_generated_naming_rights',true,
          'naming_rights_policy_version','v5_standard_reference_30_50',
          'naming_rights_minimum_premium_pct',30,
          'naming_rights_maximum_premium_pct',50)
    where o.id=v_offer.id;
    v_auto_naming:=v_auto_naming+1;
  end loop;

  select coalesce(max(case
    when coalesce(o.metadata->>'economic_model_v5_base_contract_total','') ~ '^[0-9]+$'
      then (o.metadata->>'economic_model_v5_base_contract_total')::bigint
    else greatest(0,coalesce(o.full_season_guaranteed_amount,o.guaranteed_amount,0)) end),0)::bigint
  into v_standard_reference_total
  from public.club_sponsor_offers o
  where o.club_id=p_club_id and o.season_number=p_season
    and o.sponsor_kind='main' and o.status='offered'
    and coalesce(o.main_sponsor_deal_type,'standard')='standard';

  if v_standard_reference_total<=0 then
    select coalesce(max(greatest(0,coalesce(o.full_season_guaranteed_amount,o.guaranteed_amount,0))),0)::bigint
    into v_standard_reference_total
    from public.club_sponsor_offers o
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered';
  end if;

  for v_offer in
    select o.*, sc.name as company_name
    from public.club_sponsor_offers o
    join public.sponsor_companies sc on sc.id=o.company_id
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
    order by o.created_at,o.id
  loop
    v_rotation_stamp:=coalesce(v_offer.metadata->>'last_rotated_game_month','')||':'||coalesce(v_offer.metadata->>'last_rotated_game_day','');
    if v_rotation_stamp=':' then v_rotation_stamp:='none'; end if;
    v_stored_rotation_stamp:=coalesce(v_offer.metadata->>'economic_model_v5_rotation_stamp','none');

    if coalesce(v_offer.metadata->>'economic_model_version','')='v5_one_total_split'
       and v_rotation_stamp<>'none'
       and v_rotation_stamp is distinct from v_stored_rotation_stamp then
      v_base_total:=greatest(0,coalesce(v_offer.full_season_guaranteed_amount,v_offer.guaranteed_amount,0));
    elsif coalesce(v_offer.metadata->>'economic_model_v5_base_contract_total','') ~ '^[0-9]+$' then
      v_base_total:=(v_offer.metadata->>'economic_model_v5_base_contract_total')::bigint;
    else
      v_base_total:=greatest(0,coalesce(v_offer.full_season_guaranteed_amount,v_offer.guaranteed_amount,0));
    end if;

    if coalesce(v_offer.main_sponsor_deal_type,'standard')='naming_rights' then
      v_uplift:=coalesce(v_offer.naming_rights_uplift_pct,0);
      if v_uplift<30 or v_uplift>50 then
        v_uplift:=30+(((('x'||substr(md5(v_offer.id::text||'|naming-uplift-v5'),1,8))::bit(32)::bigint)%2001)::numeric/100.0);
      end if;
      v_full_total:=round(v_standard_reference_total::numeric*(1+v_uplift/100.0))::bigint;
      v_guarantee_share:=78+(((('x'||substr(md5(v_offer.id::text||'|naming-guarantee-share-v5'),1,8))::bit(32)::bigint)%601)::numeric/100.0);
    else
      v_uplift:=0;
      v_full_total:=v_base_total;
      v_guarantee_share:=65+(((('x'||substr(md5(v_offer.id::text||'|standard-guarantee-share-v5'),1,8))::bit(32)::bigint)%1001)::numeric/100.0);
    end if;

    v_guarantee_share:=greatest(0,least(100,v_guarantee_share));
    v_bonus_share:=100-v_guarantee_share;
    v_full_guaranteed:=floor(v_full_total::numeric*v_guarantee_share/100.0)::bigint;
    v_full_bonus:=greatest(0,v_full_total-v_full_guaranteed);

    v_factor:=greatest(0.01,least(1.0,coalesce(v_offer.proration_factor,
      case when coalesce(v_offer.coverage_months,0)>0 then v_offer.coverage_months::numeric/12.0 else 1.0 end)));
    v_current_total:=round(v_full_total::numeric*v_factor)::bigint;
    v_current_guaranteed:=floor(v_full_guaranteed::numeric*v_factor)::bigint;
    v_current_bonus:=greatest(0,v_current_total-v_current_guaranteed);
    v_monthly:=case when coalesce(v_offer.coverage_months,0)>0
      then floor(v_current_guaranteed::numeric/v_offer.coverage_months)::bigint else v_current_guaranteed end;

    update public.club_sponsor_offers o
    set naming_rights_uplift_pct=v_uplift,
        full_season_guaranteed_amount=v_full_guaranteed,
        full_season_bonus_pool_amount=v_full_bonus,
        guaranteed_amount=v_current_guaranteed,
        bonus_pool_amount=v_current_bonus,
        monthly_amount=v_monthly,
        metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
          'economic_model_version','v5_one_total_split',
          'economic_model_v5_base_contract_total',v_base_total,
          'economic_model_v5_rotation_stamp',v_rotation_stamp,
          'full_season_contract_total_value',v_full_total,
          'contract_total_value',v_current_total,
          'guaranteed_share_pct',round(v_guarantee_share,2),
          'bonus_share_pct',round(v_bonus_share,2),
          'guaranteed_amount',v_current_guaranteed,
          'bonus_pool_amount',v_current_bonus,
          'naming_rights_reference_standard_total',v_standard_reference_total,
          'naming_rights_uplift_pct',v_uplift,
          'bonus_balance_policy','scaled_objectives_approx_90k_each',
          'economics_refreshed_at',now())||case
            when coalesce(v_offer.main_sponsor_deal_type,'standard')='naming_rights' then jsonb_build_object(
              'deal_type','naming_rights','main_sponsor_deal_type','naming_rights',
              'requires_team_name_change',true,
              'season_display_name',v_offer.company_name||' Team',
              'naming_rights_display_name',v_offer.company_name||' Team',
              'full_display_name',v_offer.company_name||' Team ('||v_club.name||')',
              'team_name_preview',v_offer.company_name||' Team ('||v_club.name||')',
              'branding_locked_fields',jsonb_build_array('name','primary_color','secondary_color'),
              'naming_rights_policy_version','v5_standard_reference_30_50',
              'naming_rights_minimum_premium_pct',30,
              'naming_rights_maximum_premium_pct',50)
            else jsonb_build_object('deal_type','standard','main_sponsor_deal_type','standard','requires_team_name_change',false) end
    where o.id=v_offer.id;
  end loop;

  for v_offer in
    select o.id from public.club_sponsor_offers o
    where o.club_id=p_club_id and o.season_number=p_season
      and o.sponsor_kind='main' and o.status='offered'
  loop
    v_preview:=public.sponsor_build_offer_preview_objectives_v3(v_offer.id);
    select coalesce(sum((x.value->>'estimated_reward_amount')::bigint),0)::bigint
    into v_preview_total from jsonb_array_elements(coalesce(v_preview,'[]'::jsonb)) as x(value);
    update public.club_sponsor_offers o
    set metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
      'preview_objectives',coalesce(v_preview,'[]'::jsonb),
      'preview_objectives_version','v3_scaled_exact_races',
      'preview_objective_count',jsonb_array_length(coalesce(v_preview,'[]'::jsonb)),
      'preview_objective_total_reward',v_preview_total,
      'preview_objectives_match_bonus_pool',v_preview_total=coalesce(o.bonus_pool_amount,0),
      'preview_objectives_refreshed_at',now())
    where o.id=v_offer.id;
    v_previewed:=v_previewed+1;
  end loop;

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'economic_model_version','v5_one_total_split',
    'naming_policy_version','v5_standard_reference_30_50',
    'standard_reference_total',v_standard_reference_total,
    'desired_naming_rights',v_desired_naming,
    'fixed_naming_rights',v_fixed_naming,
    'auto_naming_rights_prepared',v_auto_naming,
    'standard_guarantee_share_range',jsonb_build_array(65,75),
    'naming_guarantee_share_range',jsonb_build_array(78,84),
    'preview_policy_version','v3_scaled_exact_races',
    'offers_previewed',v_previewed);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_refresh_daily_offers(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_base jsonb; v_season integer; v_finalize jsonb; v_headlines integer;
begin
  v_base:=public.sponsor_refresh_daily_offers_core_v1(p_club_id);
  v_season:=coalesce(nullif(v_base->>'season_number','')::integer,(select coalesce(gs.season_number,1) from public.game_state gs limit 1),1);
  v_finalize:=public.sponsor_finalize_main_offer_portfolio_v6(p_club_id,v_season);
  v_headlines:=public.sponsor_set_main_offer_total_value_headlines_v1(p_club_id,v_season);
  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'main_offer_economic_model','v6_reduced_30_market_split',
    'main_offer_finalize',v_finalize,
    'main_offer_total_value_headlines',v_headlines
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_offer_economic_description_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_company_description text;
  v_summary text;
  v_total bigint;
begin
  if coalesce(new.sponsor_kind, '') <> 'main'
     or coalesce(new.status, '') <> 'offered'
     or coalesce(new.metadata->>'economic_model_version', '') <> 'v5_one_total_split'
  then
    return new;
  end if;

  v_total := greatest(0, coalesce(new.guaranteed_amount, 0))
           + greatest(0, coalesce(new.bonus_pool_amount, 0));

  v_company_description := nullif(new.metadata->>'company_description', '');

  if v_company_description is null
     and nullif(new.metadata->>'description', '') is not null
     and new.metadata->>'description' not like 'Total contract value:%'
  then
    v_company_description := new.metadata->>'description';
  end if;

  v_summary :=
    'Total contract value: ' || to_char(v_total, 'FM999,999,999') ||
    '. Guaranteed: ' || to_char(greatest(0, coalesce(new.guaranteed_amount, 0)), 'FM999,999,999') ||
    '. Bonus pool: ' || to_char(greatest(0, coalesce(new.bonus_pool_amount, 0)), 'FM999,999,999') || '.';

  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'economic_summary', v_summary,
      'description',
        case
          when v_company_description is null then v_summary
          else v_company_description || ' ' || v_summary
        end
    );

  if v_company_description is not null then
    new.metadata := new.metadata || jsonb_build_object(
      'company_description', v_company_description
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_build_offer_preview_objectives_v4(p_offer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_offer record;
  v_bonus bigint := 0;
  v_objective_count integer := 0;
  v_season_start date;
  v_season_end date;
  v_from_date date;
  v_club_group text;
  v_sponsor_group text;
  v_target_group text;
  v_other_group text;
  v_target_group_name text;
  v_desired_country text;
  v_same_group boolean := false;
  v_used uuid[] := array[]::uuid[];
  v_result jsonb := '[]'::jsonb;
  v_weights numeric[] := array[0.65, 0.75, 0.90, 1.00, 1.15, 1.30];
  v_weight_sum numeric := 0;
  v_index integer;
  v_weight numeric;
  v_reward bigint;
  v_allocated bigint := 0;
  v_race record;
  v_required_result text;
  v_title text;
  v_description text;
  v_evaluation_mode text;
  v_progress_source text;
  v_market_fallback boolean;
begin
  select
    o.id,
    o.season_number,
    o.bonus_pool_amount,
    o.metadata,
    sc.name as sponsor_name,
    upper(sc.country_code) as sponsor_country_code,
    coalesce(sc.home_group_code, sm.group_code) as sponsor_group_code,
    c.name as club_name,
    upper(c.country_code) as club_country_code,
    cm.group_code as club_group_code,
    c.club_tier::text as club_tier
  into v_offer
  from public.club_sponsor_offers o
  join public.sponsor_companies sc on sc.id = o.company_id
  join public.clubs c on c.id = o.club_id
  left join public.country_market_group_members sm on upper(sm.country_code) = upper(sc.country_code)
  left join public.country_market_group_members cm on upper(cm.country_code) = upper(c.country_code)
  where o.id = p_offer_id
    and o.sponsor_kind = 'main';

  if not found then return '[]'::jsonb; end if;

  v_bonus := greatest(0, coalesce(v_offer.bonus_pool_amount, 0));
  if v_bonus <= 0 then return '[]'::jsonb; end if;

  v_objective_count := least(6, greatest(3, ceil(v_bonus::numeric / 90000.0)::integer));
  v_season_start := public.get_game_date_for_season_start(v_offer.season_number);
  v_season_end := public.get_game_date_for_season_end(v_offer.season_number);
  v_from_date := greatest(v_season_start, public.get_current_game_date_safe_v1());
  v_club_group := v_offer.club_group_code;
  v_sponsor_group := v_offer.sponsor_group_code;
  v_same_group := v_club_group is not null and v_sponsor_group is not null and v_club_group = v_sponsor_group;

  select coalesce(sum(x),0) into v_weight_sum
  from unnest(v_weights[1:v_objective_count]) as u(x);

  for v_index in 1..v_objective_count loop
    if v_same_group then
      v_target_group := v_club_group;
      v_other_group := null;
      v_desired_country := case when mod(v_index,2)=1 then v_offer.sponsor_country_code else v_offer.club_country_code end;
    elsif v_club_group is not null and v_sponsor_group is not null then
      if mod(v_index,2)=1 then
        v_target_group := v_club_group;
        v_other_group := v_sponsor_group;
        v_desired_country := v_offer.club_country_code;
      else
        v_target_group := v_sponsor_group;
        v_other_group := v_club_group;
        v_desired_country := v_offer.sponsor_country_code;
      end if;
    else
      v_target_group := coalesce(v_club_group, v_sponsor_group);
      v_other_group := null;
      v_desired_country := coalesce(v_offer.club_country_code, v_offer.sponsor_country_code);
    end if;

    v_market_fallback := false;
    v_target_group_name := null;
    if v_target_group is not null then
      select g.name into v_target_group_name
      from public.country_market_groups g where g.code=v_target_group;
    end if;

    select
      r.id, r.name, r.start_date, coalesce(r.end_date,r.start_date) as end_date,
      r.country_code, r.category, r.race_type, mg.group_code as race_group_code
    into v_race
    from public.races r
    join public.country_market_group_members mg on upper(mg.country_code)=upper(r.country_code)
    where r.start_date between v_from_date and v_season_end
      and lower(coalesce(r.status::text,'scheduled')) not in (
        'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
      )
      and not (r.id = any(v_used))
      and (v_target_group is null or mg.group_code=v_target_group)
    order by
      case when upper(r.country_code)=upper(v_desired_country) then 0 else 1 end,
      case when v_index in (3,4,6) and lower(coalesce(r.race_type,''))='stage_race' then 0
           when v_index in (3,4,6) then 1 else 0 end,
      case when v_index in (4,5,6) and r.category ilike '%UWT%' then 0
           when v_index in (4,5,6) and r.category ilike '%Pro%' then 1
           when v_index in (4,5,6) and r.category in ('2.1','1.1') then 2 else 3 end,
      md5(r.id::text || p_offer_id::text || '|market-v4-' || v_index::text)
    limit 1;

    if not found and v_other_group is not null then
      v_market_fallback := true;
      select g.name into v_target_group_name
      from public.country_market_groups g where g.code=v_other_group;
      select
        r.id, r.name, r.start_date, coalesce(r.end_date,r.start_date) as end_date,
        r.country_code, r.category, r.race_type, mg.group_code as race_group_code
      into v_race
      from public.races r
      join public.country_market_group_members mg on upper(mg.country_code)=upper(r.country_code)
      where r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text,'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
        and mg.group_code=v_other_group
      order by
        case when v_index in (3,4,6) and lower(coalesce(r.race_type,''))='stage_race' then 0 else 1 end,
        md5(r.id::text || p_offer_id::text || '|other-market-v4-' || v_index::text)
      limit 1;
      if found then v_target_group := v_other_group; end if;
    end if;

    if not found then
      v_market_fallback := true;
      select
        r.id, r.name, r.start_date, coalesce(r.end_date,r.start_date) as end_date,
        r.country_code, r.category, r.race_type, mg.group_code as race_group_code
      into v_race
      from public.races r
      left join public.country_market_group_members mg on upper(mg.country_code)=upper(r.country_code)
      where r.start_date between v_from_date and v_season_end
        and lower(coalesce(r.status::text,'scheduled')) not in (
          'finished','completed','canceled','cancelled','finalized','results_published','done','simulated'
        )
        and not (r.id = any(v_used))
      order by
        case when v_index in (3,4,6) and lower(coalesce(r.race_type,''))='stage_race' then 0 else 1 end,
        md5(r.id::text || p_offer_id::text || '|global-fallback-v4-' || v_index::text)
      limit 1;
    end if;

    if not found then exit; end if;
    v_used := v_used || v_race.id;

    case v_index
      when 1 then
        v_required_result := 'race_start';
        v_title := v_race.name || ': start the race';
        v_description := 'Start ' || v_race.name || ' with your team. The objective is completed when your team appears on the race start list.';
        v_evaluation_mode := 'race_start_count';
        v_progress_source := 'race_entries';
      when 2 then
        v_required_result := 'classification_visibility';
        v_title := v_race.name || ': appear in the final classification';
        v_description := 'Finish the race with at least one rider listed in the published final classifications.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 3 then
        if lower(coalesce(v_race.race_type,''))='stage_race' then
          v_required_result := 'stage_top_5';
          v_title := v_race.name || ': stage top 5';
          v_description := 'Place at least one rider in the top 5 of a stage in ' || v_race.name || '.';
          v_evaluation_mode := 'stage_result_count';
          v_progress_source := 'stage_results';
        else
          v_required_result := 'race_top_5';
          v_title := v_race.name || ': finish in the top 5';
          v_description := 'Finish at least one rider inside the top 5 of ' || v_race.name || '.';
          v_evaluation_mode := 'race_final_result';
          v_progress_source := 'race_results';
        end if;
      when 4 then
        if lower(coalesce(v_race.race_type,''))='stage_race' then
          v_required_result := 'gc_top_10';
          v_title := v_race.name || ': final GC top 10';
          v_description := 'Finish at least one rider inside the final general-classification top 10 of ' || v_race.name || '.';
        else
          v_required_result := 'race_top_10';
          v_title := v_race.name || ': finish in the top 10';
          v_description := 'Finish at least one rider inside the top 10 of ' || v_race.name || '.';
        end if;
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      when 5 then
        v_required_result := 'race_podium';
        v_title := v_race.name || ': finish on the podium';
        v_description := 'Finish in the top 3 of ' || v_race.name || ' to deliver a headline result for the sponsor.';
        v_evaluation_mode := 'race_final_result';
        v_progress_source := 'race_results';
      else
        if lower(coalesce(v_race.race_type,''))='stage_race' then
          v_required_result := 'stage_win';
          v_title := v_race.name || ': win a stage';
          v_description := 'Win at least one stage of ' || v_race.name || '.';
          v_evaluation_mode := 'stage_result_count';
          v_progress_source := 'stage_results';
        else
          v_required_result := 'race_win';
          v_title := v_race.name || ': win the race';
          v_description := 'Win ' || v_race.name || '.';
          v_evaluation_mode := 'race_final_result';
          v_progress_source := 'race_results';
        end if;
    end case;

    v_weight := v_weights[v_index];
    if v_index=v_objective_count then
      v_reward := greatest(0,v_bonus-v_allocated);
    else
      v_reward := round(v_bonus::numeric*v_weight/nullif(v_weight_sum,0))::bigint;
      v_allocated := v_allocated+v_reward;
    end if;

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'objective_code',v_required_result,
      'title',v_title,
      'description',v_description,
      'target_race_id',v_race.id::text,
      'target_race_name',v_race.name,
      'target_country_code',v_race.country_code,
      'target_category',v_race.category,
      'target_race_type',v_race.race_type,
      'target_race_start_date',v_race.start_date::text,
      'target_race_end_date',v_race.end_date::text,
      'check_date',v_race.end_date::text,
      'target_check_game_date',v_race.end_date::text,
      'required_result',v_required_result,
      'target_value',1,
      'current_value',0,
      'evaluation_mode',v_evaluation_mode,
      'progress_source',v_progress_source,
      'estimated_reward_amount',v_reward,
      'reward_amount',v_reward,
      'reward_label','$'||to_char(v_reward,'FM999,999,999'),
      'objective_number',v_index,
      'objective_count',v_objective_count,
      'bonus_pool_amount',v_bonus,
      'club_market_group_code',v_club_group,
      'sponsor_market_group_code',v_sponsor_group,
      'target_market_group_code',v_race.race_group_code,
      'target_market_group_name',v_target_group_name,
      'market_group_same',v_same_group,
      'market_group_fallback',v_market_fallback,
      'market_group_split_policy',case when v_same_group then 'shared_group_all' else 'club_sponsor_50_50' end,
      'preview_policy_version','v4_market_group_split'
    ));
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_finalize_main_offer_portfolio_v6(p_club_id uuid, p_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_offer record;
  v_v5_total bigint;
  v_full_total bigint;
  v_full_guaranteed bigint;
  v_full_bonus bigint;
  v_current_total bigint;
  v_current_guaranteed bigint;
  v_current_bonus bigint;
  v_monthly bigint;
  v_share numeric;
  v_factor numeric;
  v_preview jsonb;
  v_preview_total bigint;
  v_previewed integer:=0;
begin
  v_base:=public.sponsor_finalize_main_offer_portfolio_v5(p_club_id,p_season);

  for v_offer in
    select o.*
    from public.club_sponsor_offers o
    where o.club_id=p_club_id
      and o.season_number=p_season
      and o.sponsor_kind='main'
      and o.status='offered'
    order by o.created_at,o.id
  loop
    v_v5_total:=greatest(0,coalesce(
      nullif(v_offer.metadata->>'full_season_contract_total_value','')::bigint,
      coalesce(v_offer.full_season_guaranteed_amount,0)+coalesce(v_offer.full_season_bonus_pool_amount,0)
    ));
    v_full_total:=round(v_v5_total::numeric*0.70)::bigint;
    v_share:=coalesce(nullif(v_offer.metadata->>'guaranteed_share_pct','')::numeric,
      case when coalesce(v_offer.main_sponsor_deal_type,'standard')='naming_rights' then 80 else 70 end);
    v_share:=greatest(0,least(100,v_share));
    v_full_guaranteed:=floor(v_full_total::numeric*v_share/100.0)::bigint;
    v_full_bonus:=greatest(0,v_full_total-v_full_guaranteed);
    v_factor:=greatest(0.01,least(1.0,coalesce(v_offer.proration_factor,
      case when coalesce(v_offer.coverage_months,0)>0 then v_offer.coverage_months::numeric/12.0 else 1.0 end)));
    v_current_total:=round(v_full_total::numeric*v_factor)::bigint;
    v_current_guaranteed:=floor(v_full_guaranteed::numeric*v_factor)::bigint;
    v_current_bonus:=greatest(0,v_current_total-v_current_guaranteed);
    v_monthly:=case when coalesce(v_offer.coverage_months,0)>0
      then floor(v_current_guaranteed::numeric/v_offer.coverage_months)::bigint else v_current_guaranteed end;

    update public.club_sponsor_offers o
    set full_season_guaranteed_amount=v_full_guaranteed,
        full_season_bonus_pool_amount=v_full_bonus,
        guaranteed_amount=v_current_guaranteed,
        bonus_pool_amount=v_current_bonus,
        monthly_amount=v_monthly,
        metadata=(case
          when coalesce(o.metadata->>'offer_description_version','')='v5_total_breakdown'
            then coalesce(o.metadata,'{}'::jsonb)-'description'-'offer_description_version'
          else coalesce(o.metadata,'{}'::jsonb)
        end) || jsonb_build_object(
          'economic_model_version','v6_reduced_30_market_split',
          'pre_reduction_full_season_contract_total_value',v_v5_total,
          'sponsor_total_reduction_pct',30,
          'full_season_contract_total_value',v_full_total,
          'contract_total_value',v_current_total,
          'guaranteed_amount',v_current_guaranteed,
          'bonus_pool_amount',v_current_bonus,
          'guaranteed_share_pct',round(v_share,2),
          'bonus_share_pct',round(100-v_share,2),
          'objective_market_policy','country_market_groups_v4',
          'economics_refreshed_at',now()
        )
    where o.id=v_offer.id;
  end loop;

  for v_offer in
    select o.id
    from public.club_sponsor_offers o
    where o.club_id=p_club_id
      and o.season_number=p_season
      and o.sponsor_kind='main'
      and o.status='offered'
  loop
    v_preview:=public.sponsor_build_offer_preview_objectives_v4(v_offer.id);
    select coalesce(sum((x.value->>'estimated_reward_amount')::bigint),0)::bigint
      into v_preview_total
    from jsonb_array_elements(coalesce(v_preview,'[]'::jsonb)) as x(value);

    update public.club_sponsor_offers o
    set metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
      'preview_objectives',coalesce(v_preview,'[]'::jsonb),
      'preview_objectives_version','v4_market_group_split',
      'preview_objective_count',jsonb_array_length(coalesce(v_preview,'[]'::jsonb)),
      'preview_objective_total_reward',v_preview_total,
      'preview_objectives_match_bonus_pool',v_preview_total=coalesce(o.bonus_pool_amount,0),
      'preview_objectives_refreshed_at',now()
    )
    where o.id=v_offer.id;
    v_previewed:=v_previewed+1;
  end loop;

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'economic_model_version','v6_reduced_30_market_split',
    'total_reduction_pct',30,
    'objective_market_policy','country_market_groups_v4',
    'offers_previewed',v_previewed
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_set_main_offer_total_value_headlines_v1(p_club_id uuid, p_season integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_count integer:=0;
begin
  update public.club_sponsor_offers o
  set metadata=coalesce(o.metadata,'{}'::jsonb)||jsonb_build_object(
    'description','TOTAL VALUE: $'||to_char(
      greatest(0,coalesce((o.metadata->>'contract_total_value')::bigint,o.guaranteed_amount+o.bonus_pool_amount)),
      'FM999,999,999'
    ),
    'offer_description_version','v6_total_value_headline'
  )
  where o.club_id=p_club_id
    and o.season_number=p_season
    and o.sponsor_kind='main'
    and o.status='offered';
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_pause_role_entitlement_v1(p_club_id uuid, p_role_type text, p_departing_staff_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_remaining bigint;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if p_club_id is null or p_role_type is null or p_departing_staff_id is null then
    return;
  end if;

  select a.* into v_access
  from public.staff_advisory_access a
  where a.club_id = p_club_id
    and a.role_type = p_role_type
    and a.staff_id = p_departing_staff_id
  for update;

  if not found or v_access.entitlement_state <> 'active' then
    return;
  end if;

  v_remaining := greatest(
    0,
    ceil(extract(epoch from (coalesce(v_access.expires_at, v_game_now) - v_game_now)))::bigint
  );

  if v_remaining > 0 then
    update public.staff_advisory_access
    set entitlement_state = 'paused',
        remaining_paid_seconds = v_remaining,
        last_staff_id = p_departing_staff_id,
        staff_id = null,
        expires_at = null,
        paused_at = p_now,
        updated_at = now()
    where id = v_access.id;
  else
    update public.staff_advisory_access
    set entitlement_state = 'expired',
        remaining_paid_seconds = 0,
        last_staff_id = p_departing_staff_id,
        staff_id = null,
        expires_at = null,
        paused_at = null,
        updated_at = now()
    where id = v_access.id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_reconcile_role_entitlement_v1(p_club_id uuid, p_role_type text, p_now timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_staff public.club_staff%rowtype;
  v_has_staff boolean := false;
  v_remaining bigint;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if p_club_id is null or p_role_type is null then
    return;
  end if;

  select a.* into v_access
  from public.staff_advisory_access a
  where a.club_id = p_club_id
    and a.role_type = p_role_type
  for update;

  if not found then
    return;
  end if;

  select s.* into v_staff
  from public.club_staff s
  where s.club_id = p_club_id
    and s.role_type::text = p_role_type
    and s.is_active = true
  order by s.created_at, s.id
  limit 1;
  v_has_staff := found;

  if v_access.entitlement_state = 'active' then
    if v_access.expires_at is null or v_access.expires_at <= v_game_now then
      update public.staff_advisory_access
      set entitlement_state = 'expired',
          remaining_paid_seconds = 0,
          last_staff_id = coalesce(staff_id,last_staff_id),
          staff_id = case when v_has_staff then v_staff.id else null end,
          expires_at = null,
          paused_at = null,
          updated_at = now()
      where id = v_access.id;
      return;
    end if;

    if not v_has_staff then
      v_remaining := greatest(0,ceil(extract(epoch from (v_access.expires_at-v_game_now)))::bigint);
      if v_remaining > 0 then
        update public.staff_advisory_access
        set entitlement_state = 'paused',
            remaining_paid_seconds = v_remaining,
            last_staff_id = coalesce(staff_id,last_staff_id),
            staff_id = null,
            expires_at = null,
            paused_at = p_now,
            updated_at = now()
        where id = v_access.id;
      else
        update public.staff_advisory_access
        set entitlement_state = 'expired',
            remaining_paid_seconds = 0,
            last_staff_id = coalesce(staff_id,last_staff_id),
            staff_id = null,
            expires_at = null,
            paused_at = null,
            updated_at = now()
        where id = v_access.id;
      end if;
      return;
    end if;

    if v_access.staff_id is distinct from v_staff.id then
      update public.staff_advisory_access
      set last_staff_id = coalesce(staff_id,last_staff_id),
          staff_id = v_staff.id,
          resumed_at = p_now,
          updated_at = now()
      where id = v_access.id;
    end if;
    return;
  end if;

  if v_access.entitlement_state = 'paused' then
    if v_access.remaining_paid_seconds <= 0 then
      update public.staff_advisory_access
      set entitlement_state = 'expired',
          remaining_paid_seconds = 0,
          staff_id = case when v_has_staff then v_staff.id else null end,
          expires_at = null,
          paused_at = null,
          updated_at = now()
      where id = v_access.id;
      return;
    end if;

    if v_has_staff then
      update public.staff_advisory_access
      set entitlement_state = 'active',
          last_staff_id = coalesce(last_staff_id,staff_id),
          staff_id = v_staff.id,
          expires_at = v_game_now + make_interval(secs => v_access.remaining_paid_seconds::double precision),
          remaining_paid_seconds = 0,
          resumed_at = p_now,
          paused_at = null,
          updated_at = now()
      where id = v_access.id;
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_before_staff_lifecycle_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    if old.is_active = true then
      perform public.staff_advisory_pause_role_entitlement_v1(
        old.club_id, old.role_type::text, old.id, now()
      );
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.is_active = true
     and (
       new.is_active is distinct from true
       or new.club_id is distinct from old.club_id
       or new.role_type is distinct from old.role_type
     )
  then
    perform public.staff_advisory_pause_role_entitlement_v1(
      old.club_id, old.role_type::text, old.id, now()
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_after_staff_lifecycle_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.staff_advisory_reconcile_role_entitlement_v1(
      old.club_id, old.role_type::text, now()
    );
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.club_id is distinct from new.club_id
       or old.role_type is distinct from new.role_type
       or old.is_active is distinct from new.is_active
    then
      perform public.staff_advisory_reconcile_role_entitlement_v1(
        old.club_id, old.role_type::text, now()
      );
      perform public.staff_advisory_reconcile_role_entitlement_v1(
        new.club_id, new.role_type::text, now()
      );
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and new.is_active = true then
    perform public.staff_advisory_reconcile_role_entitlement_v1(
      new.club_id, new.role_type::text, now()
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_renew_role_v1(p_user_id uuid, p_club_id uuid, p_role_type text, p_idempotency_key text)
 RETURNS TABLE(purchase_id uuid, role_type text, coins_charged integer, balance_after integer, entitlement_state text, remaining_paid_seconds bigint, expires_at timestamp with time zone, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_config public.staff_advisory_config%rowtype;
  v_existing_purchase public.staff_advisory_purchases%rowtype;
  v_staff_id uuid;
  v_staff_name text;
  v_purchase_id uuid;
  v_system_key text;
  v_balance integer;
  v_before_seconds bigint;
  v_after_seconds bigint;
  v_previous_expiry timestamptz;
  v_new_expiry timestamptz;
  v_hypothetical_expiry timestamptz;
  v_state text;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if auth.role()<>'service_role' then raise exception 'staff_advisory_renew_role_v1 may only be called by service_role.' using errcode='42501'; end if;
  if p_user_id is null or p_club_id is null then raise exception 'User and club are required.'; end if;
  if p_role_type not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'Unsupported advisory role.'; end if;
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required.'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=p_user_id and c.deleted_at is null) then raise exception 'Club not found or does not belong to this user.' using errcode='42501'; end if;

  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,p_role_type,now());
  select * into v_access from public.staff_advisory_access a
  where a.user_id=p_user_id and a.club_id=p_club_id and a.role_type=p_role_type for update;
  if not found then raise exception 'There is no Staff Advisory entitlement for this role to renew.'; end if;
  if not ((v_access.entitlement_state='active' and v_access.expires_at>v_game_now)
          or (v_access.entitlement_state='paused' and v_access.remaining_paid_seconds>0)) then raise exception 'The Staff Advisory entitlement for this role has expired.'; end if;

  select * into v_config from public.staff_advisory_config cfg where cfg.id=true;
  if not found or coalesce(v_config.is_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  select p.* into v_existing_purchase from public.staff_advisory_purchases p
  where p.user_id=p_user_id and p.idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing_purchase.club_id<>p_club_id or v_existing_purchase.role_type<>p_role_type then raise exception 'Idempotency key has already been used for another Staff Advisory purchase.'; end if;
    if v_existing_purchase.status='completed' then
      select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=p_user_id;
      select a.entitlement_state,
        case when a.entitlement_state='paused' then a.remaining_paid_seconds else greatest(0,ceil(extract(epoch from (a.expires_at-v_game_now)))::bigint) end,
        a.expires_at into v_state,v_after_seconds,v_new_expiry
      from public.staff_advisory_access a where a.id=v_access.id;
      return query select v_existing_purchase.id,p_role_type,v_existing_purchase.coin_price,coalesce(v_balance,0),v_state,v_after_seconds,v_new_expiry,true;
      return;
    end if;
    raise exception 'A Staff Advisory request with this idempotency key is already being processed.';
  end if;

  v_staff_id:=coalesce(v_access.staff_id,v_access.last_staff_id);
  if v_staff_id is null then raise exception 'Cannot renew entitlement because advisor identity is unavailable.'; end if;
  select s.staff_name::text into v_staff_name from public.club_staff s where s.id=v_staff_id;
  if not found then raise exception 'Cannot renew entitlement because advisor record is unavailable.'; end if;

  if v_access.entitlement_state='active' then
    v_before_seconds:=greatest(0,ceil(extract(epoch from (v_access.expires_at-v_game_now)))::bigint);
    v_previous_expiry:=v_access.expires_at;
    v_new_expiry:=public.staff_advisory_add_game_months_v1(v_access.expires_at,v_config.duration_game_months);
    v_after_seconds:=greatest(0,ceil(extract(epoch from (v_new_expiry-v_game_now)))::bigint);
    v_state:='active';
  else
    v_before_seconds:=v_access.remaining_paid_seconds;
    v_hypothetical_expiry:=v_game_now+make_interval(secs=>v_before_seconds::double precision);
    v_new_expiry:=public.staff_advisory_add_game_months_v1(v_hypothetical_expiry,v_config.duration_game_months);
    v_after_seconds:=greatest(0,ceil(extract(epoch from (v_new_expiry-v_game_now)))::bigint);
    v_previous_expiry:=null;
    v_state:='paused';
  end if;

  v_purchase_id:=gen_random_uuid();
  insert into public.staff_advisory_purchases(
    id,user_id,club_id,staff_id,role_type,idempotency_key,coin_price,duration_real_days,duration_game_months,
    previous_expires_at,new_expires_at,status
  ) values(
    v_purchase_id,p_user_id,p_club_id,v_staff_id,p_role_type,p_idempotency_key,v_config.coin_price,
    v_config.duration_real_days,v_config.duration_game_months,v_previous_expiry,v_new_expiry,'pending'
  );
  v_system_key:='staff_advisory_purchase:'||v_purchase_id::text;
  perform public.apply_coin_delta(p_user_id,-v_config.coin_price,'staff_advisory_purchase',
    jsonb_build_object('system_key',v_system_key,'category','staff_advisory','purchase_id',v_purchase_id,
      'club_id',p_club_id,'staff_id',v_staff_id,'staff_name',v_staff_name,'role_type',p_role_type,
      'coin_price',v_config.coin_price,'duration_game_months',v_config.duration_game_months,
      'duration_basis','game_calendar_months','entitlement_state_before',v_access.entitlement_state,
      'remaining_paid_game_seconds_before',v_before_seconds,'remaining_paid_game_seconds_after',v_after_seconds,
      'automatic_renewal',false,'entitlement_owner','club_role_slot'));

  if v_access.entitlement_state='active' then
    update public.staff_advisory_access set expires_at=v_new_expiry,last_purchase_id=v_purchase_id,updated_at=now() where id=v_access.id;
  else
    update public.staff_advisory_access set remaining_paid_seconds=v_after_seconds,last_purchase_id=v_purchase_id,updated_at=now() where id=v_access.id;
  end if;
  update public.staff_advisory_purchases set status='completed',ledger_reference=v_system_key,completed_at=now() where id=v_purchase_id;
  select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=p_user_id;
  return query select v_purchase_id,p_role_type,v_config.coin_price,coalesce(v_balance,0),v_state,
    v_after_seconds,case when v_state='active' then v_new_expiry else null end,false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_quote_role_v1(p_club_id uuid, p_role_type text)
 RETURNS TABLE(role_type text, advisor_staff_id uuid, advisor_staff_name text, advisory_status text, coin_price integer, duration_real_days integer, current_remaining_seconds bigint, proposed_remaining_seconds bigint, current_expires_at timestamp with time zone, proposed_expires_at timestamp with time zone, is_renewal boolean, automatic_renewal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access public.staff_advisory_access%rowtype;
  v_price integer; v_legacy_days integer; v_months integer; v_enabled boolean;
  v_current_remaining bigint:=0;
  v_proposed_remaining bigint:=0;
  v_current_expiry timestamptz;
  v_proposed_expiry timestamptz;
  v_hypothetical_expiry timestamptz;
  v_status text;
  v_staff_id uuid;
  v_staff_name text;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if auth.uid() is null then raise exception 'Authentication required.'; end if;
  if p_role_type not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'Unsupported advisory role.'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=auth.uid() and c.deleted_at is null) then raise exception 'Club not found or access denied.'; end if;
  select c.coin_price,c.duration_real_days,c.duration_game_months,c.is_enabled into v_price,v_legacy_days,v_months,v_enabled from public.staff_advisory_config c where c.id=true;
  if coalesce(v_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  select * into v_access from public.staff_advisory_access a
  where a.user_id=auth.uid() and a.club_id=p_club_id and a.role_type=p_role_type limit 1;

  if found then
    v_staff_id:=coalesce(v_access.staff_id,v_access.last_staff_id);
    select s.staff_name::text into v_staff_name from public.club_staff s where s.id=v_staff_id;
    if v_access.entitlement_state='paused' and v_access.remaining_paid_seconds>0 then
      v_status:='paused'; v_current_remaining:=v_access.remaining_paid_seconds; v_current_expiry:=null;
      v_hypothetical_expiry:=v_game_now+make_interval(secs=>v_current_remaining::double precision);
    elsif v_access.entitlement_state='active' and v_access.expires_at>v_game_now then
      v_status:='active'; v_current_expiry:=v_access.expires_at;
      v_current_remaining:=greatest(0,ceil(extract(epoch from (v_access.expires_at-v_game_now)))::bigint);
      v_hypothetical_expiry:=v_access.expires_at;
    else
      v_status:='expired'; v_current_remaining:=0; v_current_expiry:=null; v_hypothetical_expiry:=v_game_now;
    end if;
  else
    v_status:='unassigned'; v_hypothetical_expiry:=v_game_now;
  end if;

  v_hypothetical_expiry:=public.staff_advisory_add_game_months_v1(v_hypothetical_expiry,v_months);
  v_proposed_remaining:=greatest(0,ceil(extract(epoch from (v_hypothetical_expiry-v_game_now)))::bigint);
  if v_status='active' then v_proposed_expiry:=v_hypothetical_expiry;
  elsif v_status='paused' then v_proposed_expiry:=null;
  else v_proposed_expiry:=v_hypothetical_expiry;
  end if;

  return query select p_role_type,v_staff_id,v_staff_name,v_status,v_price,v_legacy_days,v_current_remaining,
    v_proposed_remaining,v_current_expiry,v_proposed_expiry,(v_status in ('active','paused')),false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_renew_my_role_v1(p_club_id uuid, p_role_type text, p_idempotency_key text)
 RETURNS TABLE(purchase_id uuid, role_type text, coins_charged integer, balance_after integer, entitlement_state text, remaining_paid_seconds bigint, expires_at timestamp with time zone, was_duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_access public.staff_advisory_access%rowtype;
  v_config public.staff_advisory_config%rowtype;
  v_existing_purchase public.staff_advisory_purchases%rowtype;
  v_staff_id uuid;
  v_staff_name text;
  v_purchase_id uuid;
  v_system_key text;
  v_balance integer;
  v_before_seconds bigint;
  v_after_seconds bigint;
  v_previous_expiry timestamptz;
  v_new_expiry timestamptz;
  v_hypothetical_expiry timestamptz;
  v_state text;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_club_id is null then raise exception 'Club is required.'; end if;
  if p_role_type not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'Unsupported advisory role.'; end if;
  if nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Idempotency key is required.'; end if;
  if length(p_idempotency_key)>200 then raise exception 'Idempotency key is too long.'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=v_user_id and c.deleted_at is null) then raise exception 'Club not found or does not belong to this user.' using errcode='42501'; end if;

  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,p_role_type,now());
  select * into v_access from public.staff_advisory_access a
  where a.user_id=v_user_id and a.club_id=p_club_id and a.role_type=p_role_type for update;
  if not found then raise exception 'There is no Staff Advisory entitlement for this role to renew.'; end if;

  if not ((v_access.entitlement_state='active' and v_access.expires_at>v_game_now)
          or (v_access.entitlement_state='paused' and v_access.remaining_paid_seconds>0)) then
    raise exception 'The Staff Advisory entitlement for this role has expired.';
  end if;

  select * into v_config from public.staff_advisory_config cfg where cfg.id=true;
  if not found or coalesce(v_config.is_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  select p.* into v_existing_purchase from public.staff_advisory_purchases p
  where p.user_id=v_user_id and p.idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing_purchase.club_id<>p_club_id or v_existing_purchase.role_type<>p_role_type then raise exception 'Idempotency key has already been used for another Staff Advisory purchase.'; end if;
    if v_existing_purchase.status='completed' then
      select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=v_user_id;
      select a.entitlement_state,
        case when a.entitlement_state='paused' then a.remaining_paid_seconds else greatest(0,ceil(extract(epoch from (a.expires_at-v_game_now)))::bigint) end,
        a.expires_at into v_state,v_after_seconds,v_new_expiry
      from public.staff_advisory_access a where a.id=v_access.id;
      return query select v_existing_purchase.id,p_role_type,v_existing_purchase.coin_price,coalesce(v_balance,0),v_state,v_after_seconds,v_new_expiry,true;
      return;
    end if;
    raise exception 'A Staff Advisory request with this idempotency key is already being processed.';
  end if;

  v_staff_id:=coalesce(v_access.staff_id,v_access.last_staff_id);
  if v_staff_id is null then raise exception 'Cannot renew entitlement because advisor identity is unavailable.'; end if;
  select s.staff_name::text into v_staff_name from public.club_staff s where s.id=v_staff_id;
  if not found then raise exception 'Cannot renew entitlement because advisor record is unavailable.'; end if;

  if v_access.entitlement_state='active' then
    v_before_seconds:=greatest(0,ceil(extract(epoch from (v_access.expires_at-v_game_now)))::bigint);
    v_previous_expiry:=v_access.expires_at;
    v_new_expiry:=public.staff_advisory_add_game_months_v1(v_access.expires_at,v_config.duration_game_months);
    v_after_seconds:=greatest(0,ceil(extract(epoch from (v_new_expiry-v_game_now)))::bigint);
    v_state:='active';
  else
    v_before_seconds:=v_access.remaining_paid_seconds;
    v_hypothetical_expiry:=v_game_now+make_interval(secs=>v_before_seconds::double precision);
    v_new_expiry:=public.staff_advisory_add_game_months_v1(v_hypothetical_expiry,v_config.duration_game_months);
    v_after_seconds:=greatest(0,ceil(extract(epoch from (v_new_expiry-v_game_now)))::bigint);
    v_previous_expiry:=null;
    v_state:='paused';
  end if;

  v_purchase_id:=gen_random_uuid();
  insert into public.staff_advisory_purchases(
    id,user_id,club_id,staff_id,role_type,idempotency_key,coin_price,duration_real_days,duration_game_months,
    previous_expires_at,new_expires_at,status
  ) values(
    v_purchase_id,v_user_id,p_club_id,v_staff_id,p_role_type,p_idempotency_key,v_config.coin_price,
    v_config.duration_real_days,v_config.duration_game_months,v_previous_expiry,v_new_expiry,'pending'
  );

  v_system_key:='staff_advisory_purchase:'||v_purchase_id::text;
  perform public.apply_coin_delta(v_user_id,-v_config.coin_price,'staff_advisory_purchase',
    jsonb_build_object('system_key',v_system_key,'category','staff_advisory','purchase_id',v_purchase_id,
      'club_id',p_club_id,'staff_id',v_staff_id,'staff_name',v_staff_name,'role_type',p_role_type,
      'coin_price',v_config.coin_price,'duration_game_months',v_config.duration_game_months,
      'duration_basis','game_calendar_months','entitlement_state_before',v_access.entitlement_state,
      'remaining_paid_game_seconds_before',v_before_seconds,'remaining_paid_game_seconds_after',v_after_seconds,
      'automatic_renewal',false,'entitlement_owner','club_role_slot','purchase_mode','role_renewal'));

  if v_access.entitlement_state='active' then
    update public.staff_advisory_access
    set expires_at=v_new_expiry,last_purchase_id=v_purchase_id,updated_at=now(),last_staff_id=coalesce(staff_id,last_staff_id)
    where id=v_access.id;
  else
    update public.staff_advisory_access
    set remaining_paid_seconds=v_after_seconds,last_purchase_id=v_purchase_id,updated_at=now()
    where id=v_access.id;
  end if;

  update public.staff_advisory_purchases set status='completed',ledger_reference=v_system_key,completed_at=now() where id=v_purchase_id;
  select coalesce(w.balance,0) into v_balance from public.user_wallets w where w.user_id=v_user_id;
  return query select v_purchase_id,p_role_type,v_config.coin_price,coalesce(v_balance,0),v_state,
    v_after_seconds,case when v_state='active' then v_new_expiry else null end,false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_get_role_renewal_quote_v1(p_club_id uuid, p_role_type text)
 RETURNS TABLE(role_type text, coin_price integer, duration_real_days integer, entitlement_state text, remaining_paid_seconds bigint, current_expires_at timestamp with time zone, proposed_expires_at timestamp with time zone, automatic_renewal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_access public.staff_advisory_access%rowtype;
  v_config public.staff_advisory_config%rowtype;
  v_remaining bigint;
  v_current timestamptz;
  v_base timestamptz;
  v_proposed timestamptz;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_club_id is null then raise exception 'Club is required.'; end if;
  if p_role_type not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'Unsupported advisory role.'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=v_user_id and c.deleted_at is null) then raise exception 'Club not found or does not belong to this user.' using errcode='42501'; end if;

  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,p_role_type,now());
  select * into v_access from public.staff_advisory_access a
  where a.user_id=v_user_id and a.club_id=p_club_id and a.role_type=p_role_type;
  if not found then raise exception 'There is no Staff Advisory entitlement for this role to renew.'; end if;

  if v_access.entitlement_state='active' and v_access.expires_at>v_game_now then
    v_remaining:=greatest(0,ceil(extract(epoch from (v_access.expires_at-v_game_now)))::bigint);
    v_current:=v_access.expires_at;
    v_base:=v_access.expires_at;
  elsif v_access.entitlement_state='paused' and v_access.remaining_paid_seconds>0 then
    v_remaining:=v_access.remaining_paid_seconds;
    v_current:=null;
    v_base:=v_game_now+make_interval(secs=>v_remaining::double precision);
  else
    raise exception 'The Staff Advisory entitlement for this role has expired.';
  end if;

  select * into v_config from public.staff_advisory_config cfg where cfg.id=true;
  if not found or coalesce(v_config.is_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  v_proposed:=public.staff_advisory_add_game_months_v1(v_base,v_config.duration_game_months);
  return query select p_role_type,v_config.coin_price,v_config.duration_real_days,v_access.entitlement_state,
    v_remaining,v_current,v_proposed,false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_quote_v2(p_club_id uuid, p_staff_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, role_type text, coin_price integer, duration_game_months integer, current_expires_at timestamp with time zone, proposed_expires_at timestamp with time zone, is_renewal boolean, automatic_renewal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_staff public.club_staff%rowtype;
  v_config public.staff_advisory_config%rowtype;
  v_access public.staff_advisory_access%rowtype;
  v_current_expiry timestamptz;
  v_base timestamptz;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=auth.uid() and c.deleted_at is null) then raise exception 'Club not found or access denied.' using errcode='42501'; end if;
  select * into v_staff from public.club_staff s where s.id=p_staff_id and s.club_id=p_club_id and s.is_active=true;
  if not found then raise exception 'This employee is not an active member of the club.'; end if;
  if v_staff.role_type::text not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'This staff role cannot be purchased as an advisor.'; end if;
  select * into v_config from public.staff_advisory_config c where c.id=true;
  if not found or coalesce(v_config.is_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;
  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,v_staff.role_type::text,now());
  select * into v_access from public.staff_advisory_access a where a.user_id=auth.uid() and a.club_id=p_club_id and a.role_type=v_staff.role_type::text limit 1;
  if found and v_access.entitlement_state='active' and v_access.staff_id=p_staff_id and v_access.expires_at>v_game_now then v_current_expiry:=v_access.expires_at; else v_current_expiry:=null; end if;
  v_base:=greatest(v_game_now,coalesce(v_current_expiry,v_game_now));
  return query select v_staff.id,v_staff.staff_name::text,v_staff.role_type::text,v_config.coin_price,v_config.duration_game_months,
    v_current_expiry,public.staff_advisory_add_game_months_v1(v_base,v_config.duration_game_months),(v_current_expiry is not null),false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_get_role_renewal_quote_v2(p_club_id uuid, p_role_type text)
 RETURNS TABLE(role_type text, coin_price integer, duration_game_months integer, entitlement_state text, remaining_paid_game_seconds bigint, proposed_remaining_paid_game_seconds bigint, current_expires_at timestamp with time zone, proposed_expires_at timestamp with time zone, automatic_renewal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_access public.staff_advisory_access%rowtype;
  v_config public.staff_advisory_config%rowtype;
  v_remaining bigint;
  v_proposed_remaining bigint;
  v_current timestamptz;
  v_base timestamptz;
  v_proposed timestamptz;
  v_game_now timestamptz := public.staff_advisory_game_now_v1();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode='42501'; end if;
  if p_club_id is null then raise exception 'Club is required.'; end if;
  if p_role_type not in ('head_coach','sport_director','team_doctor','mechanic','scout_analyst') then raise exception 'Unsupported advisory role.'; end if;
  if not exists(select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=v_user_id and c.deleted_at is null) then raise exception 'Club not found or does not belong to this user.' using errcode='42501'; end if;

  perform public.staff_advisory_reconcile_role_entitlement_v1(p_club_id,p_role_type,now());

  select * into v_access
  from public.staff_advisory_access a
  where a.user_id=v_user_id and a.club_id=p_club_id and a.role_type=p_role_type;
  if not found then raise exception 'There is no Staff Advisory entitlement for this role to renew.'; end if;

  if v_access.entitlement_state='active' and v_access.expires_at>v_game_now then
    v_remaining:=greatest(0,ceil(extract(epoch from (v_access.expires_at-v_game_now)))::bigint);
    v_current:=v_access.expires_at;
    v_base:=v_access.expires_at;
  elsif v_access.entitlement_state='paused' and v_access.remaining_paid_seconds>0 then
    v_remaining:=v_access.remaining_paid_seconds;
    v_current:=null;
    v_base:=v_game_now+make_interval(secs=>v_remaining::double precision);
  else
    raise exception 'The Staff Advisory entitlement for this role has expired.';
  end if;

  select * into v_config from public.staff_advisory_config c where c.id=true;
  if not found or coalesce(v_config.is_enabled,false)=false then raise exception 'Staff Advisory purchasing is currently disabled.'; end if;

  v_proposed:=public.staff_advisory_add_game_months_v1(v_base,v_config.duration_game_months);
  v_proposed_remaining:=greatest(0,ceil(extract(epoch from (v_proposed-v_game_now)))::bigint);

  return query select p_role_type,v_config.coin_price,v_config.duration_game_months,v_access.entitlement_state,
    v_remaining,v_proposed_remaining,v_current,v_proposed,false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_ai_roster_depth_rider_v1(p_club_id uuid, p_desired_role rider_role)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_game_date date := coalesce(public.get_current_game_date_date(), date '2000-01-01');
  v_country text;
  v_profile public.team_tier_balance_profiles%rowtype;
  v_first text;
  v_last text;
  v_role public.rider_role := coalesce(p_desired_role,'Domestique'::public.rider_role);
  v_age integer;
  v_birth date;
  v_target integer;
  v_min integer;
  v_max integer;
  v_sprint integer;
  v_climbing integer;
  v_tt integer;
  v_endurance integer;
  v_flat integer;
  v_recovery integer;
  v_resistance integer;
  v_iq integer;
  v_teamwork integer;
  v_potential integer;
  v_salary integer;
  v_market bigint;
  v_rider_id uuid;
begin
  select c.country_code
  into v_country
  from public.clubs c
  where c.id=p_club_id
    and c.deleted_at is null
    and c.is_active=true
    and c.is_ai=true
    and c.club_type='main';

  if v_country is null then
    raise exception 'AI main club not found or country missing for club %', p_club_id;
  end if;

  select * into v_profile
  from public.team_tier_balance_profiles
  where tier_key=public._get_club_balance_tier_key(p_club_id);

  if not found then
    select * into v_profile
    from public.team_tier_balance_profiles
    where tier_key='amateur';
  end if;

  v_first:=public.pick_generated_rider_first_name(v_country);
  v_last:=public.pick_generated_rider_last_name(v_country);

  v_age:=case
    when v_role='Leader'::public.rider_role then public.rand_int(25,32)
    when v_role='Sprinter'::public.rider_role then public.rand_int(22,30)
    when v_role='Climber'::public.rider_role then public.rand_int(22,30)
    when v_role='Breakaway'::public.rider_role then public.rand_int(23,31)
    else public.rand_int(21,32)
  end;
  v_birth:=(v_game_date-(v_age||' years')::interval-(public.rand_int(0,364)||' days')::interval)::date;

  v_target:=public._clamp_int(
    v_profile.avg_overall_target + case when v_role='Leader'::public.rider_role then public.rand_int(3,6) else public.rand_int(-3,3) end,
    v_profile.rider_min_overall,
    case when v_role='Leader'::public.rider_role then v_profile.rare_cap_overall else v_profile.rider_max_overall end
  );
  v_min:=v_profile.rider_min_overall;
  v_max:=case when v_role='Leader'::public.rider_role then v_profile.rare_cap_overall else v_profile.rider_max_overall end;

  v_sprint:=v_target+public.rand_int(-4,4);
  v_climbing:=v_target+public.rand_int(-4,4);
  v_tt:=v_target+public.rand_int(-4,4);
  v_endurance:=v_target+public.rand_int(-3,4);
  v_flat:=v_target+public.rand_int(-3,4);
  v_recovery:=v_target+public.rand_int(-3,4);
  v_resistance:=v_target+public.rand_int(-3,4);
  v_iq:=v_target+public.rand_int(-3,4);
  v_teamwork:=v_target+public.rand_int(-3,4);

  if v_role='Leader'::public.rider_role then
    v_endurance:=v_endurance+5; v_recovery:=v_recovery+4; v_resistance:=v_resistance+4; v_iq:=v_iq+6;
  elsif v_role='Sprinter'::public.rider_role then
    v_sprint:=v_sprint+8; v_flat:=v_flat+5; v_climbing:=v_climbing-5; v_tt:=v_tt-3;
  elsif v_role='Climber'::public.rider_role then
    v_climbing:=v_climbing+8; v_recovery:=v_recovery+4; v_flat:=v_flat-3; v_sprint:=v_sprint-4;
  elsif v_role='Domestique'::public.rider_role then
    v_teamwork:=v_teamwork+8; v_endurance:=v_endurance+4; v_resistance:=v_resistance+4; v_iq:=v_iq+3;
  elsif v_role='Breakaway'::public.rider_role then
    v_endurance:=v_endurance+7; v_resistance:=v_resistance+6; v_flat:=v_flat+3; v_iq:=v_iq+3;
  else
    v_flat:=v_flat+4; v_endurance:=v_endurance+3; v_teamwork:=v_teamwork+3;
  end if;

  v_sprint:=public._clamp_int(v_sprint,v_min,v_max);
  v_climbing:=public._clamp_int(v_climbing,v_min,v_max);
  v_tt:=public._clamp_int(v_tt,v_min,v_max);
  v_endurance:=public._clamp_int(v_endurance,v_min,v_max);
  v_flat:=public._clamp_int(v_flat,v_min,v_max);
  v_recovery:=public._clamp_int(v_recovery,v_min,v_max);
  v_resistance:=public._clamp_int(v_resistance,v_min,v_max);
  v_iq:=public._clamp_int(v_iq,v_min,v_max);
  v_teamwork:=public._clamp_int(v_teamwork,v_min,v_max);

  v_potential:=public.rand_int(v_profile.potential_min,v_profile.potential_max);
  v_salary:=case when v_role='Leader'::public.rider_role
    then public.rand_int(v_profile.leader_salary_min,v_profile.leader_salary_max)
    else public.rand_int(v_profile.normal_salary_min,v_profile.normal_salary_max)
  end;
  v_market:=public.rand_int(
    greatest(1,floor(v_profile.squad_market_value_min::numeric/10*0.7)::int),
    greatest(1,floor(v_profile.squad_market_value_max::numeric/10*1.2)::int)
  )::bigint;

  insert into public.riders(
    country_code,first_name,last_name,role,sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    morale,potential,birth_date,salary,contract_expires_at,release_requested,market_value,
    asking_price,asking_price_manual,asking_price_updated_at,fatigue,fatigue_updated_on,consecutive_heavy_days,availability_status
  ) values(
    v_country,v_first,v_last,v_role,v_sprint::smallint,v_climbing::smallint,v_tt::smallint,v_endurance::smallint,v_flat::smallint,
    v_recovery::smallint,v_resistance::smallint,v_iq::smallint,v_teamwork::smallint,
    public.rand_int(50,70)::smallint,v_potential::smallint,v_birth,v_salary,
    (v_game_date+interval '12 months')::date,false,v_market,
    null,false,now(),0,v_game_date,0,'fit'
  ) returning id into v_rider_id;

  insert into public.club_riders(club_id,rider_id,assigned_role)
  values(p_club_id,v_rider_id,v_role);

  if to_regprocedure('public.refresh_rider_value_snapshot(uuid)') is not null then
    execute 'select public.refresh_rider_value_snapshot($1)' using v_rider_id;
  elsif to_regprocedure('public.recompute_rider_market_value_snapshot(uuid)') is not null then
    perform public.recompute_rider_market_value_snapshot(v_rider_id);
  end if;

  return v_rider_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_ai_main_roster_minimum_v1(p_club_id uuid, p_minimum integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_before integer;
  v_count integer;
  v_generated integer:=0;
  v_role public.rider_role;
begin
  if p_minimum<1 or p_minimum>18 then
    raise exception 'AI roster minimum must be between 1 and 18.';
  end if;

  if not exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.club_type='main'
  ) then
    raise exception 'Club % is not an active AI main club.',p_club_id;
  end if;

  select count(*)::integer into v_before
  from public.club_riders where club_id=p_club_id;
  v_count:=v_before;

  while v_count<p_minimum loop
    if v_count<10 then
      select sr.rider_role into v_role
      from public.starting_roster_role_profiles sr
      where sr.slot_no=v_count+1;
    else
      v_role:=case ((v_count-10)%5)
        when 0 then 'Domestique'::public.rider_role
        when 1 then 'Domestique'::public.rider_role
        when 2 then 'All-rounder'::public.rider_role
        when 3 then 'Breakaway'::public.rider_role
        else 'Climber'::public.rider_role
      end;
    end if;

    v_role:=coalesce(v_role,'Domestique'::public.rider_role);
    perform public.generate_ai_roster_depth_rider_v1(p_club_id,v_role);
    v_generated:=v_generated+1;
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'club_id',p_club_id,
    'minimum',p_minimum,
    'before',v_before,
    'after',v_count,
    'generated',v_generated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public._generate_domestic_roster_for_club(p_club_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public._generate_domestic_roster_for_club_core_v1(p_club_id);

  if exists(
    select 1 from public.clubs c
    where c.id=p_club_id and c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.club_type='main'
  ) then
    perform public.ensure_ai_main_roster_minimum_v1(p_club_id,15);
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_ai_rosters_for_season_transition_v2(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '600s'
AS $function$
declare
  v_core jsonb;
  r record;
  v_count integer;
  v_generated integer:=0;
  v_clubs_topped_up integer:=0;
  v_role public.rider_role;
begin
  v_core:=public.process_ai_rosters_for_season_transition_core_v2(
    p_transition_run_id,p_source_season,p_target_season
  );

  for r in
    select c.id as club_id
    from public.clubs c
    where c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*)::integer into v_count
    from public.club_riders where club_id=r.club_id;

    if v_count<15 then
      v_clubs_topped_up:=v_clubs_topped_up+1;
    end if;

    while v_count<15 loop
      if v_count<10 then
        select sr.rider_role into v_role
        from public.starting_roster_role_profiles sr
        where sr.slot_no=v_count+1;
      else
        v_role:=case ((v_count-10)%5)
          when 0 then 'Domestique'::public.rider_role
          when 1 then 'Domestique'::public.rider_role
          when 2 then 'All-rounder'::public.rider_role
          when 3 then 'Breakaway'::public.rider_role
          else 'Climber'::public.rider_role
        end;
      end if;

      perform public.ai_transition_generate_rider_v1(
        p_transition_run_id,p_source_season,p_target_season,r.club_id,
        coalesce(v_role,'Domestique'::public.rider_role)
      );
      v_generated:=v_generated+1;
      v_count:=v_count+1;
    end loop;

    perform public.recompute_club_wage_total(r.club_id);
  end loop;

  return v_core || jsonb_build_object(
    'ai_minimum_roster_size',15,
    'minimum_topup_generated',v_generated,
    'clubs_topped_up_to_minimum',v_clubs_topped_up
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_ai_rosters_for_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_core jsonb;
  r record;
  v_count integer;
  v_generated integer:=0;
  v_role public.rider_role;
begin
  v_core:=public.process_ai_rosters_for_season_transition_core_v1(
    p_transition_run_id,p_source_season,p_target_season
  );

  for r in
    select c.id as club_id
    from public.clubs c
    where c.deleted_at is null and c.is_active=true
      and c.is_ai=true and c.owner_user_id is null and c.club_type='main'
    order by c.id
  loop
    select count(*)::integer into v_count
    from public.club_riders where club_id=r.club_id;

    while v_count<15 loop
      if v_count<10 then
        select sr.rider_role into v_role
        from public.starting_roster_role_profiles sr
        where sr.slot_no=v_count+1;
      else
        v_role:=case ((v_count-10)%5)
          when 0 then 'Domestique'::public.rider_role
          when 1 then 'Domestique'::public.rider_role
          when 2 then 'All-rounder'::public.rider_role
          when 3 then 'Breakaway'::public.rider_role
          else 'Climber'::public.rider_role
        end;
      end if;

      perform public.ai_transition_generate_rider_v1(
        p_transition_run_id,p_source_season,p_target_season,r.club_id,
        coalesce(v_role,'Domestique'::public.rider_role)
      );
      v_generated:=v_generated+1;
      v_count:=v_count+1;
    end loop;

    perform public.recompute_club_wage_total(r.club_id);
  end loop;

  return v_core || jsonb_build_object(
    'ai_minimum_roster_size',15,
    'minimum_topup_generated',v_generated
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_validate_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_base jsonb;
  v_main_roster_bad bigint;
  v_ok boolean;
begin
  v_base:=public.game_world_reset_validate_core_v1();

  select count(*) into v_main_roster_bad
  from (
    select b.club_id,c.is_ai,count(cr.rider_id) riders
    from public.game_world_reset_s1_competition_baseline_v1 b
    join public.clubs c on c.id=b.club_id and coalesce(c.club_type,'main')='main'
    left join public.club_riders cr on cr.club_id=b.club_id
    group by b.club_id,c.is_ai
    having count(cr.rider_id)<>case when c.is_ai then 15 else 10 end
  ) x;

  v_ok:=
    coalesce((v_base->>'clock_bad')::bigint,1)=0
    and coalesce((v_base->>'competition_bad')::bigint,1)=0
    and coalesce((v_base->>'points_bad')::bigint,1)=0
    and v_main_roster_bad=0
    and coalesce((v_base->>'domestic_rider_mismatches')::bigint,1)=0
    and coalesce((v_base->>'duplicate_rider_assignments')::bigint,1)=0
    and coalesce((v_base->>'national_team_violations')::bigint,1)=0
    and coalesce((v_base->>'assigned_staff')::bigint,1)=0
    and coalesce((v_base->>'equipment_bad_clubs')::bigint,1)=0
    and coalesce((v_base->>'s1_stage_results')::bigint,1)=0
    and coalesce((v_base->>'s1_classifications')::bigint,1)=0
    and coalesce((v_base->>'s1_ranking_awards')::bigint,1)=0
    and coalesce((v_base->>'s1_international_points_ledger')::bigint,1)=0
    and coalesce((v_base->>'future_races')::bigint,1)=0
    and coalesce((v_base->>'s1_races_not_scheduled')::bigint,1)=0
    and coalesce((v_base->>'ranking_snapshot_rows')::bigint,1)=0
    and coalesce((v_base->>'available_generated_free_agents')::bigint,-1)=56
    and coalesce((v_base->>'transition_armed_rows')::bigint,1)=0
    and coalesce((v_base->>'transition_function_hash_mismatches')::bigint,1)=0
    and coalesce((v_base->>'user_clubs_without_sponsor_offers')::bigint,1)=0;

  return jsonb_set(
    jsonb_set(v_base,'{main_roster_bad}',to_jsonb(v_main_roster_bad),true),
    '{ok}',to_jsonb(v_ok),true
  ) || jsonb_build_object(
    'ai_main_roster_minimum',15,
    'player_main_roster_target',10
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_exact_rider_submission_deadline_game_at_v1(p_race_id uuid)
 RETURNS timestamp without time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_stage_start timestamp without time zone;
begin
  select r.id, r.start_date,
         r.planned_start_hour_number,
         r.planned_start_minute
  into v_race
  from public.races r
  where r.id = p_race_id;

  if not found then return null; end if;

  if extract(month from v_race.start_date)::int <> 1
     or extract(day from v_race.start_date)::int > 15 then
    return null;
  end if;

  select rs.stage_date::timestamp
         + make_interval(
             hours => coalesce(rs.planned_start_hour_number, v_race.planned_start_hour_number, 12),
             mins  => coalesce(rs.planned_start_minute, v_race.planned_start_minute, 0)
           )
  into v_stage_start
  from public.race_stages rs
  where rs.race_id = p_race_id
  order by rs.stage_number asc
  limit 1;

  if v_stage_start is null then
    v_stage_start := v_race.start_date::timestamp
      + make_interval(
          hours => coalesce(v_race.planned_start_hour_number, 12),
          mins  => coalesce(v_race.planned_start_minute, 0)
        );
  end if;

  return v_stage_start - interval '3 hours';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_race_entry_rules_exact_early_january_deadline_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_exact timestamp without time zone;
begin
  v_exact := public.get_exact_rider_submission_deadline_game_at_v1(new.race_id);

  if v_exact is not null then
    new.rider_submission_deadline_game_at := v_exact;
    new.rider_submission_deadline := v_exact::date;
    new.rider_submission_deadline_season_number := extract(year from v_exact)::int - 1999;
    new.rider_submission_deadline_month_number := extract(month from v_exact)::int;
    new.rider_submission_deadline_day_number := extract(day from v_exact)::int;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'rider_deadline_time_policy', 'january_1_15_stage1_minus_3_hours',
      'rider_submission_deadline_game_at', v_exact
    );
  else
    new.rider_submission_deadline_game_at := null;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_rebase_race_engine_activation_on_clock_rewind_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_season_start timestamp without time zone;
  v_rebase_target timestamp without time zone;
  v_is_canonical_full_reset boolean := false;
begin
  if new.base_game_at < old.base_game_at then
    v_season_start := make_date(
      1999 + coalesce(new.base_season, extract(year from new.base_game_at)::int - 1999),
      1,
      1
    )::timestamp;

    v_is_canonical_full_reset :=
      new.base_season = 1
      and new.base_game_at = timestamp '2000-01-01 01:00:00'
      and new.is_paused = true
      and exists (
        select 1
        from public.game_world_reset_runs r
        where r.status = 'source_frozen'
      );

    -- A canonical Full Game World Reset deliberately starts at 01:00.
    -- Do not let the generic rewind guard overwrite that with midnight.
    v_rebase_target := case
      when v_is_canonical_full_reset then new.base_game_at
      else v_season_start
    end;

    update public.race_engine_runtime_control_v1
    set typescript_activation_game_at = least(
          coalesce(typescript_activation_game_at, v_rebase_target),
          v_rebase_target
        ),
        updated_at = clock_timestamp(),
        notes = coalesce(notes,'') || E'\nClock rewind guard: TypeScript lifecycle activation rebased to ' || v_rebase_target::text
    where singleton_id=true
      and coalesce(typescript_lifecycle_enabled,false)=true
      and (
        typescript_activation_game_at is null
        or typescript_activation_game_at > v_rebase_target
      );
  end if;

  return new;
end;
$function$
;

