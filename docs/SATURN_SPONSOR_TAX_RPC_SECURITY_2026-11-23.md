# Project Saturn — SAT-12: Sponsor payment and income tax RPC protection

**Date:** 23 November 2026  
**Production state:** Applied and verified in Supabase. **No Netlify deployment required.**

## Verified risk before the fix

`public.finance_grant_sponsor_contract_payment(uuid,uuid,bigint,jsonb)` was `SECURITY DEFINER` and executable by `anon` and `authenticated`. It accepted a caller-controlled cash amount. Its membership authorization condition began with `if auth.uid() is not null`, so a missing user identity skipped the check entirely. A legitimate club member could also provide a non-contract amount directly. Event-lock uniqueness did not make that safe.

`public.finance_apply_income_tax(uuid,uuid,text,bigint,jsonb)` was likewise a public `SECURITY DEFINER` API with caller-controlled club/source/amount and no caller identity or ownership validation. It could post a tax debit and matching authority credit.

**No attempted payment, debit, exploitation, or user financial mutation was performed during testing.** These findings are based on source/body and grants inspection; the missing guard on the first function and absent guard on the second are directly visible.

## Fix applied

`20261123084428_saturn_restrict_sponsor_payout_and_income_tax_rpc_v1.sql`

- Reject public/anon/authenticated direct function `EXECUTE`; preserve `service_role`.
- Preflight requires the exact function signatures, owner `postgres`, `SECURITY DEFINER`, and absence of unprivileged SQL function callers, triggers, and view dependencies.
- Existing privileged sponsor signing, sponsor-objective settlement, race-prize and finance transfer callers retain their access via their own elevated execution context. Normal user-facing sponsor signing still requires browser verification.
- No function body was replaced and no game data or finance ledger records were changed.

**Live read-only role verification:** both functions deny anonymous and ordinary authenticated execution; both continue to allow service-role execution.

## Validation and remaining gates

- Source regression: `tests/saturnSponsorTaxRpcPermissions.test.mjs`
- Database-grant read check: `supabase/tests/saturn_sponsor_tax_rpc_permissions_readonly.sql`
- Full Saturn workflow runs on pull request; database callers and original sponsor payment workflows should still be checked using actual authorized JWTs.
- Admin/game world clock remain paused; this release did not resume the game.
- Other financial functions (`finance_transfer_club_to_club`, `finance_award_race_prize`, `finance_grant_competition_reward`) include distinct authorization checks and require individual review, not blanket revocation.
- The remaining public advisor findings still require a separate security audit. Track via [issue #299](https://github.com/bracko87/ProPeloton-Manager/issues/299).
