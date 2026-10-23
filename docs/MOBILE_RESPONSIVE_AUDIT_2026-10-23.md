# ProPeloton Manager — mobile responsive audit record

**Started:** 2026-10-23  
**Scope source:** `src/App.tsx` on `main`, including public, authenticated, admin-only, redirect and fallback route declarations.  
**Tracking status:** **IN PROGRESS — NOT AN ALL-ROUTES PASS.** A code fix is not a device/browser verification. Do not close the ticket until the remaining routes and nested UI states have actually been tested.  
**Route inventory:** 84 route declarations (some are aliases, the dashboard index, or admin-only). Inspect the current production route tree again before final sign-off.

## Required verification matrix

- Phone widths: **320, 360, 375, 390, 414 and 430 px** (portrait).
- Landscape: Race Replay, dense result views, and any screens with touch charts/tables.
- Browser coverage: Android Chrome and iPhone Safari (real-device verification where possible).
- Languages: English, German and Serbian; check long labels and validation feedback.
- For *each reachable page and every tab/subtab*: no document-wide horizontal overflow, touch target sizing, modal and form keyboard behavior, charts and tables, loading/empty/error states and full critical-action completion.
- Treat local table scrolling separately from page-wide scrolling. Check navigation from actual sidebar and linked in-app flows, not only manually typed URLs.
- Non-player admin and redirect routes are tracked below so they cannot be silently overlooked; the player's full gameplay audit does not require using admin-only controls.

## Audit record (pending items are explicitly not verified)

| Page / route | Scope | Mobile status | Issue found | Fix applied | Final verification |
|---|---|---|---|---|---|
| `/` | Public / account | Code changed; visual QA pending | Excessive spacing in mobile header; footer Game/Legal links stacked | Header compacted; footer links in two columns with divider (PR pending review) | Pending viewport/device test |
| `/login` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/register` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/forgot-password` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/reset-password` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/referral/:code` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/about` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/how-to-play` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/privacy-policy` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/terms` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/contact` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/support` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/create-club` | Public / account | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard (index)` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/overview` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/manual` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/squad` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/developing-team` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/youth-academy` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/youth-academy/races/:raceId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/youth-academy/teams/:academyId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/youth-academy/riders/:riderId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/staff` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/calendar` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/hidden-races` | Redirect / alias | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/races/:raceId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/race-preparation` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/team-schedule` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/team-ranking` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-ranking` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/squad` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/team-package` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/world-nations` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/world-nations/events/:eventId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/elections` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/team-chat` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-association/history` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/world-nations` | Redirect / alias | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/nations-competition` | Redirect / alias | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-championships/:editionId/final` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/national-championships/:editionId/qualification/:heatNumber` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/teams/:clubId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/club-identity` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/season-reset-preview` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/analytics` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/system-health` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/race-operations` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/nations-operations` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/migration-process` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/bug-reports` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/player-reviews` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/admin/contact-messages` | Admin-only | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/training` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/training/current-camp` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/training/current-camp/:campId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/equipment` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/infrastructure` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/finance` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/transfers` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/notifications` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/scouting` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/transfers/negotiations/:negotiationId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/transfers/free-agent-negotiations/new` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/transfers/free-agent-negotiations/:negotiationId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/statistics` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/statistics/club-history` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/riders/:riderId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/my-riders/:riderId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/external-riders/:riderId` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/compare-riders` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/inbox` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/my-profile` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/customize-team` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/forum` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/preferences` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/help` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/contact-us` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/premium-center` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/pro` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/pro-packages` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/invite-friends` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
| `/dashboard/*` | Dashboard / authenticated | Not tested | Not yet assessed | — | Pending viewport/device test |
## Nested UI / gameplay workflows (not separate router paths)

The route inventory alone is insufficient. In each applicable section, enumerate all tabs/subtabs, menus, dialogs, filter/search/sort states, pagination, tables, charts, and actions. Specifically include Transfers / Free Agents / negotiations, Staff Market / advisory / management, Equipment / inventory / marketplace, Finance, Statistics, Calendar / race results & classifications (GC/points/KOM/team and DNF/DNS/OTL), Race Replay touch controls, Sponsors and Technical Sponsors, training camps, Premium/Coins, Help, and account settings.

**Do not modify** race results, race-engine calculations, database records, auth guards, or registration availability in a mobile styling pass.

## Initial mobile issues

1. **Homepage header:** Screenshot shows large whitespace between identity/logo and Sign In / Start Playing. Fix reduces the logo on phone widths and sets a compact logo row followed immediately by a two-button row, preserving disabled registration.
2. **Homepage footer:** Screenshot shows Game and Legal vertically stacked. Fix puts them side by side on narrow widths with an explicit vertical divider and 44px-height link touch areas.
3. **Outstanding:** Actual visual checks on 320–430px Android Chrome and iPhone Safari, along with authenticated routes and all nested gameplay states. Do not mark any of these as passed until exercised.

## Final sign-off procedure

Update every row with **Pass / Fail / Blocked**, specific issue details, actual fix (commit/PR), and verified device/viewport/browser result. For dynamic paths, test realistic IDs from safe test data. A confirmed **PASS** requires the full workflow, not merely that the route renders. Re-check the latest `App.tsx` route list before declaring full coverage.
