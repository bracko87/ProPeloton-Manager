-- AdGem signed POST (v3) offerwall rewards for ProPeloton Manager.
-- A separate ledger from CPX: 15 Coins per $1 of verified publisher payout.
-- No AdGem placement is activated or frontend exposed by this migration.

create table if not exists public.adgem_reward_transactions (
  conversion_id text primary key,
  request_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null,
  campaign_id text,
  goal_id text,
  amount_micro_usd bigint not null check(amount_micro_usd between 0 and 50000000),
  status text not null default 'credited' check(status in ('credited')),
  received_at timestamptz not null default now(),
  constraint adgem_conversion_id_len check(char_length(conversion_id) between 1 and 128)
);
create index if not exists adgem_reward_tx_user_idx
  on public.adgem_reward_transactions(user_id, received_at desc);

create table if not exists public.adgem_reward_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_micro_usd bigint not null default 0 check(total_micro_usd >= 0),
  net_coins_applied bigint not null default 0 check(net_coins_applied >= 0),
  updated_at timestamptz not null default now()
);

alter table public.adgem_reward_transactions enable row level security;
alter table public.adgem_reward_balances enable row level security;
revoke all on public.adgem_reward_transactions from public, anon, authenticated;
revoke all on public.adgem_reward_balances from public, anon, authenticated;
grant select,insert,update on public.adgem_reward_transactions to service_role;
grant select,insert,update on public.adgem_reward_balances to service_role;

create or replace function public.apply_adgem_reward_postback_v1(
  p_conversion_id text,
  p_request_id text,
  p_user_id uuid,
  p_app_id text,
  p_campaign_id text,
  p_goal_id text,
  p_amount_micro_usd bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $func$
declare
  v_previous public.adgem_reward_transactions%rowtype;
  v_rewards public.adgem_reward_balances%rowtype;
  v_total bigint;
  v_coin_total bigint;
  v_grant bigint;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required';
  end if;

  if p_conversion_id is null or p_conversion_id !~ '^[A-Za-z0-9_:.\\-]{1,128}$'
    or p_request_id is null or p_request_id !~ '^[A-Za-z0-9_:.\\-]{1,128}$'
    or p_user_id is null
    or p_app_id is null or p_app_id !~ '^[0-9]{1,20}$'
    or p_amount_micro_usd is null or p_amount_micro_usd <= 0 or p_amount_micro_usd > 50000000
  then
    raise exception 'invalid signed AdGem event';
  end if;

  insert into public.adgem_reward_balances(user_id)
    values(p_user_id) on conflict(user_id) do nothing;
  select * into strict v_rewards from public.adgem_reward_balances
    where user_id=p_user_id for update;

  select * into v_previous from public.adgem_reward_transactions
    where conversion_id=p_conversion_id for update;
  if found then
    if v_previous.user_id<>p_user_id or v_previous.app_id<>p_app_id then
      raise exception 'AdGem conversion owner or app mismatch';
    end if;
    return jsonb_build_object('accepted',true,'result','duplicate','coin_delta',0);
  end if;

  insert into public.adgem_reward_transactions(
    conversion_id,request_id,user_id,app_id,campaign_id,goal_id,amount_micro_usd
  ) values (
    p_conversion_id,p_request_id,p_user_id,p_app_id,
    left(p_campaign_id,128),left(p_goal_id,128),p_amount_micro_usd
  );

  v_total:=v_rewards.total_micro_usd+p_amount_micro_usd;
  v_coin_total:=floor(v_total::numeric*15/1000000)::bigint;
  v_grant:=v_coin_total-v_rewards.net_coins_applied;
  if v_grant < 0 or v_grant > 1000000 then
    raise exception 'AdGem reward amount out of bounds';
  end if;
  if v_grant > 0 then
    perform public.apply_coin_delta(
      p_user_id,
      v_grant::integer,
      'adgem_offer_reward',
      jsonb_build_object(
        'system_key','adgem_'||p_app_id||'_'||p_conversion_id,
        'category','offerwall',
        'provider','adgem',
        'app_id',p_app_id,
        'conversion_id',p_conversion_id,
        'campaign_id',p_campaign_id,
        'goal_id',p_goal_id
      )
    );
  end if;
  update public.adgem_reward_balances
    set total_micro_usd=v_total,
        net_coins_applied=v_coin_total,
        updated_at=now()
    where user_id=p_user_id;

  return jsonb_build_object('accepted',true,'result','credited','coin_delta',v_grant);
end
$func$;

revoke all on function public.apply_adgem_reward_postback_v1(text,text,uuid,text,text,text,bigint)
  from public,anon,authenticated;
grant execute on function public.apply_adgem_reward_postback_v1(text,text,uuid,text,text,text,bigint)
  to service_role;
