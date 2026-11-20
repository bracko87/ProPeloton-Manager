# Project Helios — Player Experience, Analytics & Platform Quality

**Applies to:** Tennis Legacy: Rise to Glory and ProPeloton Manager.  
**Owner:** Next Quest Studio. **Status:** Active discovery / staged implementation.  
**Goal:** Deliver and verify all 21 improvements from the Helios brief in both browser games, preserving player progress, multiplayer fairness, privacy, and sustainable infrastructure costs.

## Non-negotiable engineering rules
- Keep Supabase/PostgreSQL and the existing in-game Control Centers as the default architecture.
- Guest players use server-issued unique identities. A conversion must link the **same** Supabase identity, player/team ID, wallet and career records rather than copy them into another account; test interrupted conversions and existing emails.
- Guest mode cannot produce duplicate trial entitlements, abuse rankings, drain coins, impersonate players, create unlimited competing teams, or bypass moderation/rate limits. Implement controlled caps and audit trails; test RLS with unauthenticated, guest, member, and administrator roles.
- Preserve existing purchased Premium, coins, paid transaction history, and existing accounts in all migrations. Never reset production data without a separate explicit instruction.
- Keep birthday optional and reward only voluntarily supplied, valid dates. Support old accounts and allow legitimate future updates according to a documented policy.
- All new administrative data is admin-only via server-side authorization, RLS, least privilege and retention limits. Do not expose personal emails or raw identifiers in public analytics.
- No Redis or new database without measured performance need.
- Never promise a feature is launched until tests, migrations, deployment, and authenticated end-to-end checks pass.

## Delivery workstreams and full backlog
Status values: **Audit**, **Design**, **Implement**, **Test**, **Live verified**.

### H1 — Analytics / Control Center (first technical workstream)
- **H09 (High):** Repair and validate page view, session, and unique visitor counters. Compare browser event, database row, dashboard RPC, rendered control-center value, date window/time zone, and refreshed timestamp.
- **H10 (High):** Conversion funnel: landing → registration opened → registration completed → player/team created → returned visit. Use distinct pseudonymous event IDs and deduplication.
- **H11 (High):** Meaningful online counts: authenticated users, active player/team sessions, guest sessions, presence TTL, and "last seen" definition.
- **H12 (Medium):** Gameplay actions: training, tournaments/races, transfers, team/character management; aggregate safely.
- **H13 (Medium):** Economy integrity: transactions, purchased and promotional coins, sponsorship/rewards, anomalies and reconciliation.
- **H14 (Medium):** Searchable admin audit history with stable event IDs, UTC timestamps, source/game/entity, retention and access controls.
**H1 exit criteria:** 7/30-day dashboard values reconcile to SQL counts for each game; manual refresh and visible last-refreshed timestamp; tested with actual browser session; no non-admin access to sensitive data.

### H2 — Registration / onboarding
- **H01 (High):** Play as Guest / Test Player with temporary unique identity and clear guest restrictions.
- **H02 (High):** Convert guest to permanent account while retaining same user identity and progress. Include conflict resolution, retries and recovery.
- **H03 (High):** Google Sign-In for new and existing users, plus secure account linking.
- **H04 (Medium):** Passkeys, device fallback, lost-device recovery, and browser support assessment.
- **H05 (Low):** Apple/other trusted sign-in providers, based on demand.
- **H06 (High):** Optional birthday; zero reward without birthday, no fake placeholder dates.
- **H07 (High):** Fewer mandatory fields, direct path to understand gameplay, concise buttons and explanatory copy.
- **H08 (High):** Guest abuse prevention across economy, multiplayer competitions and Premium trials.
**H2 exit criteria:** Registration, guest, conversion, OAuth, failure/recovery and cross-device E2E checks; no duplicate player/team or wallet, no privilege bypass; optional birthday independently verified in both game DBs.

### H3 — Infrastructure and security
- **H15 (Low):** Review actual PostgreSQL query/index/connection performance.
- **H16 (Low):** Investigate Redis only if proven needed for high-volume cache/presence.
- **H17 (High):** Harden admin authentication, role permissions, production audit logs and secrets handling.
**H3 exit criteria:** Security review and negative-permission tests, no exposed admin RPC and no credential stored in UI/logs.

### H4 — Game quality
- **H18 (Medium):** Targeted UI consistency and visual polish on friction areas.
- **H19 (High):** External playtests in both games with task completion, friction log and feedback.
- **H20 (Medium):** First-session guide showing what to do after registration or entering as guest.
- **H21 (Medium):** Demonstrate the unique mechanics of ProPeloton (and analogous Tennis Legacy features) using real gameplay captures.
**H4 exit criteria:** Repeatable external tasks complete without assistance; high-severity blockers closed; measurable first-session improvement.

## Proposed delivery gates
1. **Baseline & safety:** inventory existing flows; snapshot read-only metrics; lock scope; define event schema and permissions.
2. **Quick wins:** accurate analytics refresh visibility, optional birthday, simplified registration; no premature public rollout.
3. **Guest prototype:** isolated test/staging anonymous sign-in, RLS and progression, account upgrade, abuse controls; no live competitive guests until verified.
4. **OAuth:** Google Sign-In and account-linking tests; passkeys/Apple separately after security review.
5. **Quality & release:** player testing, action monitoring, user experience polish, documentation, deployment and live verification.

## Initial audit — 20 November 2026
- Both projects use Supabase/PostgreSQL and already have daily visitors, sessions, and page-view tables.
- Nov 19 stored data: ProPeloton 26 visitors / 29 sessions / 67 page views; Tennis 4 / 6 / 29.
- Existing platform-metrics cache recently refreshed, but this cache is NOT evidence that the website analytics dashboard refreshes correctly. Source sync last_push_at is null in both projects. H09 remains open.
- Both registration forms require birthday month and day; birthday year is optional. H06 requires client + database updates.
- Both use password-based registration/login. Guest conversion and OAuth linking remain unimplemented, not assumed safe.
- The November 20 audit was read-only. No new Helios user-facing features are marked complete from this document.

## Tracking and acceptance
For each H-number record: game, owner, code/SQL PR, migrations, test evidence, live deployment, fallback/rollback, release status. One workstream can ship to one game before the other but never count as complete for **both** until verified in both.
