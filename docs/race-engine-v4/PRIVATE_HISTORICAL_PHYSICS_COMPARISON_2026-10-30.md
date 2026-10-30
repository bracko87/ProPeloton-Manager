# V4 historical physics — private offline identical-input comparison

This runner executes three actual physical race calculations per eligible historical stage: **preserved current V2**, **V4 combined chase/cooperation calibration**, and **V4 combined plus bounded pace-dependent energy**. Unlike the previous template-planning comparator, it does not change AI commands. All three variants use exactly the same saved locked race input. Transformations are exactly the same as in `phase3SensitivityV4.mjs`, imported from the shared V4 research transform.

The original `runRaceEngine.ts` source is loaded and transformed only inside an isolated temporary esbuild bundle. The original V2 source, worker, race results, payouts, clocks, migrations and Supabase database remain unchanged.

## Local use — private trusted machine only

1. Privately export completed intact stages with `scripts/v4/privateHistoricalExportV4.mjs` using a locally configured read-authorized key, never in CI or chat.
2. Place the output files outside the repository. Create an owner-only JSON file containing an array `privateEnvelopePaths` of their absolute paths. Use mode 0600 on Unix.
3. Run `node scripts/v4/privateHistoricalPhysicsV4.mjs /absolute/private/cohort-manifest.json` from the repository root after `npm ci`.
4. Review the aggregate `V4_PRIVATE_HISTORICAL_PHYSICS_REPORT`. Private paths, rider names, stage IDs, rankings, tactical inputs and individual files are not printed; temporary compiled bundles are deleted afterwards.

The runner rejects incomplete or unlocked original input, missing authoritative AI/human team mapping, historical output mismatches, unsynchronized replay, ambiguous or unsupported V2 experimental lanes, changed source hashes and V4 strict replay failures. The aggregate separates baseline drift from calibrated failures and provides terrain-specific finish classification, winner, gap and energy comparisons.

**Important:** the historical three-hour plan lock time cannot be verified retrospectively. Do not claim live V4 production readiness from this diagnostic alone; require multiple representative historical races, reasonable racing outcomes, no validator failures and owner review.

The public GitHub workflow uses only synthetic inputs. Never place real snapshots in the public repository, issue, CI environment or build artifacts.
