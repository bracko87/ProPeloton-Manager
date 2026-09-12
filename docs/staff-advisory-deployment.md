# Staff Advisory Support — Deployment and Rollback

## Final launch rules

- 10 coins per hired staff member
- 30 real-life days
- manual activation and renewal only
- early renewal extends the current expiry
- Free and Premium accounts may purchase
- Premium cancellation does not affect purchased advisory access
- five pinned Overview cards maximum
- weekly reports: Head Coach, Sports Director, Chief Mechanic, Scout, U23 Coach
- Team Doctor report: maximum one digest per UTC day
- reports analyze visible manager data only
- essential warnings remain Free and independent

## Required deployment order

Apply SQL in this exact order:

1. `supabase/staff-advisory/001_staff_advisory.sql`
2. `supabase/staff-advisory/002_staff_advisory_integrations.sql`
3. `supabase/staff-advisory/003_staff_advisory_inbox.sql`
4. `supabase/staff-advisory/004_staff_advisory_briefing.sql`
5. `supabase/staff-advisory/005_staff_advisory_security.sql`

Then deploy Edge Functions:

- `staff-advisory`
- `generate-staff-advisory-report`

Both require the normal Supabase Edge environment. The report generator additionally requires `SUPABASE_SERVICE_ROLE_KEY` because report storage and Inbox delivery are backend-only operations.

## Frontend integration

The functional component is:

`src/features/staff-advisory/StaffBriefingCentre.tsx`

The existing `Overview.tsx` currently contains an internal placeholder component with the same product name. Replace that placeholder usage with the new feature component and pass:

- `clubId={data.club.id}`
- `inboxUnread={data.club.inboxUnread}`
- `notificationsUnread={data.club.notificationsUnread}`
- `coinBalance={coinBalance}`
- `coinBalanceLoading={coinBalanceLoading}`
- `refreshing={refreshing}`

Do not wrap Staff Advisory in `PremiumFeatureGate`. Advisory is available to Free and Premium users.

## Pre-deploy verification

Run `supabase/staff-advisory/verification.sql` in staging.

Additionally verify the deployed canonical dependencies:

- `public.user_wallets`
- `public.user_coin_ledger`
- `public.apply_coin_delta(uuid, integer, text, jsonb)`
- `public.inbox_send_admin_message_to_user(uuid, text, text)`
- `public.get_my_club_id()`
- `public.club_staff`
- `public.get_dashboard_overview()`

## Required transaction tests

Before production enablement, test with a staging user:

1. Successful activation removes exactly 10 coins.
2. Same idempotency key submitted twice removes coins exactly once.
3. Insufficient balance removes no coins and creates no access.
4. Early renewal adds 30 days to existing expiry.
5. Expired renewal starts from current real time.
6. Fired/inactive employee cannot generate new reports and access does not transfer.
7. Replacement employee starts advisory inactive.
8. Premium cancellation leaves advisory expiry untouched.
9. Six pinned staff IDs are rejected.
10. Same report period produces one report and one Inbox delivery.

## Notification/pay-to-win acceptance check

Confirm that these remain independent Free alerts regardless of advisory state:

- race entry/application deadlines
- missing race or stage preparation
- injuries and sickness
- rider/staff contract expiries
- sponsor deadlines/objective failures
- financial emergency/liquidation warnings
- critical equipment/repair/low-stock warnings
- transfer/negotiation deadlines
- account/payment/Premium/coin transaction issues
- race cancellations or material schedule changes

Activation and report generation must not mutate rider attributes, energy/freshness, medical outcomes, equipment state, race plans, tactics, race-engine inputs or results.

## Monitoring after release

Monitor for:

- `staff_advisory_access` count and expiries
- purchase failures grouped by error
- duplicate idempotency attempts
- `user_coin_ledger.reason = 'staff_advisory_access'`
- report creation volume by `report_code`
- duplicate-prevented generation attempts
- Inbox delivery failures

If Team Doctor reports are too noisy, keep health alerts unchanged and reduce advisory generation frequency. Never reduce the Free medical warning frequency as a monetization adjustment.

## Rollback

### Frontend/Edge rollback

1. Restore the existing Overview placeholder component.
2. Undeploy or stop calling `staff-advisory` and `generate-staff-advisory-report`.
3. Set `public.staff_advisory_config.purchases_enabled = false` immediately to prevent new charges.
4. Set `reports_enabled = false` if report generation also needs to stop.

### Database rollback policy

Do not drop purchase, access, report or ledger history after users have paid.

A safe operational rollback is:

```sql
update public.staff_advisory_config
set purchases_enabled = false,
    reports_enabled = false,
    updated_at = now()
where config_key = 'default';
```

Keep existing purchased expiry dates intact so service can be restored without losing user entitlements.

Only in a pre-production environment with no real purchases may the Staff Advisory tables/functions be dropped entirely.
