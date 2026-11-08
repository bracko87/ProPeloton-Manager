-- Prevent public or player calls to privileged internal coin and AI transfer routines.
-- Existing legitimate gameplay entrypoints use SECURITY DEFINER wrapper RPCs.
-- Keep routines, signatures, data, logic and trusted service role privileges unchanged.
-- Do NOT call these functions in a smoke test (they mutate real player data).

revoke execute on function public.debit_user_coins_idempotent_v1(uuid,integer,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.debit_user_coins_idempotent_v1(uuid,integer,text,text,jsonb) to service_role;

revoke execute on function public.create_transfer_notification(uuid,text,text,text,uuid,uuid,uuid,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.create_transfer_notification(uuid,text,text,text,uuid,uuid,uuid,uuid,text,jsonb) to service_role;

revoke execute on function public.ai_accept_rider_transfer_offer(uuid) from public, anon, authenticated;
grant execute on function public.ai_accept_rider_transfer_offer(uuid) to service_role;

revoke execute on function public.ai_create_rider_transfer_listing(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.ai_create_rider_transfer_listing(uuid,uuid,integer) to service_role;

revoke execute on function public.ai_reject_rider_transfer_offer(uuid,text) from public, anon, authenticated;
grant execute on function public.ai_reject_rider_transfer_offer(uuid,text) to service_role;

revoke execute on function public.ai_review_club_for_transfer_buys(uuid) from public, anon, authenticated;
grant execute on function public.ai_review_club_for_transfer_buys(uuid) to service_role;

revoke execute on function public.ai_review_club_for_transfer_contract_offers(uuid) from public, anon, authenticated;
grant execute on function public.ai_review_club_for_transfer_contract_offers(uuid) to service_role;

revoke execute on function public.ai_review_club_for_transfer_sales(uuid) from public, anon, authenticated;
grant execute on function public.ai_review_club_for_transfer_sales(uuid) to service_role;

revoke execute on function public.ai_review_open_transfer_offer(uuid,boolean) from public, anon, authenticated;
grant execute on function public.ai_review_open_transfer_offer(uuid,boolean) to service_role;
