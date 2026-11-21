# Project Saturn — 14-day FULL GAME test accounts

Decision 20 November 2026. This replaces the isolated Practice League proposal. **Design and development work only. No public activation.**

## Experience and rules

- Homepage always offers two choices: **Test the Game** and **Register**.
- Test the Game asks for a nickname and requires creating a normal cycling team (team name, country, colors/kit) before gameplay. No email, password, birth date or other personal information is needed.
- Give the test player **14 calendar days (336 hours)** starting at actual team creation, not the first anonymous sign-in.
- Give the same **first 7 days (168 hours) of Premium**, one time. Never restart a Premium entitlement on conversion. Anti-farming controls required.
- Use all regular management systems: real riders, training, staff, equipment, finances, transfers, races and ranking, subject to the time limit and security rules. NO isolated three-rider Practice League should be released.
- Start anonymous test teams in the **lowest eligible official tier**. They participate in real competitions while active.
- Show a one-time modal explaining the account is temporary, a continuously visible **Register / Keep my Team** control throughout the game and a clear expiration banner or modal.
- At expiry, **block all writes and new applications server-side**, but keep account/team/read-only history accessible for conversion. Never delete a team during an active race or rewrite historical results.
- Email/password or Google conversion must link to the **same Auth UUID and official club**, retaining riders, money, staff, equipment, training, competition results, ranking points and Premium trial clock. No second club, wallet, Premium trial or welcome gift.
- After conversion, server tries to assign **the highest eligible free division slot** atomically, with no displacement, no mid-event reassignment and no retroactive race/points changes. If none is available, the team stays in its current tier until a safe vacancy or season boundary.
- Long-expired test teams need separate end-of-season AI takeover / retention rules; no automatic deletion on day 15.

## Backend work needed (NOT DONE)

1. Server-owned account term record linked 1:1 with canonical Supabase Auth UUID and actual club ID. Duration is based on server team-creation timestamp.
2. Anonymous official-club creation with strict ownership, unique user/team creation, lowest eligible tier placement and signup abuse limits. Replace existing deny-all guest club gate only when safe.
3. Authorize active test accounts in *every* gameplay/RLS/RPC: riders, races, sponsors, finance, equipment, staff, rankings, applications, transfers. Stop all write actions on expiration.
4. Premium and coin safeguards in existing ledger and entitlements. Double grant impossible on conversion.
5. UI flow, first-run popup, persistent register CTA, expired read-only experience, same-UUID identity upgrade.
6. Safe highest-eligible vacancy placement with transaction/locking and active race protections.
7. Staging tests with two anonymous identities and official teams: 7-day Premium, 14-day expiry, abuse/retry, race application, competition, equipment, staff, finance, conversion and live-game/season boundaries.

## Important revision

The existing guest practice page, 7-day draft expiry migration and sample-rider simulation on this branch are **superseded prototype code**, not a deliverable. Do not deploy those pieces. Existing production protection against anonymous official clubs and races remains in force until a complete replacement is verified.

Project Helios and the game's existing launch clock are out of scope. SAT-01, SAT-02 and SAT-08 are not complete.


## Verified compatibility issue — AI slot assignment (20 Nov 2026)

The production BEFORE INSERT guest-owned-club trigger currently rejects anonymous team owners. A separate AFTER INSERT trigger `trg_assign_new_real_club_to_ai_slot` invokes `assign_new_club_to_ai_slot(uuid)`, which chooses the **highest-tier** available AI slot first and moves that AI club into its reserve pool. This directly conflicts with the player's required lowest-tier starting place. Simply inserting an amateur team with `world_tier=4` is insufficient: the trigger may change it after insert.

The new fail-closed test-team RPC checks the **actual** tier/division after trigger execution and aborts the entire transaction if it differs from the server-selected lowest eligible amateur division. This is a safety stop, not a completed fix. Before activation, implement a trigger-side test-team exception that swaps only a **matching lowest-tier regional AI slot**, without changing registered-player allocation rules, and test lock order and race/season integrity. Never disable this trigger for all players or move an AI team from a higher division just to place a guest.


## 20 November — ticketed lowest-tier AI slot replacement source

- A private, write-protected transaction ticket links the canonical anonymous user UUID, pre-generated club UUID and approved lowest-tier regional amateur division. The dedicated team creation function inserts the ticket before the official club insert and removes it in the same database transaction.
- The existing guest ownership trigger now allows **only this ticketed INSERT** while BOTH independent rollout gates are verified and enabled. All other anonymous club ownership INSERT/UPDATE requests still fail.
- The existing post-insert team-assignment trigger takes the unchanged original assignment path for regular registered teams. For valid ticketed test clubs it chooses only an active AI club in the exact same lowest amateur tier and geographical division, with no applications or participation in either legacy or v1 race tables.
- Such an AI club is retained in the existing AI reserve pool rather than deleted; the new club remains in the intended lowest tier. If no safe AI club exists or if a later trigger changes the assigned tier/region, the entire test-team transaction rolls back.
- Regional capacity is a *one-for-one swap*, so occupancy remains constant, even when the pre-approved regional capacity is full; capacities are still required and any existing overflow blocks insertion.
- **Production remains fully protected:** no migration applied, both gates OFF, RPC EXECUTE revoked, no guest accounts created. Staging verification of race/finance/season integrity is mandatory before enabling.

