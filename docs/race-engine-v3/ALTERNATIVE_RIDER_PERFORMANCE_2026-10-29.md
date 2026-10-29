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

**Results:** pending measured GitHub Actions. No player UI, production races, Supabase write, official result publication, course profile ingestion or performance tuning completed yet. Passing means a credible *game-model physics component*, not an officially balanced or fully playable V3 race.
