# Controlled main-only development and releases — ProPeloton Manager

**Owner update 2026-10-23:** Push completed, validated, explicitly requested changes to `main`, not to side branches. This supersedes the previous short-lived-branch default. `main` may trigger Netlify production deployment; preserve review, tests and live-data protections.

## Active branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Sole write destination and production branch | Owner-requested scoped changes are validated before direct update; no unreviewed or unsolicited pushes |
| `staging` | Historical backup of the pre-2026-10-20 development history | Retain; do not use for new features, fixes, releases or merges |
| Other branches | Historical / exceptional compatibility only | Do not push new work there. If branch protection forces a PR, merge it to `main` as part of the user-authorized work; do not leave completed changes on a branch |

All commits from the former divergent `staging` and `main` histories were retained in the integration released via PR #155 on 2026-10-20, including mountain realism PR #154 and production SEO changes.

## Work and review

1. Read `AGENTS.md` and fetch the newest `main`. Develop and test in an isolated local worktree or copy without pushing a side branch. Confirm current `main` SHA before updating, use expected file/commit SHAs, and never force-push.
2. Review the exact intended diff and pass the appropriate production build, i18n and relevant regression checks **before** writing `main`. Preserve affected race-engine, replay, localization and SEO gates.
3. Push only the validated, explicitly user-requested change to `main`. Check for concurrent changes and conflicts, verify test logs and real pass/fail counts (not just a nonblocking green workflow). If a branch-protection rule requires a PR, use it only as a technical path to `main` and integrate it before declaring completion.
4. Verify migration status and SQL content against the real Supabase schema if the change depends on it. Avoid destructive operations or unapproved changes to live races. Main-only Git writes are **not** permission to modify live data.
5. Treat every `main` push as potentially deploying to production via Netlify. The owner selected main-only delivery for explicitly requested validated work, but no blanket approval exists for unsolicited deployments or destructive/database changes. Use morning/evening Europe/Berlin release windows for discretionary work; do not defer directly requested, safe, verified changes solely to wait for a release window.
6. After pushing `main`, check GitHub Actions, Netlify deployment status, the live website and affected game behavior where accessible. A successful GitHub build is not proof that Netlify deployed.

Urgent fixes may be expedited but must preserve data safety and appropriate validation. Never force-push, reset, discard historical changes or claim unverified deployment.

## Legacy pull requests and GitHub Actions

- Existing WIP PRs targeting `staging` are not part of the active release stream. Evaluate each independently when the owner requests its contents; do not blindly merge parked work.
- Maintain `.github/workflows/race-engine-validation.yml` and other useful verification workflows. Main-only PR triggers should target `main`.
- The repository is public; standard GitHub-hosted public-repository Actions are normally free, but unnecessary dispatches and redundant staging triggers create noise.
- Exact protection of `main` may require GitHub Settings → Rules → Rulesets / branch protection. If protections prevent direct writes, follow the required checks/PR mechanism and ensure the user-requested result ends up on `main`.

**Supabase reminder:** the 2026-10-20 integration reconciled the live v2 attrition policy before release. Preserve that policy and historical race results; do not reapply older migration text that overwrites newer deployed functions.
