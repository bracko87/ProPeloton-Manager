-- Authenticated, read-only CPX survey summary for the signed-in player.
-- The CPX transaction table stays service-role-only.
create or replace function public.get_my_cpx_reward_summary_v1()
returns jsonb
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_total_micro bigint := 0;
  v_coins integer := 0;
  v_recent jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Login required' using errcode = '28000';
  end if;
  select coalesce(active_micro_usd, 0), coalesce(net_coins_applied, 0)
    into v_total_micro, v_coins
    from public.cpx_reward_balances
    where user_id = v_user;

  select coalesce(jsonb_agg(jsonb_build_object(
    'trans_id', trans_id,
    'reward_type', reward_type,
    'amount_usd', round(amount_micro_usd::numeric / 1000000, 4),
    'status', status,
    'created_at', received_at
  ) order by received_at desc), '[]'::jsonb)
    into v_recent
    from (
      select trans_id, reward_type, amount_micro_usd, status, received_at
      from public.cpx_reward_transactions
      where user_id = v_user
      order by received_at desc
      limit 8
    ) events;
  return jsonb_build_object(
    'total_coins', v_coins,
    'active_usd', round(v_total_micro::numeric / 1000000, 4),
    'pending_coin_fraction',
      round(mod(v_total_micro::numeric * 15 / 1000000, 1), 4),
    'recent', v_recent
  );
end $$;
revoke all on function public.get_my_cpx_reward_summary_v1()
  from public, anon;
grant execute on function public.get_my_cpx_reward_summary_v1()
  to authenticated, service_role;
