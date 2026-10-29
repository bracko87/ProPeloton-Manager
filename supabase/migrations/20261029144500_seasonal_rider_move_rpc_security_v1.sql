-- Prevent direct calls to the old security-definer mover from bypassing
-- paid-season entitlement, closure checks, and the controlled movement RPC.
revoke all on function public.move_rider_between_main_and_developing_legacy_v1(uuid,uuid)
  from public,anon,authenticated;
-- The hardened owner-checked public mover delegates as the postgres owner.
grant execute on function public.move_rider_between_main_and_developing(uuid,uuid) to authenticated;
