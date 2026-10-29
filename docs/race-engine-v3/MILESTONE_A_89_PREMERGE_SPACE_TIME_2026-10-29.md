# Race Engine V3 — Step 89: long-range premerge space-time reservation research

**29 October 2026. Research-only opt-in; sporting approval pending.** No production race, player record, game clock, payment or live Supabase operation is modified.

## Hypothesis
Step88 retains authoritative A64 full-body swept/road/energy checks, but all 106/168 five-wide runs still rejected before 180 seconds. Rather than reacting only to occupancy imminent within 1.5–3 seconds, this experiment begins assigning pre-merge slot precedence from achieved x/y/v and existing gate bookings up to 250 meters ahead.

## Algorithm
The new [Step89 planning module](../../scripts/v3/a2Step89PremergeReservationV3.mjs) groups conflicts on the same booked narrow corridor and uses achieved front-to-back x. At identical longitudinal positions the shorter physically required steering move receives priority (including inner-row first); genuinely symmetric ties are held rather than broken by rider name, array order or left/right side. A rider that must cross an occupied envelope holds its lateral request while a bounded requested pace difference attempts to accumulate real longitudinal clearance. This is a **necessary heuristic**, not a collision-free certificate: intervals are provisional, speed requests can be unattainable, and an actual collision can occur much earlier.

Opt-in \`premerge_strict_v1\` and \`premerge_balanced_v1\` compare baseline, joint, protected Step86 gap wave, Step87 pace and three Step89 alternatives. Each A85 receding-horizon trial is original-physics-swept, and the chosen first actual 0.5-second movement is independently reswept by unchanged A64 all-pair bicycle/road/energy physics. Never commit a rejected tick, widen roads, teleport riders, modify historical bookings or replace the live controller.

## Validation gates
The [dedicated Step89 CI](../../.github/workflows/v3-step89-premerge.yml) includes pure geometry tie/mirror/rename/array-parity checks; protected Step86 and Step87 regressions; genuine 8/32 full-race physical parity, sustained >=3-second overtakes and exact 90+90 checkpoint where the first 90 seconds actually complete; all eight 106/168 × staged/double × strict/balanced full-180 requested A64 physical runs; and the React production build. GitHub technical green may include honest failure at first swept-body contact and **must not** be misreported as sporting completion. Check actual CI logs/artifact matrices.

Historical 32r staged 180s Step78 87 sustained passes/356 physical lane changes and Step86 staged 80 passes/411 changes; Step86 double 70 passes/678 changes remain protected comparison targets. **Milestone A 106/168 five-abreast full 180s sporting clearance remains NO-GO until the actual runs meet all gates**: both narrowing layouts, every rider beyond the second reopening, zero committed collisions, road exits, energy violations, near-stop rider ticks, credible passes and weaving, mirror/name neutrality, and exact replay.

No Milestone B gameplay rollout or Milestone C production release is authorized.
