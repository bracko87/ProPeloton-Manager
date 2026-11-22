# Project Saturn — privileged views: privacy audit and safe remediation gate

**Date:** 22 November 2026  
**Game:** ProPeloton Manager; Supabase production project `okuravitxocyevkexfgi`  
**Scope:** PostgreSQL views exposed through PostgREST to `anon` and `authenticated`.  
**State:** **Confirmed exposure / not yet remediated.** All checks below were read-only; **do not apply an untested blanket REVOKE or `security_invoker` alteration in production**.

## 1. Reproducible evidence (counts only, no account or rider values)

See [the role-scoped read-only audit SQL](../supabase/tests/saturn_sensitive_view_privilege_audit_readonly.sql). Execute each block in a read-only transaction, selecting the effective Postgres role with `SET LOCAL ROLE`. This is *not* impersonation of a player's actual JWT; separate real-account tests are still required.

| Exposed field or dataset | `anon` no JWT | `authenticated` no JWT | Direct protected base-table read without a JWT |
|---|---:|---:|---:|
| `club_profile_popup_view.club_cash_balance` non-null | 532 | 532 | `club_finance_summary`: 0 rows |
| `club_profile_popup_view.weekly_income` non-null | 501 | Not separately counted | Base RLS membership-only |
| `rider_statistics_page_international_v1.sprint` non-null | 14,856 | 14,856 | `riders`: 0 rows |
| `rider_statistics_page_view.potential` non-null | 14,856 | Not separately counted | `riders`: 0 rows |
| `rider_statistics_view.salary` non-null | 7,450 | Not separately counted | `riders`: 0 rows |
| `v_rider_modal_skill_ui.current_value` non-null | 133,704 | 133,704 | `riders`: 0 rows |
| `v_rider_skill_card_deltas.current_value` non-null | 133,704 | Not separately counted | `riders`: 0 rows |
| `v_rider_latest_weekly_visible_deltas_ui` rows | 0 at this snapshot | Not separately counted | Historical dataset may still populate |
| `race_participant_riders_v1` rows | 0 at this snapshot | Not separately counted | **Potential future** raw-overall bypass needs review |

**Root cause:** These publicly granted views use the default owner-based RLS context (`security_invoker=false` or no `security_invoker=true` option), while `riders`, `profiles`, `clubs`, `club_finance_summary`, etc. have owner/member-restricted RLS SELECT policies. Therefore direct base-table RLS is bypassed by the view owner. Supabase's anonymous Auth **users use the `authenticated` SQL role**, so `REVOKE ... FROM anon` alone is insufficient.

The data is **not just innocuous standings metadata**: it includes live exact rider attributes/potential, salaries, fatigue, development changes, private club cash, weekly income, expenses, wages, sponsor amounts and possibly user-entered first/last names. Exact figures may defeat the game's scouting/progression mechanics.

## 2. Existing application dependencies

- `src/pages/dashboard/Statistics.tsx`: `rider_statistics_page_international_v1` for the public cross-club rankings/statistics list.
- `src/pages/dashboard/riders/RiderProfilePublicPage.tsx`: `select('*')` from that international rider view and maps exact attributes into the profile modal. Rendering must be updated to preserve rank/identity while not exposing exact rival data.
- `src/features/squad/components/ExternalRiderProfilePage.tsx`: separate secure scouting-oriented RPC flow for external riders; retain its authorized ranges and reports, and do not grant exact abilities merely because a statistics view exists.
- `src/pages/dashboard/TeamProfilePage.tsx`: `select('*')` from `club_profile_popup_view`; public roster, logo, team identity and competition data still need to load when private finance fields are masked.
- `public.v_rider_latest_weekly_change_ui` is a dependency of `v_rider_latest_weekly_visible_deltas_ui`; alter the pair together.
- `club_profile_roster_view.birth_date`: evaluate whether full simulated date of birth is appropriate for public display, or whether age is sufficient.

**Do not simply set `security_invoker=true` on every statistics/team view.** Owner-only base RLS would hide competitors' *public results* and break statistics, rankings, squad comparisons, and public profiles. Do not publish all exact skills as a shortcut either.

## 3. Remediation design — coordinated application and backend release

1. **Define an explicit public projection.** Public club IDs/names/colors/crest/tier/ranking, public rider display name/team/country/role, and completed competition results remain available to legitimate logged-in users. Restrict exact attributes, overall/potential, fatigue, salary, private finance, detailed training deltas, and user-entered personal names unless explicitly approved. No assumption that all currently displayed information is safe.
2. **Protect exact values at the database layer.** Owner/membership-scoped secure view or RPC uses canonical `auth.uid()` and server-owned club membership/ownership. For authorized scouting use the existing precision/range-report API rather than arbitrary `SELECT` on a private view. Apply appropriate base-table RLS and audited `security_invoker=true` semantics for owner-only endpoints. Handle anonymous Auth users explicitly.
3. **Migrate frontend readers together.** Replace broad `.select('*')` on exposed views with explicit, safe public fields. Rider/club pages must tolerate masked fields; statistics must still show legitimate public competition results and full rankings. Owner team UI must retain exact finances/riders.
4. **Cut over atomically.** In an isolated staging database (after cost approval), apply the new projection, test with distinct real JWTs, build, perform browser tests, and then coordinate deployment and privilege changes. Do **not** revoke current view access while the old browser bundle still depends on it. Plan a rollback and account for cached old clients.
5. **Review all other privileged views and RPCs.** The Security Advisor reports more issues than these confirmed view exposures. Prioritize monetary mutation RPCs and personal-data outputs; a warning alone does not prove exploitability. Do not mass revoke existing functions.

## 4. Mandatory acceptance matrix

| Identity | Public rankings + club/rider identity | Rival exact rider skills + contract/salary | Rival private finances | Own exact data |
|---|---|---|---|---|
| Plain `anon` with no session | Only intentionally public material | **Denied/masked** | **Denied/masked** | N/A |
| Anonymous Auth guest | Public material allowed by the guest policy | **Denied/masked** | **Denied/masked** | Own guest-team data only |
| Unrelated verified manager | Public material | **Denied/masked** unless report explicitly permits precision | **Denied/masked** | Own team only |
| Owner/authorized club member | Public material | Own club exact | Own club exact | **Available** |
| Authorized scouting-report owner | Public material | Exact **only if authorized** by report precision and lifecycle | **Denied/masked** | Own club exact |
| Service role/admin job | Maintains existing process access | Controlled server access | Controlled server access | Process-specific |

Also validate: multi-tab, guest-to-permanent conversion preserving same UUID; expired guest cannot mutate/read another team's private data; race replay and national results; AI schedules; performance under 15K riders; public team roster and promotion; Netlify cached bundles; 8 language UI.

## 5. Release gate and ownership

- **Current production:** exposures **confirmed**; no permission changes were made during this audit. Prior email-lookup privacy migration is a separate completed fix.
- **This PR:** documentation, non-mutating SQL audit, and source regression checks only. Safe to merge; **not a security patch and does not close the incident**.
- **Next implementation:** create staged security-invoker owner endpoints and sanitized public endpoints, update consumers, verify JWT isolation, then cut over. Staging cannot be assumed free or available; the prior Saturn staging environment required explicit cost authorization.
- Track follow-up in [security issue #299](https://github.com/bracko87/ProPeloton-Manager/issues/299). **Keep it open** until protected database behavior is confirmed under true anonymous and unrelated authenticated sessions.

Useful references: [Supabase View Security](https://supabase.com/docs/guides/database/views), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
