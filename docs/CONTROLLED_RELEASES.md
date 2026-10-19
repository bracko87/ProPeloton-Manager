# Controlled staged releases — ProPeloton Manager

## Purpose

Make game changes visible and testable before they reach the production branch.

| Branch | Purpose | Default action |
|---|---|---|
| `staging` | Development, bug fixes, translation and race-engine validation | Normal commits and local checks |
| `main` | Production code deployed via GitHub / Netlify | Only merge a reviewed, validated release |

The repository's default branch remains `main`. Netlify production must continue tracking `main`.

## Working throughout the day

1. Before each task, fetch/check `main` and `staging` and work on `staging`, not `main`. If a feature branch is used, aim its PR at `staging`.
2. After small changes, validate locally or in an isolated simulation. On a new local checkout, run `git fetch origin && git switch --track origin/staging`. Once on staging, `git pull --ff-only origin staging && npm run build && npm run dev`.
3. Never apply production migrations, trigger live race operations, change live game speed, or rewrite historical results merely because code was pushed to `staging`.
4. Check any running PR and CI triggers. A PR targeting `main` can launch validation with each source push even if plain `staging` pushes do not.

## Review and release

- Prefer two manual release review windows (morning and evening, Europe/Berlin); no timer pushes, no automatic merges.
- When a release is approved, open `staging` → `main` PR and verify the exact file diff.
- Check production build, relevant race-engine and localization tests, and test-scoped simulations where relevant. Existing passing regression gates must stay in place.
- For race-engine changes, inspect the known pre-existing failing tests tracked by GitHub issue #109 and distinguish old failures from new regressions; do not treat a nonblocking suite as entirely passing.
- Merge only after required tests and review succeed and the user authorizes that specific release. Verify the Netlify deployment and game status afterward.
- Keep an urgent release path: expedite review for important fixes, but do not bypass validation or silently push to `main`.

## GitHub Actions and cost

- ProPeloton Manager is currently public. Standard GitHub-hosted Actions usage on public repositories is normally free and is not the main driver of the shared private-repository included-minute budget.
- Preserve the existing CI pipelines, especially `.github/workflows/race-engine-validation.yml`. Do not delete tests to save minutes or create a false green status.
- For exact branch and PR enforcement, a repository administrator must configure **Settings → Rules → Rulesets** or Branch protection for `main`, requiring pull requests and required checks as appropriate for the plan. This has not been enabled merely by creating `staging`.

## Cross-chat reminder

Tell every existing ProPeloton development chat: **read AGENTS.md on staging, push game changes to staging, do not push to main without reviewed release approval**. A repository document cannot automatically transmit instructions to another already-running chat.
