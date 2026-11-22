-- SAT-09 live follow-up: preserve service-role reads after view masking.
-- PostgreSQL enforces EXECUTE permission for ACL helpers when views invoke them.
-- Direct Data API calls to the private schema remain unavailable.
grant execute on function private.saturn_can_view_club_private_v1(uuid)
  to service_role;
grant execute on function private.saturn_can_view_rider_private_v1(uuid)
  to service_role;
