-- SAT-09 follow-up for the already-applied production migration.
-- A definer view resolves the permission check on its referenced helper under
-- the caller's EXECUTE privileges; removing the grant broke view reads.
-- The helpers expose only JWT-scoped boolean ownership, and the private schema
-- remains without USAGE for anon/authenticated, so direct API calls are blocked.
-- New installations also get these grants directly from 20261122211500.
grant execute on function private.saturn_can_view_club_private_v1(uuid)
  to anon, authenticated;
grant execute on function private.saturn_can_view_rider_private_v1(uuid)
  to anon, authenticated;
