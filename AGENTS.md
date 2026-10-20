# ProPeloton Manager — agent and release instructions

Effective 2026-10-20. Every coding assistant must read these instructions and `docs/CONTROLLED_RELEASES.md` before writing code.

## 1. Main-only active workflow

- **`main` is the only active long-lived branch and the production source.** It is the repository default branch and is tracked by Netlify.
- **`staging` is a retained historical backup.** Do not delete it, force-push it, merge new work into it, or use it for normal development. The already-integrated history is preserved in `main`.
- Start new work from the latest `main` on short-lived feature/fix branches. Submit reviewed PRs **to `main`**, not `staging`.
- Each merge into `main` is a **potential production deployment**. PR review and explicit release authorization are required before merging; there are no unattended or automatic releases.
- Do not commit/push code directly to `main` except with explicit user authorization for a *specific emergency*. Normal requests do not bypass review.
- Always confirm the current `main` head before writing or merging; use expected SHAs and do not force-push, reset or discard existing commits. Set explicit refs on GitHub write tools.
- Legacy in-progress PRs targeting `staging` are parked; review and rebase/retarget individually before considering them for `main`. Do not blindly merge WIP changes.

## 2. Testing and production safety

- Do small changes on short-lived branches and run production build, relevant localization checks, race-engine regression suites and simulation-only tests before merge.
- The race-engine workflow includes a historically nonblocking full suite. **Read the test log** and verify the actual pass/fail counts; a green workflow alone is insufficient.
- Prefer two **manual** release review windows daily (morning/evening, Europe/Berlin), but urgent approved releases may be expedited. Never schedule automated merges.
- Confirm Netlify production configuration and dependencies before merging. After merge, verify GitHub Actions, Netlify deployment status and live-game functionality; a successful Git commit or GitHub build is not proof of production deployment.
- Keep `.github/workflows/race-engine-validation.yml` and existing regression gates; never remove, loosen or hide tests to obtain passing checks.
- For local development: `git fetch origin && git switch main && git pull --ff-only origin main`, then create a short-lived branch, `npm run build` and `npm run dev`.

## 3. Critical game data and Supabase

- Never alter or purge historical race results, general classifications, payouts, player clubs, records or existing user data merely to test or release engine code.
- Git branches and Supabase databases are separate. Migrations need independent review, version/content reconciliation, forward-only changes and explicit authorization. Do not assume a Git merge applies SQL.
- Use isolated/synthetic race simulations for test coverage. Avoid triggering production race operations as a side effect of development.
- Preserve game clock, national teams/associations, National Championships, AI teams, youth systems and established features unless a narrowly scoped change is explicitly approved.
- Open PRs that have not been merged remain unshipped even if the old backup branch retains them.

## 4. Coordination and protection

- This policy supersedes the 2026-10-19 staging-first instructions for this repository. Inform other active development chats: **new work via feature/fix PR to main; staging is backup only**.
- README/docs do not technically block pushes. An administrator should configure GitHub branch rules requiring PRs and appropriate successful checks on `main` if available.
- Do not apply this repository policy to other games or repositories automatically.
