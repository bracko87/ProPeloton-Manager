# Race Engine V3 — standalone browser race viewer (A3 alternative)

**Local-only playable research viewer, 29 October 2026. Not part of the published player game.**

## Start on your own machine

From the root of the ProPeloton-Manager repository (Node.js 22 or newer):

```bash
node scripts/v3/serve-a3-race-viewer.mjs
```

Open `http://127.0.0.1:4179` in a browser. This is a **separate local HTTP server**, independent of the live application and localhost dev server. It only binds to the loopback IP `127.0.0.1`. To use a different port, set `V3_VIEWER_PORT=4180` before starting it.

The viewer uses the same original [A3 discrete 10Hz engine](../../scripts/v3/a3DiscreteCapacityPelotonV3.mjs) and [athlete profiles](../../scripts/v3/a3RiderPerformanceV3.mjs) that pass the alternate V3 synthetic research tests. It does **not** duplicate or reinvent the cycling solver in browser JavaScript: `a3ViewerReplayV3.mjs` executes it server-side and sends **181 time-sampled, read-only snapshots**. The UI can play/pause, jump +/-5s, scrub any second from 0 to 180, use 1/2/4/8x playback, change 32/106/168 rider count, switch staged or double lane capacity, enable a synthetic two-leader attack, click any visible bicycle, follow a selected rider, and inspect position, speed, energy, group, group gap, attacks and race classification. The elevation plot shows the synthetic course gradient and current progress.

### Strong isolation contract

* No changes to `src/App.tsx`, `src/main.tsx`, `netlify.toml`, Supabase, race crons, team state or official race results.
* This local server has only GET routes for its three local viewer assets and a validated `/api/replay` route; rejects unapproved rider counts, layouts and scenario labels, and does not expose the filesystem.
* HTTP service binds to loopback only, disables CORS exposure, refuses other HTTP methods, disables caching and applies restrictive CSP headers.
* All races use fixed, in-memory synthetic athletes; no login, no actual clubs and no race payouts. This viewer cannot trigger race publication.
* The underlying A3 **atomic lane handoff is a game abstraction**, not A64 continuous swept bicycle physics. Replay movement is one snapshot each simulated second, although the engine itself advances 10 steps per second; fast contact microgeometry is not visualized.
* It is a visualization/prototype rather than a full production-ready cycling match engine: no player tactics input, live race scheduling, persistent results, true power-W-prime calibration, recorded course data or verified customer readiness.

### Acceptance

The dedicated [race viewer CI workflow](../../.github/workflows/v3-alternative-local-race-viewer.yml) tests Node server syntax, HTML/CSS/JS HTTP, invalid API responses, 180-second full engine replay for 32/106/168 rider fields, attack scenario, both logical road gates, deterministic SHA-256 replay hash and full frames, real synthetic elevations, and no server/database mutation. It also preserves all existing alternate original 106/168/individual-ability tests, protected Step86 original A64 32-rider 180s, eight-second grouping and existing React production build.

### Verified CI — 29 October 2026

[GitHub Actions run 40961478142](https://github.com/bracko87/ProPeloton-Manager/actions/runs/40961478142) verifies the actual local HTTP service and full original A3 10Hz field simulations. **The new viewer job passed** with all unit assertions, valid localhost GET-only HTTP responses, correct content types and CSP, invalid selections returning HTTP 400, other routes 404, unsupported methods 405, and full 181-frame original-engine data.

| Approved user scenario | Duration (simulated) | Replay snapshots (1Hz) | Riders passing both gate checkpoints | SHA-256 replay prefix |
| --- | ---: | ---: | ---: | --- |
| 32 staged, natural | 180s | 181 | 32/32 | ba1778de1c70 |
| 106 double, natural | 180s | 181 | 106/106 | 76d947cc3ac7 |
| 168 staged, natural | 180s | 181 | 168/168 | a49fba25bd41 |
| 32 staged, two-rider attack | 180s | 181 | 32/32 | 830fc6b82f6 |

Each of the four includes the original individual research solver's position, energy, speed, grouping and lane assignments. Full fresh deterministic resimulation produced an identical replay hash and data for the reference field. The smaller race payload is approximately 1.18MB and the 168-rider field approximately 5.94MB; generation and transfer are LOCAL-only. Client playback does not calculate new fake x-positions: it switches among validated one-second snapshots.

**CI status at initial verification:** the viewer HTTP/replay test, all original alternate large-field/road-width/athlete tests, and existing React production build passed. The legacy protected A64 Step86 180-second benchmark remained in progress at initial inspection, with the eight-second group test completed. An updated job status can be read directly from the linked Actions run.

A successful HTTP payload test and standalone JS syntax check still do **not** prove a human visual quality review: no remote browser screenshot / click automation is claimed. All production game code, game routes, database, race payouts and official results remain unchanged.

**Test milestone: read-only local browser viewer and replay backend complete. Human UI review remains next.**

**Next milestone after local viewer:** human visual review of group movement and road width realism, then iteratively build a user-directed race tactics inspector (still entirely local/synthetic).
