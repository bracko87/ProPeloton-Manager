-- CPX Research offerwall callbacks for app 37018.
-- Coin rate: 15 Coins per USD, with exact fractional USD accumulation.
-- No existing Stripe purchase / rewarded-video tables are changed.

create table if not exists public.cpx_reward_transactions (
  trans_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id integer not null default 37018 check (app_id = 37018),
  reward_type text not null check (reward_type in ('complete','out','bonus')),
  amount_micro_usd bigint not null check (amount_micro_usd >= 0 and amount_micro_usd <= 50000000),
  status smallint not null check (status in (1,2)),
  received_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cpx_trans_id_length check (char_length(trans_id) between 1 and 128)
);
create index if not exists cpx_reward_transactions_user_idx
  on public.cpx_reward_transactions (user_id, received_at desc);

create table if not exists public.cpx_reward_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_micro_usd bigint not null default 0 check (active_micro_usd >= 0),
  net_coins_applied integer not null default 0 check (net_coins_applied >= 0),
  updated_at timestamptz not null default now()
);

alter table public.cpx_reward_transactions enable row level security;
alter table public.cpx_reward_balances enable row level security;
revoke all on table public.cpx_reward_transactions from public, anon, authenticated;
revoke all on table public.cpx_reward_balances from public, anon, authenticated;
grant select, insert, update, delete on public.cpx_reward_transactions to service_role;
grant select, insert, update, delete on public.cpx_reward_balances to service_role;

create or replace function public.apply_cpx_reward_postback_v1(
  p_trans_id text,
  p_user_id uuid,
  p_status integer,
  p_reward_type text,
  p_amount_micro_usd bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_existing public.cpx_reward_transactions%rowtype;
  v_balance public.cpx_reward_balances%rowtype;
  v_delta_micro bigint := 0;
  v_new_micro bigint;
  v_target_coins integer;
  v_adjustment integer;
  v_wallet_coins integer := 0;
  v_action text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service_role required';
  end if;
  if p_user_id is null or p_trans_id is null
      or char_length(p_trans_id) not between 1 and 128
      or p_trans_id !~ '^[A-Za-z0-9_:.\\-]+$'
      or p_status not in (1, 2)
      or p_reward_type not in ('complete', 'out', 'bonus')
      or p_amount_micro_usd is null
      or p_amount_micro_usd < 0
      or p_amount_micro_usd > 50000000 then
    raise exception 'invalid CPX postback';
  end if;

  -- This row serializes ALL CPX reward updates for one player.
  insert into public.cpx_reward_balances (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  select * into strict v_balance
    from public.cpx_reward_balances
   where user_id = p_user_id for update;

  select * into v_existing from public.cpx_reward_transactions
    where trans_id = p_trans_id for update;

  if found then
    if v_existing.user_id <> p_user_id then
      raise exception 'transaction owner mismatch';
    end if;
    if v_existing.status = p_status then
      return jsonb_build_object('accepted', true, 'result', 'duplicate', 'coin_delta', 0);
    end if;
    -- Cancellation is final; reject a delayed positive retry.
    if v_existing.status = 2 then
      return jsonb_build_object('accepted', true, 'result', 'already_canceled', 'coin_delta', 0);
    end if;
    if p_status <> 2 then
      raise exception 'invalid CPX status transition';
    end if;
    v_delta_micro := -v_existing.amount_micro_usd;
    update public.cpx_reward_transactions
       set status = 2, updated_at = now()
     where trans_id = p_trans_id;
    v_action := 'canceled';
  else
    insert into public.cpx_reward_transactions (
      trans_id, user_id, reward_type, amount_micro_usd, status
    ) values (
      p_trans_id, p_user_id, p_reward_type, p_amount_micro_usd, p_status
    );
    if p_status = 1 then
      v_delta_micro := p_amount_micro_usd;
      v_action := 'credited';
    else
      -- Out-of-order cancellation: record a tombstone. A later status=1
      -- cannot incorrectly grant a canceled transaction.
      v_action := 'canceled_before_credit';
    end if;
  end if;

  v_new_micro := v_balance.active_micro_usd + v_delta_micro;
  if v_new_micro < 0 then
    raise exception 'invalid negative active CPX revenue';
  end if;

  -- Floor only the cumulative entitlement, preserving small rewards
  -- across callbacks. The difference against net grants is a debt
  -- if an earlier credit has been spent before reversal arrives.
  v_target_coins := floor(v_new_micro::numeric * 15 / 1000000)::integer;
  v_adjustment := v_target_coins - v_balance.net_coins_applied;

  if v_adjustment < 0 then
    select coalesce(w.balance, 0) into v_wallet_coins
      from public.user_wallets w where w.user_id = p_user_id;
    if not found then v_wallet_coins := 0; end if;
    v_adjustment := -least(-v_adjustment, v_wallet_coins);
  end if;

  if v_adjustment <> 0 then
    perform public.apply_coin_delta(
      p_user_id,
      v_adjustment,
      case when v_adjustment > 0 then 'cpx_survey_reward'
           else 'cpx_survey_reversal' end,
      jsonb_build_object(
        'system_key', 'cpx_37018_' || p_trans_id || '_' || p_status::text,
        'category', 'offerwall',
        'provider', 'cpx_research',
        'app_id', 37018,
        'transaction_id', p_trans_id,
        'event_status', p_status,
        'reward_type', p_reward_type
      )
    );
  end if;

  update public.cpx_reward_balances
    set active_micro_usd = v_new_micro,
        net_coins_applied = net_coins_applied + v_adjustment,
        updated_at = now()
   where user_id = p_user_id;

  return jsonb_build_object(
    'accepted', true,
    'result', v_action,
    'coin_delta', v_adjustment,
    'owed_coins', greatest(v_balance.net_coins_applied + v_adjustment - v_target_coins, 0)
  );
end
$function$;

revoke all on function public.apply_cpx_reward_postback_v1(text,uuid,integer,text,bigint)
  from public, anon, authenticated;
grant execute on function public.apply_cpx_reward_postback_v1(text,uuid,integer,text,bigint)
  to service_role;
