-- Disposable test season policy for the full ProPeloton Manager S1 restart.
-- The preceding reset gate still requires a signed-off execution plan,
-- exact preservation of 11 owned clubs, national build readiness,
-- maintenance lock, zero active cron jobs and drained race workers.
-- A full restorable DB backup is an OPTION, not a requirement when the owner
-- approves discarding test results and critical account records have been
-- separately snapshotted and reverified. This is NOT a full DB backup.
--
-- User IDs (not password hashes), profiles, club ownership, coin wallets and
-- ledger, real billing subscriptions/invoices and welcome trials are held
-- in the private schema. No paid data is deleted by this migration.

CREATE TABLE IF NOT EXISTS private.game_world_reset_critical_account_snapshot_v1 (
  reset_run_id uuid NOT NULL REFERENCES public.game_world_reset_runs(id) ON DELETE RESTRICT,
  record_type text NOT NULL,
  record_key text NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(reset_run_id,record_type,record_key)
);
ALTER TABLE private.game_world_reset_critical_account_snapshot_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_critical_account_snapshot_v1
FROM PUBLIC,anon,authenticated;

ALTER TABLE private.game_world_reset_execution_signoffs_v1
  ADD COLUMN IF NOT EXISTS test_history_disposable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS critical_account_snapshot_verified boolean NOT NULL DEFAULT false;

-- private.game_world_reset_capture_critical_accounts_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_capture_critical_accounts_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_total bigint;
 v_users bigint;
 v_wallets bigint;
 v_owned bigint;
 v_invoices bigint;
 v_ledger bigint;
BEGIN
 IF NOT EXISTS (
    SELECT 1 FROM public.game_world_reset_runs r
    WHERE r.id=p_reset_run_id AND r.status IN ('preflight','source_frozen')
 ) THEN
   RAISE EXCEPTION 'No prepared or frozen reset run matches snapshot request';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('game_world_reset_critical_accounts_snapshot_v1')::bigint);
 DELETE FROM private.game_world_reset_critical_account_snapshot_v1
 WHERE reset_run_id=p_reset_run_id;

 WITH records AS (
   SELECT 'account_id'::text record_type,u.id::text record_key,
      jsonb_build_object('id',u.id) payload FROM auth.users u
   UNION ALL SELECT 'profile',p.id::text,to_jsonb(p) FROM public.profiles p
   UNION ALL SELECT 'owned_club',c.id::text,
      jsonb_build_object('id',c.id,'owner_user_id',c.owner_user_id,
      'name',c.name,'country_code',c.country_code,'club_type',c.club_type,
      'deleted_at',c.deleted_at,'is_ai',c.is_ai)
      FROM public.clubs c WHERE c.owner_user_id IS NOT NULL AND c.deleted_at IS NULL
   UNION ALL SELECT 'wallet',w.user_id::text,to_jsonb(w) FROM public.user_wallets w
   UNION ALL SELECT 'premium_subscription',s.user_id::text,to_jsonb(s)
      FROM public.user_premium_subscriptions s
   UNION ALL SELECT 'premium_invoice',
      row_number() OVER (ORDER BY i.stripe_invoice_id,i.processed_at)::text,
      to_jsonb(i)-'raw_payload' FROM public.premium_invoice_payments i
   UNION ALL SELECT 'coin_ledger',l.id::text,to_jsonb(l) FROM public.user_coin_ledger l
   UNION ALL SELECT 'welcome_trial',t.user_id::text,to_jsonb(t)
      FROM public.premium_welcome_trials_v1 t
 )
 INSERT INTO private.game_world_reset_critical_account_snapshot_v1(
   reset_run_id,record_type,record_key,payload)
 SELECT p_reset_run_id,record_type,record_key,payload FROM records;

 SELECT count(*),count(*) FILTER(WHERE record_type='account_id'),
   count(*) FILTER(WHERE record_type='wallet'),
   count(*) FILTER(WHERE record_type='owned_club'),
   count(*) FILTER(WHERE record_type='premium_invoice'),
   count(*) FILTER(WHERE record_type='coin_ledger')
 INTO v_total,v_users,v_wallets,v_owned,v_invoices,v_ledger
 FROM private.game_world_reset_critical_account_snapshot_v1
 WHERE reset_run_id=p_reset_run_id;

 IF v_users<>(SELECT count(*) FROM auth.users)
    OR v_wallets<>(SELECT count(*) FROM public.user_wallets)
    OR v_owned<>(SELECT count(*) FROM public.clubs WHERE owner_user_id IS NOT NULL AND deleted_at IS NULL)
    OR v_invoices<>(SELECT count(*) FROM public.premium_invoice_payments)
    OR v_ledger<>(SELECT count(*) FROM public.user_coin_ledger)
    OR (SELECT count(*) FROM private.game_world_reset_critical_account_snapshot_v1
        WHERE reset_run_id=p_reset_run_id AND record_type='profile')
      <> (SELECT count(*) FROM public.profiles)
    OR (SELECT count(*) FROM private.game_world_reset_critical_account_snapshot_v1
        WHERE reset_run_id=p_reset_run_id AND record_type='premium_subscription')
      <> (SELECT count(*) FROM public.user_premium_subscriptions)
 THEN
   RAISE EXCEPTION 'Account snapshot failed its source-count checks; transaction rolled back';
 END IF;
 RETURN jsonb_build_object(
   'ok',true,'reset_run_id',p_reset_run_id,'account_ids',v_users,
   'owned_clubs',v_owned,'wallets',v_wallets,'invoices',v_invoices,
   'coin_ledger_entries',v_ledger,'snapshot_records',v_total,
   'note','Limited account/entitlement snapshot only, not full database backup'
 );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_capture_critical_accounts_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_capture_critical_accounts_v1(uuid) TO service_role;

