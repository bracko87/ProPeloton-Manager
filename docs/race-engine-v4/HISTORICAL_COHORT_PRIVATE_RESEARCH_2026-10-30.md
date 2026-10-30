# V4 historical private cohort — research only

**This is AI template-planning research on the preserved V2 race physics.** It is not calibrated V4 physics, not a real V4 physical realism rerun, and not a promotion/production acceptance gate.

## Safety and eligibility

- Use one completed intact locked historical race snapshot with authoritative historical team-entry AI/human mapping per stage.
- Require current V2 to reproduce the saved historical finish classification; record archived baseline drift separately.
- Require synchronized current V2 and AI-planned replays for the strictly paired diagnostic subset.
- Historical three-hour lock time is reconstructed solely for offline research; it is not proven.
- Never commit, upload, or publish real input snapshots or rider data. The standalone cohort script has no database calls, never writes official race results, and prints aggregates only.

## Operator-only use on a trusted private machine

1. Run the existing `scripts/v4/privateHistoricalExportV4.mjs` per eligible stage with an independently configured SELECT-only credential, outside GitHub Actions.
2. Create an owner-only JSON manifest outside the repository, listing 1–100 absolute paths to exported private envelopes, e.g.:

   `{ "privateEnvelopePaths": ["/private/stage-one.json", "/private/stage-two.json"] }`

3. From the repository root, bundle `scripts/v4/privateHistoricalCohortCliV4.mjs` using esbuild for node22 ESM and execute it with the absolute private manifest path. Example:

   `npx esbuild scripts/v4/privateHistoricalCohortCliV4.mjs --bundle --platform=node --format=esm --target=node22 --outfile=/tmp/ppm-v4-private-cohort.mjs`
   `node /tmp/ppm-v4-private-cohort.mjs /private/manifest.json`

4. On Unix, the manifest and envelopes must have mode 0600. The runner rejects files within the repository, duplicates, and oversized files; it prints no private paths, rider identifiers, or source error messages.
5. Remove temporary exports, the manifest, and the compiled bundle after reviewing the aggregate evidence.

## Next blocker before real V4 approval

The calibrated combined pursuit/cooperation and combined+energy candidates are currently tested in synthetic, temporary V4-only solver bundles. A future separate, PRIVATE offline runner must apply those exact calibrated transforms to the same complete historical snapshots alongside current V2, compare physically meaningful gap trajectories, catches, finish order and energy, and preserve the strict validator. Until this is done, calibrated historical V4 sample size remains **zero**.

Production V2 engine, real races and Supabase tables remain untouched.
