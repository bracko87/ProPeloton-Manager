create or replace function public.sponsor_secondary_full_guaranteed_bounds_v2(p_club_tier text)
returns table(min_amount bigint, max_amount bigint)
language sql
immutable
as $function$
  select
    case lower(coalesce(p_club_tier,''))
      when 'amateur' then 5000::bigint
      when 'continental' then 8000::bigint
      when 'proteam' then 20000::bigint
      when 'worldteam' then 50000::bigint
      else 0::bigint
    end,
    case lower(coalesce(p_club_tier,''))
      when 'amateur' then 12000::bigint
      when 'continental' then 20000::bigint
      when 'proteam' then 45000::bigint
      when 'worldteam' then 120000::bigint
      else 0::bigint
    end;
$function$;

create or replace function public.sponsor_roll_secondary_full_guaranteed(p_club_tier text)
returns bigint
language plpgsql
as $function$
declare
  v_min bigint;
  v_max bigint;
begin
  select b.min_amount,b.max_amount into v_min,v_max
  from public.sponsor_secondary_full_guaranteed_bounds_v2(p_club_tier) b;

  if coalesce(v_max,0)<=0 then
    return 0;
  end if;

  return floor(random() * (v_max - v_min + 1) + v_min)::bigint;
end;
$function$;

create or replace function public.sponsor_secondary_offer_balance_guard_v2()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_tier text;
  v_min bigint;
  v_max bigint;
  v_factor numeric;
  v_coverage integer;
begin
  if new.sponsor_kind <> 'secondary' or new.status <> 'offered' then
    return new;
  end if;

  select c.club_tier::text into v_tier
  from public.clubs c
  where c.id=new.club_id;

  if v_tier is null then
    return new;
  end if;

  select b.min_amount,b.max_amount into v_min,v_max
  from public.sponsor_secondary_full_guaranteed_bounds_v2(v_tier) b;

  if coalesce(v_max,0)<=0 then
    return new;
  end if;

  if new.full_season_guaranteed_amount is null
     or new.full_season_guaranteed_amount < v_min
     or new.full_season_guaranteed_amount > v_max then
    new.full_season_guaranteed_amount := public.sponsor_roll_secondary_full_guaranteed(v_tier);
  end if;

  v_factor := greatest(0.01,least(1.0,coalesce(new.proration_factor,1.0)));
  v_coverage := greatest(1,coalesce(new.coverage_months,12));

  new.full_season_bonus_pool_amount := 0;
  new.guaranteed_amount := round(new.full_season_guaranteed_amount::numeric * v_factor)::bigint;
  new.bonus_pool_amount := 0;
  new.monthly_amount := round(new.guaranteed_amount::numeric / v_coverage)::bigint;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'secondary_economic_model_version','v2_rebalanced_tier_ranges',
    'secondary_full_season_min',v_min,
    'secondary_full_season_max',v_max,
    'secondary_balance_guard_applied_at',now()
  );

  return new;
end;
$function$;

drop trigger if exists trg_sponsor_secondary_offer_balance_guard_v2 on public.club_sponsor_offers;
create trigger trg_sponsor_secondary_offer_balance_guard_v2
before insert or update of sponsor_kind,status,full_season_guaranteed_amount,proration_factor,coverage_months,guaranteed_amount,monthly_amount,bonus_pool_amount,full_season_bonus_pool_amount
on public.club_sponsor_offers
for each row
execute function public.sponsor_secondary_offer_balance_guard_v2();

-- Rebalance only currently unsigned/offered secondary deals. Signed contracts are untouched.
update public.club_sponsor_offers o
set full_season_guaranteed_amount=o.full_season_guaranteed_amount,
    updated_at=now()
where o.season_number=public.get_current_season_number()
  and o.sponsor_kind='secondary'
  and o.status='offered';