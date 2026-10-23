# ProPeloton Manager — agent and release instructions

Effective 2026-10-20; **main-only write preference updated by the owner on 2026-10-23**. Every coding assistant must read these instructions and `docs/CONTROLLED_RELEASES.md` before writing code.

## 1. Main-only workflow — owner-directed writes to `main`

- **`main` is the only active long-lived branch and the production source.** It is the repository default branch and is tracked by Netlify.
- **`staging` is a retained historical backup.** Do not delete it, force-push it, merge new work into it, or use it for normal development. The already-integrated history is preserved in `main`.
- **The owner explicitly requests writing completed changes to `main` only for every project.** Do not push updates to a feature/fix/staging branch or leave a task completed only in a draft PR. For normal requested work, validate locally or in an isolated worktree, then write the reviewed, scoped changes directly to `main` after verifying its latest HEAD. Never use force-push.
- **Every write to `main` is a potential production deployment**, as Netlify tracks this branch. The owner's 2026-10-23 main-only instruction authorizes `main` as the target of future explicitly requested, validated changes; it is not permission for unsolicited changes, destructive production operations, or silently deploying untested work. Verify the final diff and tests before each push.
- Do not use alternate branches as the default write destination. If GitHub branch protections technically require a PR, use the minimum necessary review path and **merge the PR into `main` as part of the requested job when checks and authorization permit**. Do not claim task completion while changes remain outside `main`; report blockers transparently.
- Always confirm the current `main` HEAD immediately before writing, use known file blob SHAs / expected commit SHAs, verify no unrelated concurrent changes, and never force-push, reset or discard existing commits. Set explicit `main` refs on GitHub write tools.
- Legacy in-progress PRs targeting `staging` are parked; review and rebase/retarget individually before considering them for `main`. Do not blindly merge WIP changes.

## 2. Testing and production safety

- Develop in a local isolated working copy (without pushing a side branch) and run the production build, relevant localization checks, race-engine regression suites and simulation-only tests **before updating `main`**. For high-risk features, do not sacrifice data safety or testing just to avoid another branch.
- The race-engine workflow includes a historically nonblocking full suite. **Read the test log** and verify the actual pass/fail counts; a green workflow alone is insufficient.
- Prefer the established morning/evening Europe/Berlin review windows for unrequested or discretionary releases, but perform user-requested, explicitly authorized and validated `main` updates in the current task. Never schedule unattended merges or unreviewed deployments.
- Confirm Netlify production configuration and dependencies before pushing. After a `main` update, verify GitHub Actions, Netlify deployment status and live-game functionality when available; a successful Git commit or GitHub build is not proof of production deployment.
- Keep `.github/workflows/race-engine-validation.yml` and existing regression gates; never remove, loosen or hide tests to obtain passing checks.
- For local development: `git fetch origin && git switch main && git pull --ff-only origin main`, edit and test in an isolated local worktree/copy, then run `npm run build` and `npm run dev`. Confirm no unexpected remote changes before pushing `main`.

## 3. Critical game data and Supabase

- Never alter or purge historical race results, general classifications, payouts, player clubs, records or existing user data merely to test or release engine code.
- Git branches and Supabase databases are separate. Migrations need independent review, version/content reconciliation, forward-only changes and explicit authorization. Do not assume a Git merge applies SQL.
- Use isolated/synthetic race simulations for test coverage. Avoid triggering production race operations as a side effect of development.
- Preserve game clock, national teams/associations, National Championships, AI teams, youth systems and established features unless a narrowly scoped change is explicitly approved.
- Work not present on `main` is not shipped. Do not describe a successful feature-branch build or unmerged PR as a completed release.

## 4. Coordination and protection

- This policy supersedes the 2026-10-19 staging-first instructions and the 2026-10-20 feature-PR default for this repository. **Owner preference: validated user-requested changes are integrated into `main` during the task; staging remains a backup only.**
- README/docs do not technically block pushes. An administrator may configure checks on `main`; if existing protections mandate PRs, honor them while ensuring the validated change is integrated into `main` instead of left pending.
- This file governs ProPeloton Manager. The owner has also stated a cross-project preference for `main` as the only pushed destination; apply that preference in other project work while checking each repository's own technical protections and release risks.
