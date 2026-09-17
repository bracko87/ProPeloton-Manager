-- Reduce the owned-rider image change cost from 5 coins to 2 coins.
-- Keeps the wallet deduction and ledger entry tied to the same constant.

create or replace function public.update_owned_rider_image_with_coins_v1(
  p_rider_id uuid,
  p_image_url text
)
returns table(
  rider_id uuid,
  image_url text,
  coins_charged integer,
  balance_after integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_main_club_id uuid;
  v_wallet_balance integer;
  v_cost constant integer := 2;
  v_normalized_url text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  v_normalized_url := btrim(coalesce(p_image_url, ''));

  if v_normalized_url = ''
     or v_normalized_url !~* '^https?://'
     or length(v_normalized_url) > 2000 then
    raise exception 'A valid http or https image URL is required';
  end if;

  v_main_club_id := public.get_current_main_club_id();

  if v_main_club_id is null then
    raise exception 'No main club found for current user';
  end if;

  if not exists (
    select 1
    from public.club_roster cr
    where cr.rider_id = p_rider_id
      and cr.club_id in (
        select family.club_id
        from public.get_club_family_ids(v_main_club_id) family
      )
  ) then
    raise exception 'You can only change images for riders in your own club';
  end if;

  select uw.balance
  into v_wallet_balance
  from public.user_wallets uw
  where uw.user_id = v_user_id
  for update;

  if v_wallet_balance is null then
    raise exception 'Coin wallet not found';
  end if;

  if v_wallet_balance < v_cost then
    raise exception 'You need 2 coins to change this rider image';
  end if;

  update public.user_wallets
  set balance = balance - v_cost
  where user_id = v_user_id
  returning balance into v_wallet_balance;

  update public.riders
  set image_url = v_normalized_url
  where id = p_rider_id;

  if not found then
    raise exception 'Rider not found';
  end if;

  insert into public.user_coin_ledger (
    user_id,
    delta,
    reason,
    payload_json
  )
  values (
    v_user_id,
    -v_cost,
    'rider_image_change',
    jsonb_build_object(
      'category', 'rider_image_change',
      'rider_id', p_rider_id,
      'image_url', v_normalized_url,
      'coins_charged', v_cost
    )
  );

  return query
  select p_rider_id, v_normalized_url, v_cost, v_wallet_balance;
end;
$function$;
