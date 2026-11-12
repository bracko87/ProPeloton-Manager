-- Safely authorize ONLY the existing Youth Academy auto-renewal debit
-- during the atomic Season 1 to Season 2 transition, in addition to the
-- already-allowed Developing Team seasonal renewal.
-- The protected per-transaction reason must match each coin-ledger row.
-- The private rollover routine scopes and restores its reason explicitly.
-- All ordinary/unsanctioned wallet and coin-ledger writes remain blocked.
DO $migration$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public.guard_wallet_persistence_during_transition_v1()'::regprocedure) INTO v_src;
  IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'if v_reason<>''developing_team_season_renewal'' then','')))/length('if v_reason<>''developing_team_season_renewal'' then')<>1 THEN RAISE EXCEPTION 'Coin renewal guard baseline mismatch: public.guard_wallet_persistence_during_transition_v1()'; END IF;
  v_src:=replace(v_src,'if v_reason<>''developing_team_season_renewal'' then','if v_reason not in (''developing_team_season_renewal'',''youth_academy_season_renewal'') then');
  EXECUTE v_src;
  SELECT pg_get_functiondef('public.guard_coin_ledger_persistence_during_transition_v1()'::regprocedure) INTO v_src;
  IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'if v_reason<>''developing_team_season_renewal'' or new.reason<>''developing_team_season_renewal'' then','')))/length('if v_reason<>''developing_team_season_renewal'' or new.reason<>''developing_team_season_renewal'' then')<>1 THEN RAISE EXCEPTION 'Coin renewal guard baseline mismatch: public.guard_coin_ledger_persistence_during_transition_v1()'; END IF;
  v_src:=replace(v_src,'if v_reason<>''developing_team_season_renewal'' or new.reason<>''developing_team_season_renewal'' then','if v_reason not in (''developing_team_season_renewal'',''youth_academy_season_renewal'') or new.reason is distinct from v_reason then');
  EXECUTE v_src;
  SELECT pg_get_functiondef('private.transition_player_youth_academies_v1(integer,integer)'::regprocedure) INTO v_src;
  IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'declare a record;v_balance integer;','')))/length('declare a record;v_balance integer;')<>1 THEN RAISE EXCEPTION 'Coin renewal guard baseline mismatch: private.transition_player_youth_academies_v1(integer,integer)'; END IF;
  IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'perform public.debit_user_coins_idempotent_v1(a.owner_user_id,','')))/length('perform public.debit_user_coins_idempotent_v1(a.owner_user_id,')<>1 THEN RAISE EXCEPTION 'Coin renewal guard baseline mismatch: private.transition_player_youth_academies_v1(integer,integer)'; END IF;
  IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'''coin_cost'',public.youth_academy_renewal_coin_cost_v1()));','')))/length('''coin_cost'',public.youth_academy_renewal_coin_cost_v1()));')<>1 THEN RAISE EXCEPTION 'Coin renewal guard baseline mismatch: private.transition_player_youth_academies_v1(integer,integer)'; END IF;
  v_src:=replace(v_src,'declare a record;v_balance integer;','declare a record;v_prior_coin_reason text;v_balance integer;');
  v_src:=replace(v_src,'perform public.debit_user_coins_idempotent_v1(a.owner_user_id,','v_prior_coin_reason:=coalesce(current_setting(''app.season_transition_coin_reason'',true),'''');
       perform set_config(''app.season_transition_coin_reason'',''youth_academy_season_renewal'',true);
       perform public.debit_user_coins_idempotent_v1(a.owner_user_id,');
  v_src:=replace(v_src,'''coin_cost'',public.youth_academy_renewal_coin_cost_v1()));','''coin_cost'',public.youth_academy_renewal_coin_cost_v1()));
       perform set_config(''app.season_transition_coin_reason'',v_prior_coin_reason,true);');
  EXECUTE v_src;
END
$migration$;