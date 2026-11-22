-- SAT-08: remove the account-existence oracle exposed to unauthenticated callers.
-- Compatibility is intentional: previously published Register.tsx builds still
-- call this RPC before signUp and block signup when it returns an error.
-- Return the exact same value regardless of email address, instead of revoking
-- EXECUTE until old browser builds have expired. Supabase Auth alone handles
-- duplicate-address signup and resend logic.
--
-- No writes to auth.users, profiles, clubs, wallets, or trial periods.
create or replace function public.is_email_registered_v1(p_email text)
returns boolean
language sql stable
security invoker
set search_path = ''
as $function$
  select false;
$function$;

comment on function public.is_email_registered_v1(text)
  is 'Deprecated compatibility-only endpoint: always false; never disclose account existence. Remove after old frontend versions no longer call it.';

revoke all on function public.is_email_registered_v1(text)
  from public, anon, authenticated;
grant execute on function public.is_email_registered_v1(text)
  to anon, authenticated;
