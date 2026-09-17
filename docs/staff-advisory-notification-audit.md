# Staff Advisory Support — Notification Audit and Classification

## Purpose

This audit defines the boundary between mandatory free notifications and optional paid Staff Advisory reports.

The audit is intentionally conservative: if a message can prevent a player from missing a deadline, losing access, suffering an avoidable contractual/financial consequence, or failing to react to a current game state, it remains Free.

## Current notification surfaces found in the repository

1. Notification Centre
   - Frontend helpers: `src/features/notifications/notificationHelpers.tsx`
   - Template registry: `src/features/notifications/notificationTemplates.tsx`
   - Uses `type_code`, source, action URL, payload metadata and preference groups.

2. Overview attention system
   - `src/pages/dashboard/Overview.tsx`
   - Loads `get_overview_attention_items_v1`.
   - Includes explicit matching and de-duplication against Notification Centre items.
   - Must remain a Free urgency surface.

3. Inbox
   - `src/pages/Inbox.tsx`
   - Uses Inbox RPCs and supports system/admin/user senders.
   - This is the correct delivery surface for Staff Advisory reports because reports are analysis, not urgent warnings.

4. Staff system
   - `src/pages/dashboard/Staff.tsx`
   - Supported advisory mapping must reuse canonical role codes:
     - Head Coach -> `head_coach`
     - Sports Director -> `sport_director`
     - Team Doctor -> `team_doctor`
     - Chief Mechanic -> `mechanic`
     - Scout -> `scout_analyst`
     - U23 Coach -> `u23_head_coach`

## Classification rules

### Class A — Essential Free alert

Always Free. Must not require Premium, staff, advisory access or coins.

Use when the player must know about a current state, deadline, failure, payment/account event or material consequence.

Examples found or referenced by the current code:

- Race application / race-entry deadlines
- Missing race preparation / missing race plan / stage plan
- Rider injury or sickness
- Rider contract expiring
- Staff contract expiring
- Sponsor selection required
- Sponsor objective failure / sponsor deal expired
- Financial emergency / emergency debt / liquidation risk
- Equipment critical condition / repair needed
- Race supplies low stock
- Transfer or contract negotiation deadlines
- Account, Premium, coin purchase, payment or billing failures/successes
- Race/stage cancellation or material schedule changes

Rules:

- May appear in Notification Centre and Overview attention.
- Must not be hidden by advisory state.
- Must not be replaced by an Inbox advisory report.
- Advisory reports may reference the same underlying issue only as added context and must link back to the Free alert/action.

### Class B — Free informational notification

Free informational messages which report completed game events or neutral state changes.

Examples:

- Race result summaries
- Contract signed / transfer completed
- Sponsor deal signed
- Infrastructure upgrade completed
- Training/camp/course completion
- Coin purchase completed
- Referral reward granted

Rules:

- Remain Free.
- May feed optional advisory trend analysis later.
- Paid reports must not simply repeat these messages one-for-one.

### Class C — Optional Staff Advisory report

Coin-paid analysis and convenience only.

May:

- aggregate multiple visible data points;
- identify trends;
- compare recent periods;
- highlight areas worth reviewing;
- make non-binding recommendations;
- summarize recent Free alerts after they have already been independently delivered.

Must never:

- change attributes, energy, freshness, equipment condition/performance, race calculations, tactics or outcomes;
- reveal hidden coefficients, hidden potential, random values or exact future outcomes;
- reveal information a player has not legitimately scouted/unlocked;
- suppress, delay, replace or duplicate a Class A warning;
- create a gameplay advantage beyond analysis of already-visible data.

## Initial role/report mapping

### Head Coach

Paid advisory:
- weekly Training & Readiness Review;
- trend summary of visible workload, readiness/freshness and race-preparation patterns.

Free remains:
- missing preparation;
- current overload/injury warnings where implemented;
- all race deadlines.

### Sports Director

Paid advisory:
- weekly Race Programme Review;
- programme congestion, role-use and visible result trends.

Free remains:
- race entry deadlines;
- preparation deadlines;
- cancellations and schedule changes.

### Team Doctor

Paid advisory:
- event-driven Team Health Review with anti-spam cooldown;
- health trend/context summary based only on visible cases.

Free remains:
- every injury/sickness event;
- availability-impacting health status.

### Chief Mechanic

Paid advisory:
- weekly Equipment & Maintenance Review.

Free remains:
- critical equipment state;
- required repairs;
- low race-supply stock.

### Scout

Paid advisory:
- weekly Scouting & Market Review using already-discovered information.

Free remains:
- negotiation/offer expiries;
- contract deadlines;
- completed scouting notifications that are part of normal staff work.

### U23 Coach

Paid advisory:
- weekly U23 Development Review.

Free remains:
- injuries;
- contracts;
- race deadlines and required preparation.

## Commercial recommendation after first audit pass

Keep the proposed price/duration as a launch candidate, not a final constant:

- 10 coins per staff member
- 30 real-life days
- manual renewal only
- early renewal extends the existing expiry date
- Free and Premium eligible

Recommended report frequency for launch:

- Head Coach: weekly
- Sports Director: weekly
- Team Doctor: event-driven, max one digest per 24 real-life hours unless manually requested
- Chief Mechanic: weekly
- Scout: weekly
- U23 Coach: weekly

Why: daily reports for all six roles would create too much Inbox noise and make the purchase feel like a notification paywall. Weekly digests preserve the value proposition as analysis rather than required operational awareness.

## Producer audit still required against deployed Supabase

The repository contains frontend consumers/templates but not the complete deployed database migration history for notification producers. Before setting `finalPricingConfirmed=true`, verify production/staging for:

- notification type catalog table(s);
- every producer function/trigger/cron/Edge Function;
- `get_overview_attention_items_v1` producer sources;
- Inbox system-message producer RPC;
- payment/account notifications;
- staff and rider contract warnings;
- race preparation/application warnings;
- medical warnings;
- sponsor/finance warnings.

No paid advisory activation should be exposed to users until every existing producer has a Class A/B/C classification.

## Anti-duplication policy

Each advisory report needs a deterministic report key:

`club_id + staff_id + report_code + reporting_period_start`

The database must enforce uniqueness on that key.

Event-driven reports also require a cooldown/digest window so repeated health/equipment events become one analysis report rather than spam.

## Employment rule

Advisory belongs to a specific `club_staff.id`, not merely a role slot.

If that employee leaves:

- normal staff gameplay stops according to existing employment logic;
- advisory access for that staff ID becomes unusable;
- it must not transfer to the replacement;
- historical reports remain readable;
- no refund/transfer occurs automatically;
- a replacement requires a new manual advisory activation.

## Expiration rule

Expiry affects only advisory analysis.

Never render the employee as fired, inactive or unavailable because advisory expired. The card must clearly separate employment state from advisory state.
