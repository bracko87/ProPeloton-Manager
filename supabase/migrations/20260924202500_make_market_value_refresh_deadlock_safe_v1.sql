begin;

alter table public.riders
  add column if not exists market_value_refreshed_game_month text;

create index if not exists riders_market_value_refresh_month_idx
  on public.riders(market_value_refreshed_game_month,id);

create or replace function public.refresh_market_values_if_new_game_month()
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_game_date date;
  v_month_key text;
  v_updated_count integer:=0;
  v_remaining integer:=0;
begin
  v_game_date:=public.get_current_game_date_date();

  if v_game_date is null then
    return jsonb_build_object('ok',false,'reason','game_date_missing');
  end if;

  v_month_key:=to_char(v_game_date,'YYYY-MM');

  if not pg_try_advisory_xact_lock(hashtext('market_value_monthly_refresh')) then
    return jsonb_build_object('ok',true,'busy',true,'game_month',v_month_key);
  end if;

  with batch as materialized (
    select r.id
    from public.riders r
    where coalesce(r.market_value_refreshed_game_month,'')<>v_month_key
    order by r.id
    for update skip locked
    limit 1500
  ),
  updated as (
    update public.riders r
    set market_value=public.calculate_rider_market_value(r.id),
        market_value_refreshed_game_month=v_month_key
    from batch b
    where r.id=b.id
    returning r.id
  )
  select count(*) into v_updated_count from updated;

  select count(*) into v_remaining
  from public.riders r
  where coalesce(r.market_value_refreshed_game_month,'')<>v_month_key;

  if v_remaining=0 then
    insert into public.game_system_state(key,value_text,updated_at)
    values('market_value_last_refresh_game_month',v_month_key,now())
    on conflict(key) do update
    set value_text=excluded.value_text,
        updated_at=excluded.updated_at;
  end if;

  return jsonb_build_object(
    'ok',true,
    'game_month',v_month_key,
    'updated_count',v_updated_count,
    'remaining_count',v_remaining,
    'complete',v_remaining=0
  );
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname='refresh-market-values-if-new-game-month'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'refresh-market-values-if-new-game-month',
    '*/5 * * * *',
    'select public.refresh_market_values_if_new_game_month();'
  );
end
$$;

commit;