-- private.game_world_reset_critical_account_snapshot_current_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_critical_account_snapshot_current_v1(p_reset_run_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH sources AS (
   SELECT 'account_id'::text kind,u.id::text key,jsonb_build_object('id',u.id) payload
     FROM auth.users u
   UNION ALL SELECT 'profile',p.id::text,to_jsonb(p) FROM public.profiles p
   UNION ALL SELECT 'owned_club',c.id::text,
     jsonb_build_object('id',c.id,'owner_user_id',c.owner_user_id,
      'name',c.name,'country_code',c.country_code,'club_type',c.club_type,
      'deleted_at',c.deleted_at,'is_ai',c.is_ai)
     FROM public.clubs c WHERE c.owner_user_id IS NOT NULL AND c.deleted_at IS NULL
   UNION ALL SELECT 'wallet',w.user_id::text,to_jsonb(w) FROM public.user_wallets w
   UNION ALL SELECT 'premium_subscription',s.user_id::text,to_jsonb(s)
     FROM public.user_premium_subscriptions s
   UNION ALL SELECT 'premium_invoice',
     row_number() OVER(ORDER BY i.stripe_invoice_id,i.processed_at)::text,
     to_jsonb(i)-'raw_payload' FROM public.premium_invoice_payments i
   UNION ALL SELECT 'coin_ledger',l.id::text,to_jsonb(l) FROM public.user_coin_ledger l
   UNION ALL SELECT 'welcome_trial',t.user_id::text,to_jsonb(t) FROM public.premium_welcome_trials_v1 t
 ), existing AS (
   SELECT record_type kind,record_key key,payload,captured_at
   FROM private.game_world_reset_critical_account_snapshot_v1
   WHERE reset_run_id=p_reset_run_id
 ), changes AS (
   SELECT 1
   FROM sources src FULL OUTER JOIN existing s ON s.kind=src.kind AND s.key=src.key
   WHERE src.kind IS NULL OR s.kind IS NULL OR src.payload IS DISTINCT FROM s.payload
   LIMIT 1
 )
 SELECT (
   (SELECT count(*) FROM existing)>0
   AND (SELECT min(captured_at) FROM existing)>= now()-interval '15 minutes'
   AND NOT EXISTS(SELECT 1 FROM changes)
 );
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_critical_account_snapshot_current_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_critical_account_snapshot_current_v1(uuid) TO service_role;

-- private.game_world_reset_activate_maintenance_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_activate_maintenance_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.game_world_reset_runs
   WHERE id=p_reset_run_id AND status='preflight'
 ) THEN RAISE EXCEPTION 'Maintenance can only start from a prepared preflight reset'; END IF;

 IF NOT EXISTS (
   SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
   WHERE s.reset_run_id=p_reset_run_id AND (
       (s.backup_verified=true AND length(btrim(coalesce(s.backup_reference,'')))>5)
       OR (s.test_history_disposable=true
           AND s.critical_account_snapshot_verified=true
           AND private.game_world_reset_critical_account_snapshot_current_v1(p_reset_run_id))
     )
     AND s.player_clubs_preserved=true AND s.national_calendar_rebuild_verified=true
     AND s.reset_validator_updated=true AND s.signed_off_at IS NOT NULL
 ) THEN RAISE EXCEPTION 'Maintenance cannot start without verified backup and approved restart checks'; END IF;

 UPDATE private.game_world_reset_maintenance_gate_v1
 SET locked=true,locked_at=coalesce(locked_at,now()),
     reset_run_id=p_reset_run_id,updated_at=now()
 WHERE id=true AND (locked=false OR reset_run_id=p_reset_run_id);

 IF NOT FOUND THEN RAISE EXCEPTION 'Another reset owns the maintenance lock'; END IF;

 RETURN jsonb_build_object('ok',true,'restart_locked',true,'reset_run_id',p_reset_run_id);
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_activate_maintenance_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_activate_maintenance_v1(uuid) TO service_role;

