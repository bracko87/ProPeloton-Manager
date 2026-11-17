# Comprehensive Season 1 game-progress cleanup — 17 November 2026

## Outcome
**Completed in production**, Supabase project `okuravitxocyevkexfgi`, following the successful core Season 1 reset run `3ad6fcce-c798-4e8f-a416-9c614fc7189e`.

This was a one-time, owner-authorized cleanup of leftover test-world history and game progress. It was **not** a deletion of user identities, owned clubs, wallets, purchased coins, Premium payments or entitlement records.

A new locked/paused maintenance window was opened while the game was in Season 1, 01:26. The 64 originally active cron jobs were suspended. The cleanup reset the clock to **Season 1 January 1, 01:00, at 2× speed**, then restored the jobs and unlocked the game only after comprehensive verification.

## Verified preserved records
- 27 user auth accounts and profiles, 27 wallets, 11 existing player-owned clubs (names, ownership, countries, primary/secondary colors), 3 Premium subscriptions, 4 Premium invoice payment records and the coin transaction ledger.
- A private protected-before snapshot stored these identifiers / entitlement hashes and verified their equality throughout the cleanup.
- One purchased player Youth Academy activation (avoids re-charging an already-unlocked service); its riders, budget, training, reputation, scouting, race results and decisions were reset.
- 23 national association identity records, preserving IDs because the fresh S1 Nations tournament references them; all previous association elections and member/coach progress cleared; season dates rebased.
- 499 active Season 1 competition baseline clubs, their canonical divisions, initial equipment and finances, plus static race courses/waypoint definitions and game catalogs.
- Immutable finance/purchase/audit history is retained as a protected ledger. Its pre-reset display is separated by the restart epoch. Do not truncate immutable finance entries to hide historical test transactions.

## Subsystems cleared / rebuilt
- Youth Academy: all previous academy riders, ledger history, weekly development logs, budgets, results, lineups, invitations and S2 fixtures cleared. AI Academies regenerated fresh: **462** academies and **4,620** new AI youth riders; paid player Academy received 6 new starter riders without additional coin purchase; **1,044** fresh S1 youth fixtures were generated and all old race result/participation rows remain zero.
- National associations and nations: previous coach elections, memberships, voting, association maintenance and national ranking points cleared. 23 identity records retained and rebased to S1 Day1; fresh Nations round fixtures preserved.
- Team policies/philosophy: previous nonrecurring charge state, old customizations and past training/retirement/transition histories cleared. Existing team policies and infrastructure normalized to canonical starter-level defaults, including non-baseline clubs.
- Equipment / infrastructure: old purchased cars/buses/vans, old usage events and old race checkpoints cleared; canonical starter equipment remains (~29,880 items, global).
- Riders and rankings: old retirement decisions, old AI/staff transitions, orphan previous senior/youth rider physical profiles, ranking history and simulations cleared. Three AI first-day free-agent signings were reversed; 56 generated starter free agents restored; three countries lacking riders (BT, BW, CF) received fresh national starter riders.
- Finance: the three AI first-day signing amounts left erroneous mutable cash-account balances (-93,270, -132,736, -102,360); those three *AI-only* mutable balances were reset to zero under maintenance with a private audit row. All immutable finance transactions retained. No player club finance balance/entitlement was modified.
- First-day AI transfer offers and transfer event history cleared (54 offers, 1,154 events), after checking no user buyer or seller; 1,100 *new S1 starting-market listings* retained as initial market state.
- Old in-game notifications, tutorial progress and first-day inactivity events cleared.

## Final checks
- `public.game_world_reset_validate_v2()` returned `ok=true` immediately before release.
- `private.game_world_reset_extended_protected_accounts_current_v1()` returned `true` before and after release, proving original user/club/purchase snapshots matched.
- Full paused restart state verified as S1 Jan 1 01:00, no old youth results, nation ranking points, retirement history, policy-charge history or transfer history.
- **64** original scheduled jobs restored, **7** originally inactive jobs still disabled.
- Maintenance lock removed, game clock resumed at **2×**.
- Post-release live query reverified 27 accounts, 11 owned clubs, 4 Premium invoice-payment records, 463 total youth academies, 4,626 new youth riders, zero youth race results, zero Nations ranking points, zero transfer events, and 29,880 starter-equipment items. Original protected account hashes still matched.

### Audit and scope notes
Private immutable-ish operational audit table `private.game_world_reset_extended_progress_audit_v1` stores before snapshot (`audit_id=1`), controlled AI finance balance reset, and the after-cleanup validator snapshot (`audit_id=4`). The verifier `private.game_world_reset_extended_protected_accounts_current_v1()` checks identity, wallet, Premium and coin ledger hashes. Both were created on production database, with public permissions revoked.

Fresh Season 1 race fixtures, youth fixtures, catalogs, initial equipment, baseline teams, market listings, association identities and protected purchases were intentionally **not erased**: they are required foundations of a playable fresh season, not historical results. The game was reopened only after checks passed. No claim is made that every possible future gameplay path has been exercised.

**Do not add the destructive one-off cleanup as an automatically applied deployment migration.** A repeat would wipe live game progress. This record is a runbook/audit of an owner-approved test-world restart, not a reusable migration.
