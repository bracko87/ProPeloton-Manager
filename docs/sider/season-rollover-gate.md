# Sider implementation spec — Season rollover gate

## Goal

Add a soft-maintenance experience for the automatic season transition. Public homepage/login remain available. All `/dashboard/*` gameplay is replaced by a full-screen rollover state only while the backend reports that the game is paused at the target season's January 1 00:00 and the season transition is still armed.

## Placement

- Add `src/components/season/SeasonRolloverGate.tsx`.
- Wrap the existing `MainLayout` return in `src/pages/dashboard/ClubDashboard.tsx` with `SeasonRolloverGate`.
- Do not change individual dashboard pages.
- Do not block public routes such as `/`, `/login`, `/about`, `/support`, etc.

## Backend status contract

Call:

```ts
supabase.rpc('get_season_rollover_status_v1')
```

Expected JSON fields:

```ts
{
  active: boolean
  phase: string | null
  source_season: number | null
  target_season: number | null
  run_id: string | null
  game: {
    season: number
    month: number
    day: number
    hour: number
    minute: number
    paused: boolean
  } | null
  started_at: string | null
  updated_at: string | null
  delayed: boolean
}
```

The UI must not infer rollover state from `game_state.is_paused` alone. Use this RPC as the authoritative source.

## Behavior

- Poll every 20 seconds.
- Also recheck on browser focus and when the tab becomes visible.
- Before midnight, even if S1→S2 is armed, `active` is false and normal dashboard remains available.
- When `active` becomes true, replace the whole dashboard layout with the rollover screen. No sidebar or gameplay navigation should remain visible.
- When a previously active rollover becomes inactive, reload the page once so the player returns into the newly completed season.
- If the status RPC cannot be read, fail closed for dashboard gameplay: show a retry screen and continue retrying automatically.
- Add a manual `Check again` button.
- Add a `Go to homepage` link (`#/`).
- Do not show an ETA.
- If `delayed` is true, show a calm warning that the game remains frozen until validation completes.

## Rollover screen copy/structure

Show:

- eyebrow: `Season rollover`
- title: `Season {{season}} is being prepared`
- explanatory body that club/game data are safe
- current transition phase
- game clock status: `Paused at January 1 · 00:00`
- explanation that gameplay is temporarily locked while promotion/relegation, contracts, sponsors, rewards, rankings, calendar and validation are processed
- automatic-check note
- delayed-state notice when applicable

Use a dark slate full-page background with yellow ProPeloton accent and a visible loading spinner. Keep it responsive/mobile-friendly.

## Phase labels

Map backend phases:

- `starting` → Starting season rollover
- `source_frozen` → Final standings frozen
- `core_validated` → Competition and contracts processed
- `rewards_applied` → Season rewards applied
- `communication_done` → Notifications prepared
- `completed` → Final validation and resume

Unknown/null phase falls back to `starting`.

## Localization

Use `useTranslation('appShell')`.

Register the existing `appShell.json` namespace in `src/i18n/index.ts` for both:

- `en`
- `sr-Latn`

Add all rollover strings under `rollover.*` in both resources. Do not hard-code Serbian text in TSX.

## Do not change

- season transition engine logic
- public homepage/login availability
- existing liquidation/restart behavior
- individual gameplay pages
- game clock cadence
- automatic resume behavior

The gate is an application-level UX lock. The existing transition persistence guard remains the backend protection for protected season-transition state.