-- private.game_world_reset_quiesce_cron_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_quiesce_cron_v1(p_reset_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_job record;
 v_active_before int;
 v_changed int:=0;
 v_total int;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM public.game_world_reset_runs r
   WHERE r.id=p_reset_run_id AND r.status='source_frozen'
 ) OR NOT EXISTS(
   SELECT 1 FROM public.game_state g JOIN public.game_clock_config c ON c.id=true
   WHERE g.id=true AND g.is_paused=true AND c.is_paused=true
 ) THEN
   RAISE EXCEPTION 'Cron quiescence requires a frozen reset run and paused game clock';
 END IF;

 IF NOT EXISTS (
   SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
   WHERE s.reset_run_id=p_reset_run_id AND (
       (s.backup_verified=true AND length(btrim(coalesce(s.backup_reference,'')))>5)
       OR (s.test_history_disposable=true
           AND s.critical_account_snapshot_verified=true
           AND private.game_world_reset_critical_account_snapshot_current_v1(p_reset_run_id))
     )
     AND s.player_clubs_preserved AND s.national_calendar_rebuild_verified
     AND s.reset_validator_updated AND s.signed_off_at IS NOT NULL
 ) THEN
   RAISE EXCEPTION 'Cron quiescence blocked until all backup and restart protections are verified';
 END IF;

 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('game_world_reset_cron_quiescence_v1')::bigint);
 SELECT count(*) INTO v_active_before FROM cron.job WHERE active=true;

 IF NOT EXISTS(
   SELECT 1 FROM private.game_world_reset_cron_snapshot_v1
   WHERE reset_run_id=p_reset_run_id
 ) THEN
   INSERT INTO private.game_world_reset_cron_snapshot_v1(
    reset_run_id,job_id,job_name,originally_active
   )
   SELECT p_reset_run_id,jobid,jobname,active FROM cron.job;
 END IF;

 FOR v_job IN SELECT jobid FROM cron.job WHERE active=true ORDER BY jobid
 LOOP
   PERFORM cron.alter_job(job_id:=v_job.jobid,active:=false);
   v_changed:=v_changed+1;
 END LOOP;

 IF EXISTS(SELECT 1 FROM cron.job WHERE active=true) THEN
   RAISE EXCEPTION 'Could not suspend all cron jobs; changes rolled back';
 END IF;

 SELECT count(*) INTO v_total FROM private.game_world_reset_cron_snapshot_v1
 WHERE reset_run_id=p_reset_run_id;
 RETURN jsonb_build_object(
   'ok',true,'cron_jobs_snapshotted',v_total,
   'previously_active_jobs',v_active_before,'jobs_disabled_now',v_changed,
   'jobs_still_active',0,'note','In-flight jobs and remote endpoints must also be drained/blocked before executing reset'
 );
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_quiesce_cron_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_quiesce_cron_v1(uuid) TO service_role;

-- private.game_world_reset_execute_guard_v1(uuid)
CREATE OR REPLACE FUNCTION private.game_world_reset_execute_guard_v1(p_reset_run_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_missing_player_clubs int;
BEGIN
  SELECT COUNT(*) INTO v_missing_player_clubs
  FROM public.clubs c
  WHERE c.deleted_at IS NULL
    AND c.owner_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b
      WHERE b.club_id=c.id
    );
  IF v_missing_player_clubs>0 THEN
    RAISE EXCEPTION 'World reset blocked: % player-owned clubs excluded from Season 1 baseline', v_missing_player_clubs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM private.game_world_reset_execution_signoffs_v1 s
    WHERE s.reset_run_id=p_reset_run_id
      AND (
       (s.backup_verified=true AND length(btrim(coalesce(s.backup_reference,'')))>5)
       OR (s.test_history_disposable=true
           AND s.critical_account_snapshot_verified=true
           AND private.game_world_reset_critical_account_snapshot_current_v1(p_reset_run_id))
     )
      AND s.player_clubs_preserved=true
      AND s.national_calendar_rebuild_verified=true
      AND s.reset_validator_updated=true
      AND s.signed_off_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'World reset blocked: verified backup, club preservation, national calendar rebuild and validation signoffs required';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM private.game_world_reset_maintenance_gate_v1 m
    WHERE m.id=true AND m.locked=true AND m.reset_run_id=p_reset_run_id
  ) THEN
    RAISE EXCEPTION 'World reset blocked: game maintenance lock is not active';
  END IF;

  -- The backup signoff alone is insufficient: background game engines must
  -- be suspended and their previous cron settings retained for safe recovery.
  IF NOT EXISTS (
    SELECT 1 FROM private.game_world_reset_cron_snapshot_v1 snap
    WHERE snap.reset_run_id=p_reset_run_id
  ) OR EXISTS (
    SELECT 1 FROM cron.job WHERE active=true
  ) OR EXISTS (
    SELECT 1 FROM cron.job_run_details d
    WHERE d.status='running' AND d.start_time>now()-interval '20 minutes'
  ) THEN
    RAISE EXCEPTION 'World reset blocked: cron jobs must be snapshotted, suspended, and drained';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.game_world_reset_execute_guard_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.game_world_reset_execute_guard_v1(uuid) TO service_role;

