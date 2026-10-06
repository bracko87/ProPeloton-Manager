-- Align ProPeloton Premium and coin-pack prices with Tennis Legacy.
-- Euro pricing is intentionally used only by the Pro Packages / billing system.

update public.premium_plans
set
  price_cents = 329,
  currency = 'EUR',
  coins_per_paid_invoice = 30,
  provider_price_id = 'price_1UNbIWRssJyCX9btfbLTCa4l',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'pricing_version', '2026-10-06',
    'pricing_parity', 'tennis_legacy'
  ),
  updated_at = now()
where code = 'premium_monthly';

update public.coin_packages
set
  price_cents = case code
    when 'coins_70' then 299
    when 'coins_130' then 499
    when 'coins_270' then 999
    when 'coins_390' then 1399
    when 'coins_570' then 1999
    when 'coins_900' then 2999
    else price_cents
  end,
  currency = 'EUR'
where code in (
  'coins_70',
  'coins_130',
  'coins_270',
  'coins_390',
  'coins_570',
  'coins_900'
);
