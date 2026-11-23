# Project Saturn — Auth abuse and translation release checkpoint

**Date:** 23 November 2026 · **Scope:** ProPeloton Manager only.

## Production safety status

- Public Guest Mode remains enabled, Google/email registration remains available, and the game clock is paused.
- The existing Cloudflare Turnstile widget obtains a token before anonymous signup and passes it to Supabase Auth `signInAnonymously({ options: { captchaToken } })`. The token is not used as game RPC authorization or exposed as a secret in the browser.
- The UI-level CAPTCHA is **not** a server-side anti-abuse proof. Only Supabase Auth enforcing CAPTCHA at `/auth/v1/signup` can stop scripted calls bypassing the React page. The available database tools cannot read the Supabase Auth CAPTCHA provider/secret settings. **Do not claim server-side CAPTCHA is verified.**
- Official Supabase guide: https://supabase.com/docs/guides/auth/auth-captcha
- Production Auth logs were inspected in aggregate only, without extracting IPs, emails, token values or individual account IDs. The last-24h logs did **not** establish a successful missing-token/replayed-token rejection. No anonymous signup requests were generated for this inspection.
- Current day-15 retirement cron is enabled every 15 minutes. No live guest was expired or deleted for testing. The 14-day/7-day invariants and Coin/club-owner relationships passed in the previous audit.

## Language audit root cause — observed CI

The `Full Spanish completion audit` runs a **human quality** gate and a later **semantic schema** gate. These are distinct checks:

- Before this increment, the human-quality gate flagged English race-jersey paragraphs and the inconsistent translation `planes de etapa` for the protected in-game feature `Stage Plans`.
- Focused edits were made in `es/manual.json`, `es/manualCore.json`, `es/notifications.json`, `es/premiumCenter.json`, `es/racePreparation.json`, and `es/equipment.json`. All existing named placeholders (`{{...}}`) were preserved.
- After the edits, the [Spanish audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45202960835) reports **0 human-quality blockers**. The **later semantic audit still fails with 283 blockers**; most are existing unchanged English manual sections, protected terminology that was previously translated, or a locale key-order mismatch. Do not mark Spanish complete.
- German `nations.json` had two informal World Nations messages corrected to the established formal `Sie/Ihr` style. The [German audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45202314406) still reports many additional informal strings and notification-key structure mismatches. It remains blocked. In the German `notifications.json`, dozens of additional translated legacy notification labels are present but absent from the English schema. **Do not bulk-delete those translations to force the audit green**; reconcile the catalog and runtime usages first.
- The [eight-language resource audit](https://github.com/bracko87/ProPeloton-Manager/actions/runs/45202960721) still reports **930 missing keys** across locales and zero placeholder mismatches in the affected run. This is broader than the focused Spanish text repairs.

## Next acceptance tasks

1. **External operator check:** Supabase Dashboard → Authentication → Bot and Abuse Protection: verify Cloudflare Turnstile enforcement is enabled, the correct secret key is configured, and the production widget hostname is covered. Confirm the anonymous Auth IP rate-limit setting. Never paste the Turnstile secret into a client-side environment variable or chat.
2. **Isolated test project only:** use real non-admin JWTs to prove anonymous signup without CAPTCHA, invalid/replayed CAPTCHA, concurrent guest club creation, cross-account reads/writes, and trial/Coin farming are rejected. Verify existing Google/email sign-in still works.
3. **Isolated expiry test project only:** exercise day 7, day 14 and day 15, AI reserve replacement, full rollback on failure, finished race history preservation, and converted club exclusion. This cannot be safely proven by merely inspecting the empty production retirement queue.
4. **Localization backlog:** continue manual translation and semantic audits, preserving protected game terminology and existing notification identifiers. Review German notification key supersets against live app usage before changing the schema; translate remaining Spanish manual chapters in sections.
5. Re-run CI, build and browser checks after changes. Do not conflate a narrow 0-human-defect report with a passed full eight-language release gate.

**No deployment, game-clock change, Auth secret change, trial manipulation, guest-mode shutdown, or production destruction was performed in this increment.**
