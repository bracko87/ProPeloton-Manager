# Race Engine V3 - A77, phase 1: multi-gate admission feasibility

**28 October 2026. Offline admission-window screen PASS. Fully coupled five-to-two physical movement NOT YET PROVEN. Sporting milestone A remains NO-GO.**

## What was implemented

- [A77 geometric road-gate discovery](../../scripts/v3/a2MultiGateAdmissionV3.mjs) scans synthetic road width in physical x and identifies each separate narrowing. It does not use a hard-coded single x780m gate; for the currently fixed synthetic profiles it finds x780m and, when present, x1230m.
- The preliminary scheduler allocates mirrored side corridors, followed by a longitudinally separate central rider, to both three-abreast and body-valid five-abreast starting rows. At each narrowing it uses the existing acceleration/braking-bounded `physicalArrivalWindowV3`, the 0.38m/s lateral steering lower bound and inter-gate minimum/maximum travel-time bounds.
- No physical state, rider speed, energy, race clock, paid race, database row, live classification, or gameplay code is modified. This is a new **offline opt-in research module**.
- Each scheduled window is only a **necessary feasibility condition**. A two-slot timetable is NOT a proof of collision-free braking, steering, spatial overlap, complete stage passage, overtaking or realistic racing.

## Initial A77 verification

The new [A77 verification suite](../../scripts/v3/verify-a2-step77-multi-gate-feasibility-v3.mjs) checks 12 combinations: 32/106/168 riders, three-abreast/five-abreast, and double 2.2m versus staged 3.3m then 2.2m pinch. Every case has the expected two discovered road gates and 2 x field-size necessary arrival bookings, with no impossible entry deadline, bicycle body beyond the lane target envelope, duplicate reserved lateral target at one crossing time, mirror or renamed-ID inconsistency.

**Results:** 12/12 necessary-window scenarios; 64/212/336 reservations per route for the 32/106/168 fields. An impossible 5-second deadline remains `UNRESOLVED`, a road-edge-invalid starter remains `INVALID_START_BODY`, and duplicated rider identities throw. Previously accepted road geometries are unchanged. Every A77 report contains `noCollisionGuarantee:true`, `noPhysicalTrajectoryClaim:true`, `officialWrites:0`, and `sportingApproval:'NOT_APPROVED'`.

The original A76 five-abreast research controller must **still correctly return `GATE_ENTRY_NO_WINDOW` at 0s**; A77 has NOT secretly substituted its feasibility bookings into that controller.

[GitHub Actions A77 comprehensive verification](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40766792252) **PASSED**, including the 12-scenario A77 test, the protected 32/106/168 double-strong 180-second independently sustained three-second overtakes and exact 90+90 checkpoint recovery from A76, the prior fail-closed geometric controls, and the React production build. The A76 passing minimums of 55/145/190 remain protected.

## Next engineering gate - A77 phase 2 (not completed)

1. Create a new opt-in physically coupled multi-gate controller which reads A77 slot intent without bypassing authoritative full bicycle sweeps, collision and road-envelope checks. It must react using only current state and static spatial road geometry; never teleport or snap cyclists into reservations.
2. Prove a real five-abreast 32-rider start can evolve safely into two slots for 180s, then extend to 106 and 168 riders. Monitor collisions, near-stops, true 3-second pair passes, x1470m full clearance, exact JSON restart, rider-ID parity and road mirroring.
3. Make the staged 3.3m-to-2.2m profile complete under coupled dynamics. Record honest fail-closed counterexamples with first-contact pairs when they occur. Existing Step76 controller is untouched until a candidate passes comparable tests.
4. Generalize route geometry beyond the synthetic centered straight road, then calibrate real stage grades, curves, rider power/fatigue, team tactics, group splits and complete official race classifications. These are NOT complete.

**Milestone A full sporting realism = NO-GO. Milestone B gameplay integration = NOT STARTED. Milestone C production = NOT STARTED. No live Supabase or race engine switch.**
