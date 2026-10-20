# ProPeloton Manager — agent and release instructions

Effective 2026-10-19. Every coding assistant or developer working on this repository must read and follow these instructions BEFORE writing code.

## 1. Branch rules

- **`staging` = all normal development.** All features, fixes, translations, UI changes, race-engine experiments, tests, and migration proposals must be committed to `staging` (or a feature branch that merges into `staging`), **NOT directly to `main`**.
- **`main` = production release branch.** Keep Netlify production on `main`. Do not change the repository default branch.
- Explicitly set the target ref/branch on GitHub write tools. Do not let a default-branch write silently fall back to `main`.
- Before making changes, fetch the newest `main` and `staging` heads and preserve all existing commits. Do not force-push, reset away work, or overwrite changes from other conversations.
- If an agent cannot write to `staging`, stop and ask for a supported workflow rather than changing `main`.
- A direct `main` code push requires explicit user approval for a specific emergency; a general "fix it" request is not release approval.

## 2. Testing and release process

- Work in **small, independently tested steps**, especially for race-engine fixes. Preserve existing passing checks and investigate baseline failures without hiding them.
- Two preferred **manual** release review windows each day (morning/evening, Europe/Berlin). These are guidance for batching, NOT scheduled automatic merges or unattended deployment. Urgent releases may be approved separately.
- At a release window: inspect the `staging` → `main` diff, validate the affected application functionality and CI tests, obtain explicit release approval, then merge via PR. Stop if required checks fail.
- Do not keep a long-lived staging → main PR open during frequent commits unless repeated PR-triggered CI is intended.
- Existing GitHub Actions workflows **must be preserved**. Especially keep `.github/workflows/race-engine-validation.yml` and its passing regression gates. Public-repository standard GitHub-hosted Actions are generally free, but repeated runs still add noise.
- Follow-up verification happens after the production deploy. A successful commit is NOT proof that the deployed app or race simulation works.
- For local work: `git fetch origin`, `git switch staging` (or `git switch --track origin/staging` once), `git pull --ff-only origin staging`, `npm run build`, `npm run dev`.

## 3. Critical game data and engine protection

- Never alter or purge past race results, general classifications, payouts, historical records, user clubs, or live production data merely to test an engine change.
- Database changes, migrations, and race operations are distinct from Git branch changes. **Staging Git code does not create a staging Supabase database or protect production data automatically.** Use test/simulation data and explicit user-approved production rollouts where needed.
- Do not delete AI teams without explicit approval. Preserve the existing game clock, national teams/associations, National Championships, youth systems, and race-engine behavior except for the narrowly scoped requested fix.
- Race-engine validation has known historical failures tracked in issue #109; do not remove, loosen, or silently mark those tests as passing. Document the baseline and individual corrections.

## 4. Cross-conversation handoff

- This policy applies across all ChatGPT conversations and coding tools. Start every task by reading this file on `staging` and `docs/CONTROLLED_RELEASES.md`.
- Other chats cannot be guaranteed to automatically notice this policy: remind active coding chats to switch to `staging`. `main` remains the default branch.
- Branch instructions are not technical enforcement. Protect `main` using GitHub branch rules requiring reviewed PRs and passing checks if the desired repository plan supports them.

Do not apply these repository-specific rules to unrelated repositories unless those repositories have separately adopted them.
