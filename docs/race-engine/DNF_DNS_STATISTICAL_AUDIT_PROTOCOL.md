# DNF / DNS / OTL statistical validation protocol

Status: **protocol prepared — statistical results NOT YET measured**. Parent issue: #139. This document does not authorize production execution.

## Scope / no-write invariant

Run the existing `runRaceEngine(input)` function against synthetic, deterministic inputs in a test runner. Do not invoke Supabase clients, production RPCs, persistence functions, race operations, or existing historical race data. Seed all randomness. Verify the audit code contains no database imports and that fixtures use synthetic IDs.

## Sampling design

Audit separately by one-day versus stage race; flat, hilly, cobbled, medium mountain, summit; short/medium/long distances; wet/dry; rested/fatigued. Test starter-field targets 48/72/96/120/160 where supported and note any unsupported configuration. Minimum target per stratum: 100 independent seeded races; for each stage-race stratum, 30 seeded full multi-stage events. Increase repetitions if 95% confidence intervals remain wide, recording actual counts and denominators.

For each run record seed, engine version, race/stage ID, race format, profile, km, weather, fatigue bracket, field size, starting list size, initial DNS, stage starters, classification statuses (finished, DNF, DNS, OTL, DSQ), incident causes, number of withdrawn riders and replay-synchronization status. Capture run time and aggregate failure/rejection counts too.

For stage races use distinct stage inputs with carried-forward eligible rider lists, fatigue and withdrawal state based on *supported engine/persistence contract*. If carry-forward is not implemented in the test harness, label stage-race attrition results unverified; do not simulate each stage as an independent one-day race and claim tour attrition.

## Denominators and consistency

- Pre-start DNS rate = DNS / accepted starting-list riders.
- Stage DNF rate = DNF / stage starters.
- OTL rate = OTL / stage starters, listed separately from DNF.
- DSQ rate = DSQ / stage starters, separately.
- Event abandonment = unique riders who started but failed to complete the event / unique event starters.
- Report raw numerator, denominator and rate, not only rounded percentages.
- Validate statuses partition starting list exactly once, counting only recognized official statuses; replay and official results agree.
- Never double-count a rider's later DNS or withdrawal on subsequent tour stages as a new independent abandonment.
- For zero DNF races, report the share of one-day events with zero DNF and the conditional distribution of DNF counts when nonzero.

## Report and acceptance process

Produce CSV/JSON per simulated run plus a human-readable report with per-stratum count, mean, median, 10th/90th percentile, Wilson 95% intervals for proportions, zero-DNF fraction, missing incident reasons, top causes, and examples of extreme outliers. Include seeded reproducibility (same input seed yields same statuses/replay), official classification size, GC and time-limit validity.

Compare against sourced real cycling outcomes after matching race level, format and field size; provide links and sample selection rather than assumed target numbers. Treat weather cancellations and minimum-team cancellations separately from DNS/DNF. If observed rates appear implausible, open a small scoped engine change to `staging`, test with identical seed cohorts, and rerun the complete existing race-engine suite plus summit, World Nations and replay regression checks. Preserve historical results.

## CI / release consideration

The existing `.github/workflows/race-engine-validation.yml` full-suite step uses `continue-on-error: true`, and its push trigger excludes ordinary `staging` pushes. Thus a green workflow alone cannot certify that a future audit passes. Establish a dedicated *blocking* audit job on a PR into `staging` only after the harness is implemented and verified. Avoid enabling recurring workload unnecessarily. Never merge to `main` on audit completion alone; release gate is #140.

## Latest baseline

PR #137 and run 39410912447: **554 passing regression tests / 0 reported failed** in the legacy run; focused checks and production build succeeded. These prove consistency under tested fixtures, **not** season-wide DNF/DNS frequency.
