-- SAT-SEC Finance authority review — DRAFT ONLY; NOT production deployed.
-- Audit 20 Nov 2026 showed these SECURITY DEFINER RPCs were executable
-- directly by BOTH anon and authenticated. In particular:
-- finance_grant_new_club_bonus accepts an explicit arbitrary positive amount;
-- finance_credit_to_club uses v_uid NULL to skip its authorization branch,
-- and registered club members can call it to credit arbitrary amounts.
--
-- These functions are INTERNAL finance primitives, not legitimate browser
-- actions. Existing gameplay should invoke reviewed player-facing RPCs
-- that perform authorization and call these primitives under the trusted
-- SECURITY DEFINER owner. Do not deploy without verifying every real caller,
-- including scheduled finance/AI/season reset and normal registrations.
--
-- REVOKE affects direct PostgREST EXECUTE, not trusted SQL owner invocations.
-- Also revoke PUBLIC's implicit function EXECUTE default.
revoke all on function public.finance_grant_new_club_bonus(uuid,bigint)
  from PUBLIC, anon, authenticated;
revoke all on function public.finance_setup_new_club(uuid)
  from PUBLIC, anon, authenticated;
revoke all on function public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)
  from PUBLIC, anon, authenticated;
revoke all on function public.finance_get_or_create_club_account(uuid,text,text)
  from PUBLIC, anon, authenticated;

-- The backend service role must remain authorized for approved internal
-- financial operations that use SQL-callable RPCs. This is not a browser key.
grant execute on function public.finance_grant_new_club_bonus(uuid,bigint)
  to service_role;
grant execute on function public.finance_setup_new_club(uuid)
  to service_role;
grant execute on function public.finance_credit_to_club(uuid,bigint,text,text,text,jsonb)
  to service_role;
grant execute on function public.finance_get_or_create_club_account(uuid,text,text)
  to service_role;
