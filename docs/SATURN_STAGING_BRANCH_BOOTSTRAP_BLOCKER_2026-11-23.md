# Project Saturn — isolated staging branch bootstrap failure

**Date:** 23 November 2026 · **Status:** Blocked by historical production migration bootstrap. No player data involved.

## Cost approval and creation

The owner explicitly authorized a temporary Supabase development branch at the provider-quoted **USD 0.01344/hour**. A cost confirmation was obtained for that rate, and the branch `saturn-security-staging-20261123` was created from production parent project `okuravitxocyevkexfgi`. The temporary branch ref was `lypyyvgyfdhxceorwcyj`, ID `22edc645-6ead-487f-855a-d465eb98f57b`, with `with_data=false`.

## What failed

The branch entered `MIGRATIONS_FAILED`. Staging Postgres logs revealed the first replayed historical migration failing with:

> `query string argument of EXECUTE is null` — inline PL/pgSQL migration block at line 47.

Its dynamic patch expects the pre-existing production functions `public.generate_race_prize_awards_v1` and `public.universal_race_stage_finalize_v1`. The fresh branch has no such definitions. In fact, checks found **0 public application tables, no Saturn lifecycle table or club-creation RPC, and 0 successfully replayed migrations**.

Production's Supabase migration history starts **20260820065515** (`phase11b_stage_rewards_each_publication`) and contains **1162 migrations**, whereas the GitHub repository's full baseline begins on **20260929182948** (`baseline_00_extensions_types.sql`). The historical production migration history assumes an existing schema and cannot be replayed from scratch in the isolated branch as-is. This is an ordering/bootstrap problem, not a CAPTCHA or guest-lifecycle failure.

## Verified unaffected

- No production credentials, player data, team rosters, Coins, finances, Premium or race records were copied into staging.
- No production migrations or game-clock/Guest Mode settings were changed.
- No destructive expiry simulations were run.
- The staging-only CAPTCHA negative test script refuses the production project and has passed the regression safety checks, but could **not** run real Auth tests on a working staging game.

## Corrective path

1. Do **not** modify or delete production's existing migration history to make branch creation green.
2. Create a reproducible **schema-only** bootstrap snapshot or consolidate the historical migrations into a verified fresh-install baseline; run it ahead of incremental migrations in a disposable environment, without copying player data.
3. Re-attempt isolated staging only after validating baseline + migration ordering. Any new or separate paid project would require its own approved cost.
4. In that environment, confirm Supabase Auth server CAPTCHA settings/Turnstile test hostnames, then test invalid/missing/replayed tokens and legitimate signup, expired guest transitions (day 7, 14 and 15), AI replacement, and ownership/conversion.
5. Delete the failed hourly-billed branch rather than keep paying for an environment without application tables.

The prior [staging acceptance checklist](./SATURN_STAGING_CAPTCHA_ACCEPTANCE_GATE_2026-11-23.md) remains pending, not passed.
