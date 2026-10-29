# Alternative V3 — deterministic athlete performance proof

**2026-10-29. Opt-in research-only profile simulation. Production V2/A64 unchanged.**

## Athlete-level game model

This step adds a separate synthetic athlete module for the already-simplified **discrete lane racing research engine**. Each rider receives a deterministic seeded role and independent climbing, endurance, attack, preferred pace and fatigue parameters. Synthetic, location-bound gradients distinguish first uphill (3.5%) from second climbs (5.5% staged, 7.5% double); no external road elevation files or actual race profiles are represented.

A rider's achievable target pace now varies with: base channel cruise and attributes, grade and climbing ability, immediate *same-current-lane* drafting benefit, accumulated individual energy exhaustion and a controlled leader surge / recovery cycle. The receiving-channel future headway remains binding through wider middle road sections; logical occupancy and 6.5m/s achieved floor are never relaxed. Every update is deterministic at 10Hz with independent per-rider energy. Fatigue is a synthetic game-management energy counter, NOT calibrated mechanical watts, W-prime or wind physics. Different roles should have measurably different uphill speed and energy impact.

The leader-surge variant chooses two synthetic initial leaders on different road channels (r000, r003), requests a 42-second attack, then controlled recovery. Attacks do not modify group labels or use a speed lock; consecutive gaps <=8 seconds define group membership as before.

## Mandatory verification

- Four 106/168 x staged/double **180-second complete** performance scenarios with all riders through both actual logical road gates and no occupancy, speed-floor or early-admission errors.
- Both 106/168 staged scenarios with individual surge, actual attack ticks and maintained 180-second safety.
- Individual unit comparisons for climber versus sprinter on identical 7.5% grade, true same-lane drafting effect, energy savings in draft, uphill expenditure, fatigue reducing achievable target and attack only after the initial five-wide merge.
- Deterministic two-run replay and independent saved 90+90-second checkpoint equivalence with energy and tactics preserved.
- Original pre-profile baseline 106/168 and distinct road layouts, breakaway split/rejoin, original Step86 32-rider 180-second A64, exact eight-second groups and React production build unchanged.

## Verified technical results — 29 October 2026

[GitHub Actions athlete performance run 40958874421](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40958874421) completed the new original athlete simulation test successfully. The original simplified-engine 106/168 baseline and distinct two-road-profile scenario regressions and React build also passed. The protected original A64 Step86 32-rider full 180-second benchmark **also passed**, as did the original user-defined eight-second peloton group regression. **All four jobs in run 40958874421 completed successfully.**

| Original simulated athlete field | Distinct road layout | Discrete 10 Hz accepted duration | Both bottlenecks | Minimum accepted achieved speed | Minimum accepted lane gap | Distinct cross-channel order inversions | Mean remaining rider energy |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| 106 | staged | **180.0 s** | passed | 6.5 m/s | 2.039471 m | 1250 | 18844.12 J |
| 106 | double | **180.0 s** | passed | 6.5 m/s | 2.085042 m | 1362 | 18720.77 J |
| 168 | staged | **180.0 s** | passed | 6.5 m/s | 2.039471 m | 2228 | 19243.54 J |
| 168 | double | **180.0 s** | passed | 6.5 m/s | 2.085042 m | 2864 | 19050.52 J |

All four rider-profile fields crossed both logical gate locations and finished with **no rejected discrete occupancy, minimum-speed or admission events**. Their deterministic SHA-256 traces differ from the original fixed-pace baseline. Actual synthetic climb and drafting effects were observed for all four: up to **166 riders drafting** concurrently in the 168-rider scenarios, nonzero gradient exposures, and substantial individual energy expenditure.

Independent module unit checks confirmed:
- A climber loses less requested uphill speed than a sprinter at the same 7.5% grade and circumstances.
- A valid SAME-LANE, close-distance draft modestly improves target speed and independently reduces energy expenditure; riders in other lanes do not magically draft.
- Larger gradients consume more synthetic energy; lower available energy reduces speed target.
- An attack request only applies after the original five-wide entrance, with no group speed lock or altered admission physics.

Two additional **106- and 168-rider staged layout + individual leader-surge** tests also completed **180.0 seconds** safely, with **420 consecutive attack-active decisecond ticks** each and **two observed final racing groups**. These attacks deliberately produced independent breakaway gaps, but those two groups had **not rejoined by 180s**. The previous separate 24-rider catch-up test remains the validated independent example of a natural group split and reunion.

A performance-enabled 32-rider 90+90-second saved checkpoint resumed to an **exactly identical entire rider, energy, tactics and timing state** as a fresh continuous 180 seconds. All stored fixture objects remained unchanged and no race production records were touched.

### Safety corrections made during this proof

The first new athlete test was rightly rejected because rider-specific pace differences caused an unsafe prospective 5-lane middle handoff. A new *future middle-lane* longitudinal headway reservation, distinct from the already protected second two-lane receiving-channel reservation, prevented that conflict for staged roads. A second too-close same-channel conflict in the steeper double layout was addressed by progressively increasing longitudinal following headway **only after the protected starting merger**, preserving the original gate arrival schedule. The completed final test matrix passed all six scenarios with no accepted clearance under the original 1.85 m logical occupancy minimum.

### Important boundaries / next task

This is **synthetic manager-game cyclist dynamics**, not physically measured work rates, true sprint biomechanics, accurately modeled road grades, calibrated power-W-prime, real wind or drafting CFD. Reaching exactly the synthetic 6.5 m/s minimum on a steep hill passes the current test but can still need sport-specific balance review. Multiple lane changes remain **atomic logical handoffs**, not swept bicycle geometry, and fast lane overtakes count relative position inversions, not observed real-life shoulder-to-shoulder passing.

The next useful development milestone is an **isolated browser race viewer** showing 32/106/168 individual riders, live positions, road profile, breakaway groups, selected rider speed/effort/energy and replay controls. This must be built against synthetic local-only fixtures and gated away from any official or scheduled race execution. It will let a user evaluate sport realism visually; the simulation is *not yet player-ready* and no official race, result, prize, squad, schedule, Supabase database or Netlify-active game controller was changed.

**Technical opt-in athlete research milestone: PASSED. Full game playability and production readiness: NOT YET PROVEN.**
