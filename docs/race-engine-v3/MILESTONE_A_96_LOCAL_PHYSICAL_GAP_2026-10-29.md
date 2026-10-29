# Race Engine V3 — Step96 achieved 3–5 rider physical gap creation

**29 October 2026. Research-only opt-in experiment. No live controller changed, no live Supabase write.**

## Physical problem retained from Step95

The [Step95 original physical audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40903327415) completed 4/4 technical GitHub Actions jobs but **0/8** 106/168 true original A64 180-second full races and no 32-rider complete run. Step95 successfully blocked every actual accepted half-second that would allow upstream crawling below 6.5m/s (x<680m), downstream slow motion below 4.5m/s or near-stops. Earlier Step94 scored 70.5s with 2,073 near-stop rider-ticks, proving that merely delaying a collision by stopping riders is not sport.

Step95's drawback is that rejecting bad commands does not **create** safe velocity/steering combinations. The earliest first-field failures often happen before the road taper, with close riders in multiple adjacent start rows and necessary lanes already occupied.

## Step96 physical neighborhood actuator

[Step96 local gap opener](../../scripts/v3/a2Step96LocalGapOpenerV3.mjs) explicitly generates new **simultaneous requested speeds and steering holds** for each physical original 3–5-rider start-row neighborhood. At its next two booked narrowing gates, it differentiates center, inner and outer *desired* speeds in the approach (center 10.25m/s, inner 9.45m/s, outer 7.8m/s) to create real x separation while staying above Step95's 6.5m/s minimum. These are only acceleration targets; original A64 caps acceleration at +0.45m/s² and braking at −0.85m/s². No actual initial or accepted x/y/v is overwritten.

When insufficient **achieved** longitudinal room exists for a rider to leave an occupied adjacent lane, the planner holds the lateral target. A second step builds a 2.5s bounded-acceleration conflict graph among neighboring and *different* starting rows; a leader is requested to accelerate (unless its forward corridor is blocked), the follower's requested pace is capped without stopping it, and the lateral motion is deferred until the projected gap and achieved gap can support it. The process repeats at most four bounded passes and only builds plans. The original A64 whole-field 16-subinterval swept bicycle collision/road/W-prime solver remains the sole acceptance authority.

Three opt-in first-tick policies are *local_lane_shield*, *local_group_pulse*, and *local_gap_wave*, compared with protected Step86 gap wave, Step87 order pace, baseline and joint under the existing Step95 **hard achieved no-crawl gate**; each hypothetical original A64 accepted state must have upstream ≥6.5m/s, downstream ≥4.5m/s and no near-stop (<1m/s) before it can be selected. Both *local_gap_strict_v1* and *local_gap_balanced_v1* enforce this same hard requirement; they differ only in ranking emphasis within the protected 3-tick physical beam. A blocked first tick is reported as a research NO-GO, never a fabricated original collision or success.

## Scientific validation

The pure local planner checks multirow gaps, simultaneous bounded forward assist and rear pace cap requests, actual achieved lateral holds, 3–5 neighborhood size, mirror/renaming/array permutation neutrality, same-x left/right tie and immutable inputs. The [Step96 CI](../../.github/workflows/v3-step96-local-gap.yml) independently checks protected Step78/85/86/87/89/90/91/92/93/94/95; eight 106/168 × staged/double × strict/balanced full 180-second original A64 attempts, reporting both true collision and no-moving/no-safe-request status; original A64 16 full-field mirror/renamed comparisons; independent 8/32 sustained ≥3s overtakes, physical lane changes, actual two-gate passage, exact 90+90 physical+observer replay and React production build.

**Required GO:** all 106/168 five-wide 180 seconds complete *on both* synthetic staged/double constrictions, every rider crosses the second gate, zero committed collision/road/energy errors, zero accepted crawling/near-stops, meaningful sustained overtaking, modest weaving, original physics and parity/replay. Reference protected Step86 32 staged = 80 sustained passes / 411 lane changes and double = 70 / 678, both with full 180s. A green technical fail-closed test does **not** mean sporting GO. Milestone A remains NO-GO pending real results. Milestones B/C not approved; live races, payouts, game clock and player data untouched.
