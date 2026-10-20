# Controlled main-only development and releases — ProPeloton Manager

## Active branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Sole active long-lived development target **and** production branch | Changes through reviewed, tested, user-approved PRs |
| `staging` | Historical backup of the pre-2026-10-20 development history | Retain; do not use for new features, fixes, releases or merges |
| Short-lived `feature/*`, `fix/*`, `release/*` | Isolated work and validation | Branch from current `main`, then PR back to `main`; remove after merge when safe |

All commits from the former divergent `staging` and `main` histories were retained in the integration released via PR #155 on 2026-10-20, including mountain realism PR #154 and production SEO changes.

## Work and review

1. Read `AGENTS.md`, fetch the newest `main`, and work on a short-lived branch based on it. Do not commit directly to `main`.
2. Build/test the intended diff in isolation. Preserve affected race-engine, replay, localization and SEO gates.
3. Open PR to `main`. Check for other changes, conflicts and all required test logs. Ensure known regression tests truly pass, not just the nonblocking workflow step.
4. Verify migration status and SQL content against the real Supabase schema if the change depends on it. Avoid destructive operations and unapproved changes to live races.
5. Treat approval to merge a specific PR into `main` as production release approval: Netlify may auto-build/deploy on every merge. Prefer morning/evening Europe/Berlin release review windows; no unattended merges.
6. After merging, check GitHub Actions, Netlify deployment status, the live website and affected game behavior. A successful GitHub build is not proof that Netlify deployed.

Urgent fixes can use the same review-and-PR path outside a normal window when specifically authorized. Never use force pushes or discard historical changes.

## Legacy pull requests and GitHub Actions

- Existing WIP PRs targeting `staging` are not part of the active release stream. Individually re-evaluate and retarget/rebase onto `main` only after validation. Do not merge them blindly.
- Maintain `.github/workflows/race-engine-validation.yml` and other useful verification workflows. Main-only PR triggers should target `main`.
- The repository is public; standard GitHub-hosted public-repository Actions are normally free, but unnecessary dispatches and redundant staging triggers create noise.
- Exact protection of `main` requires GitHub Settings → Rules → Rulesets / branch protection. Documentation alone is not enforcement.

**Supabase reminder:** the 2026-10-20 integration reconciled the live v2 attrition policy before release. Preserve that policy and historical race results; do not reapply older migration text that overwrites newer deployed functions.
