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

## Follow-up: repository migration integrity and local-only bootstrap

The repository contained eight historical migration files with invalid or repeated version prefixes. Comparing each name to **production's applied migration history**, all eight filenames were corrected to their exact originally applied 14-digit versions in a single Git commit. The SQL contents were not changed. A new [migration integrity check](../../scripts/saturn-check-migration-chain.mjs) and [tests](../../tests/saturnMigrationChainIntegrity.test.mjs) now verify **533 valid files, 533 unique versions and the expected fresh-install baseline**. The guard deliberately refuses to claim that the repository is compatible with production's earlier migration history.

A read-only metadata reconciliation showed **587 production migration-history entries** on or after the repository baseline date. Only **97 repository migration versions** matched production versions directly; **309 repository files** had matching applied names under *different production version IDs*, and **127** had no matching name or version in that post-baseline slice (including fresh-install baseline files). One repo version collided with a different production migration name. These counts mean that bulk renaming or naïve replay is unsafe.

A **free, isolated GitHub Actions local Supabase CLI/PostgreSQL build** was introduced to verify fresh-install reproducibility without creating another billed Supabase branch. It forcibly removes the Git-tracked production CLI project ref **inside the temporary runner only** and receives no Supabase access token.

The first full local database build successfully progressed through the September baseline and stopped at migration `20260930082645_national_association_activation_and_equipment_sets_v33.sql`: it required **54 active National Team equipment options** but only **18** referenced catalog entries were present. The original game-reference catalog was examined read-only, and the repository's **fresh-install baseline only** was supplemented with the missing **36 equipment models, 14 technical sponsor reference rows and one Iberia market group**. No live data was written and no player records were copied. The [baseline seed regression](../../tests/saturnNationalEquipmentBaselineSeed.test.mjs) checks all 54 expected item keys and their sponsor/group dependencies.

The relevant source-only [schema export scripts](../../scripts/saturn_export_staging_baseline.ps1) and the [Bash equivalent](../../scripts/saturn_export_staging_baseline.sh) now capture a companion **read-only inventory of application-owned triggers on managed Auth tables**, because `pg_dump --schema=public,private,...` excludes those triggers. Production currently has six application Auth triggers, including the critical guest-signup guard. Do **not** auto-restore those launch/security hooks without reviewing staging Auth behavior. [Schema export CI](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45214449665) passed.

**Current limit:** A corrected local database build must pass before choosing an appropriate staging method. A Supabase preview branch still tries replaying the incompatible *production* history; fixing repository filenames alone cannot change that. Do not create another billed branch or modify production migration history. A separate staged project or validated, schema-only restore will need explicit cost approval if it becomes necessary. The real CAPTCHA, expiry and AI replacement acceptance tests have **not** been completed.

## Fresh-install SQL syntax recovery (23 Nov 2026)

The free GitHub Actions local Supabase build progressed beyond the earlier National Team equipment seed blocker after the official catalog data was added. It then exposed SQL syntax errors in historic World Nations migrations that had previously only been applied to a live database through different migration identifiers. **No production migration was replayed or edited in the live database.**

- `20260930185828_nations_stable_groups_capacity_v46.sql` — corrected 3 missing closing `$function$;` terminators.
- `20260930185901_nations_avoid_national_championship_conflicts_v46.sql` — corrected 2 closing terminators.
- A conservative read-only scanner `scripts/saturn-audit-sql-terminators.mjs` now distinguishes normal PostgreSQL dump syntax (closing `$function$` and `;` on separate lines) from truly unterminated function definitions immediately followed by another SQL statement. The initial naïve version reported **2721 false positives** and was replaced. The corrected scanner identified **28 strong candidates**; 2 were the already-addressed second v46 file and the other **27** were corrected across **10 historical migrations** in one syntax-only commit `21c36cb9` (with 4 missing internal PL/pgSQL `END;` terminators also corrected).
- The [current isolated migration verification](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45217581052) passed the static migration integrity + syntax scanner stage. The full local database rebuild remains the independent end-to-end proof and should not be described as passing until that job concludes.

The reconstruction remains a **local disposable database only**. The production migration history predates the repository baseline, so automatic creation of another paid Supabase preview branch is still blocked. No player data or Auth secrets were copied, and the previously failed paid staging branch has already been deleted.
