-- The RPC checks canonical auth.users.is_anonymous; authenticated role has no direct SELECT on auth.users.
-- Execute as owner, with explicit auth.uid() ownership checks and empty search path.
alter function public.saturn_set_missing_birthday_once_v1(integer,integer,integer)
  security definer;
revoke all on function public.saturn_set_missing_birthday_once_v1(integer,integer,integer) from public,anon,authenticated;
grant execute on function public.saturn_set_missing_birthday_once_v1(integer,integer,integer) to authenticated;