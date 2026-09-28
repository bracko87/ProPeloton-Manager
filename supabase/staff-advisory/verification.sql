-- Staff Advisory Support — verification SQL
-- Run in staging after 001..004 and both Edge Functions are deployed.
-- Use real staging UUIDs for the placeholders before running purchase tests.

-- 1. Schema exists.
select to_regclass('public.staff_advisory_access') as advisory_access_table,
       to_regclass('public.staff_advisory_purchases') as advisory_purchase_table,
       to_regclass('public.staff_advisory_pins') as advisory_pins_table,
       to_regclass('public.staff_advisory_reports') as advisory_reports_table;

-- 2. Required RPCs exist.
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'staff_advisory_get_state_v1',
    'staff_advisory_get_briefing_v1',
    'staff_advisory_set_pins_v1',
    'staff_advisory_quote_v1',
    'staff_advisory_activate_v1',
    'staff_advisory_debit_coins_v1',
    'staff_advisory_store_report_v1',
    'staff_advisory_deliver_inbox_v1',
    'staff_advisory_get_reports_v1'
  )
order by p.proname;

-- 3. Canonical integrations exist.
select to_regclass('public.user_wallets') as wallet_table,
       to_regclass('public.user_coin_ledger') as ledger_table,
       to_regprocedure('public.apply_coin_delta(uuid,integer,text,jsonb)') as coin_rpc,
       to_regprocedure('public.inbox_send_admin_message_to_user(uuid,text,text)') as inbox_rpc;

-- 4. Duplicate purchase protection is database-enforced.
select indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'staff_advisory_purchases'
  and indexdef ilike '%idempotency_key%';

-- 5. Duplicate report protection is database-enforced.
select indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'staff_advisory_reports'
  and indexdef ilike '%report_code%reporting_period_start%';

-- 6. Pin limit is enforced at DB level (sort_order only permits 1..5).
select pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.staff_advisory_pins'::regclass;

-- 7. RLS enabled.
select relname, relrowsecurity
from pg_class
where relname in (
  'staff_advisory_access',
  'staff_advisory_purchases',
  'staff_advisory_pins',
  'staff_advisory_reports',
  'staff_advisory_report_events'
)
order by relname;

-- ---------------------------------------------------------------------------
-- Authenticated scenario tests
-- Run these inside a transaction with a real staging user JWT/role context.
-- Replace placeholders:
--   <CLUB_UUID>
--   <STAFF_UUID>
-- ---------------------------------------------------------------------------

-- begin;
-- set local role authenticated;
-- select public.staff_advisory_get_briefing_v1('<CLUB_UUID>'::uuid);
-- select public.staff_advisory_quote_v1('<CLUB_UUID>'::uuid, '<STAFF_UUID>'::uuid, 10, 30);
-- rollback;

-- ---------------------------------------------------------------------------
-- Required manual/automated regression cases
-- ---------------------------------------------------------------------------
-- A. First activation
--    wallet before - wallet after = quoted price
--    exactly one purchase row
--    exactly one user_coin_ledger row with reason staff_advisory_access
--    access expiry = approximately now + duration
--
-- B. Exact idempotent replay
--    invoke activation twice with the same idempotency_key
--    second result has idempotent_replay=true
--    wallet changes once only
--    one purchase only
--    one coin ledger debit only
--
-- C. Concurrent duplicate activation
--    send the same idempotency key concurrently
--    unique(user_id,idempotency_key) prevents duplicate purchase/charge
--
-- D. Insufficient coins
--    wallet balance < quote price
--    activation returns insufficient_coins
--    wallet unchanged
--    no purchase row committed
--    no advisory access committed
--
-- E. Early renewal
--    activate, then renew before expiry
--    new expiry = prior expiry + duration (not now + duration)
--
-- F. Expired renewal
--    expire access in staging, then renew
--    new expiry = now + duration
--
-- G. Staff fired/removed
--    set club_staff.is_active=false for the purchased staff
--    briefing no longer presents that staff as hired
--    report generation returns staff_not_hired_or_inactive
--    replacement employee receives no inherited access
--    historical reports remain queryable
--
-- H. Premium cancellation
--    alter Premium status only
--    advisory_access row and expiry remain unchanged
--
-- I. Pinning
--    0..5 hired staff IDs succeeds
--    6 IDs fails pin_limit_exceeded
--    inactive/foreign staff fails invalid_or_inactive_staff
--
-- J. Report anti-spam
--    generate the same role report twice in one reporting period
--    first created=true
--    second duplicate_prevented=true
--    exactly one staff_advisory_reports row
--    exactly one Inbox delivery
--
-- K. Pay-to-win regression
--    compare rider attributes, energy/freshness, equipment state and race-engine
--    inputs before/after advisory activation/report generation: no gameplay value changes.
