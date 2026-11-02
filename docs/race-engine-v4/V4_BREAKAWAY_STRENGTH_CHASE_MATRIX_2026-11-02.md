# V4: matched 3×3 breakaway strength and pursuit pilot — 2026-11-02

## Scope and evidence

Synthetic deterministic research only. Tested 12 170-km hilly fields (18–22 teams) with the existing V4 template-first AI planner and an isolated calibrated V4 bundle. For each seed, AI tactical plans were prepared once and held identical across all nine treatments. Stage profile, distance, weather, team roster identities and engine seed were held fixed within a seed. The same exact modified snapshot was then run in preserved V2 and isolated `combined_energy` V4; SHA-256 input matching was asserted. Production V2 code and official race results were not modified.

The **breakaway-strength treatment** changes only the designated non-pursuit team's breakaway-role / opening-attack-plan riders. Weak: −12 points, medium: no change, strong: +12 points to flat, climbing, endurance, resistance, race IQ, teamwork and overall, with stat bounds 35–99. This is not a 12% strength change or proof that every nominated rider actually joins the opening breakaway.

The **peloton motivation proxy** is explicitly ordered human pursuit, not a direct global AI-motivation coefficient: passive = no chase order; normal = the same three pursuit riders chase in Phase 4; aggressive = those same three riders chase in Phases 2, 3 and 4. Therefore the experiment directly tests **timing and extent of human pursuit**, not independently calibrated AI intent.

All opening-escape metrics are restricted to cases where preserved V2 and calibrated V4 both have strict replay validity and an accepted opening breakaway. Baseline-invalid or unsynchronized runs are excluded, never forced to pass.

## Completed results

All 108 isolated V4 simulations passed strict replay. Of 108 preserved-V2 reference simulations, six were rejected on strict replay (one medium-strength seed and one strong-strength seed repeated across the three chase conditions); hence 102 V2/V4 comparisons are eligible. Each of the nine treatment cells has **seven accepted opening-breakaway cases** on valid matched inputs. The experiment does not use historical race records.

| Breakaway strength | Passive: survivors / 7 | Normal: survivors / 7 | Aggressive: survivors / 7 |
|---|---:|---:|---:|
| Weak | 0 | 0 | 0 |
| Medium | 1 | 1 | 0 |
| Strong | 3 | 3 | 3 |

Median peak observed gap in seconds, among accepted matched opening cases:

| Breakaway strength | Passive | Normal | Aggressive |
|---|---:|---:|---:|
| Weak | 371.3980 | 371.3980 | 357.6441 |
| Medium | 475.5609 | 475.5609 | 461.8070 |
| Strong | 545.8972 | 545.8972 | 526.7805 |

Within the **same seven paired opening seeds**, the weak-to-strong median peak-gap improvement was 179.0137 seconds in each chase condition. Aggressive versus passive pursuit reduced the median peak gap by 13.9118 seconds (weak), 14.2413 seconds (medium) and 15.5577 seconds (strong), again using the same seven valid opening seeds for each comparison.

The passive and normal *maximum* gap medians are identical, because normal chase orders start only in Phase 4, often after the peak gap occurred. Normal chase can still change the catch timing or final group. Do not interpret a shared maximum gap as the orders being ignored.

The opening group median distance ahead in km was:

| Strength | Passive | Normal | Aggressive |
|---|---:|---:|---:|
| Weak | 137.247 | 136.222 | 136.106 |
| Medium | 150.191 | 150.186 | 148.227 |
| Strong | 162.169 | 161.987 | 160.132 |

## Conclusion and next phase

The engine responds directionally to designated attacker strength and to earlier, longer pursuit. Surviving and caught escapes both occur, and physically meaningful long-distance escapes remain possible. On this pilot the impact of chase timing is modest compared with strength treatment; avoid tuning values to fit nine cells.

This is **not realism approval**. Before any production decision, extend the fully paired sample (including other seeds), test flat and mountain profiles and 120/220-km distances, isolate *chase workforce size versus chase duration*, check energy budgets and realistic rider speeds, and compare with trustworthy historical race evidence and source-provenance restrictions. Maintain strict V2 replay exclusions. Keep production V2, official publication and player results unchanged.

Proof: GitHub Actions [V4 isolated read-only physical solver proof, run 41412109433](https://github.com/bracko87/ProPeloton-Manager/actions/runs/41412109433). `V4_BREAKAWAY_STRENGTH_CHASE_MATRIX` contains the machine-readable matched cell outcomes.
