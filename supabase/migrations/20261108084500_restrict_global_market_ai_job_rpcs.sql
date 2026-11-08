-- Close direct player access to global AI market maintenance jobs.
-- All identified database callers are SECURITY DEFINER entrypoints.
-- Retain official cron processing and internal nested function permissions.
-- No change to game data, transfers, or market schedules.

revoke execute on function public.run_hourly_market_ai_jobs() from public, anon, authenticated;
grant execute on function public.run_hourly_market_ai_jobs() to service_role;

revoke execute on function public.run_ai_transfer_seller_job() from public, anon, authenticated;
grant execute on function public.run_ai_transfer_seller_job() to service_role;

revoke execute on function public.run_ai_transfer_buyer_job() from public, anon, authenticated;
grant execute on function public.run_ai_transfer_buyer_job() to service_role;

revoke execute on function public.run_ai_transfer_contract_offer_job() from public, anon, authenticated;
grant execute on function public.run_ai_transfer_contract_offer_job() to service_role;

revoke execute on function public.run_ai_transfer_offer_review_job() from public, anon, authenticated;
grant execute on function public.run_ai_transfer_offer_review_job() to service_role;

revoke execute on function public.refill_ai_transfer_market_to_target_v1() from public, anon, authenticated;
grant execute on function public.refill_ai_transfer_market_to_target_v1() to service_role;

revoke execute on function public.run_daily_market_jobs_detailed() from public, anon, authenticated;
grant execute on function public.run_daily_market_jobs_detailed() to service_role;

revoke execute on function public.run_daily_market_jobs_detailed_core() from public, anon, authenticated;
grant execute on function public.run_daily_market_jobs_detailed_core() to service_role;
