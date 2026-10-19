-- Recovery path for real earned rider progress when old weekly log rows
-- predate later daily activity. No historical results or snapshots are rewritten.
-- Only the game clock's Monday permits settlement. Retry-safe per rider/week.
create table if not exists private.rider_weekly_real_progress_settlement_v1 (
  rider_id uuid not null references public.riders(id) on delete cascade,
  week_start_date date not null,
  previous_skill_total integer not null,
  new_skill_total integer not null,
  settled_at timestamptz not null default now(),
  primary key(rider_id,week_start_date)
);

create or replace function public.settle_due_rider_real_progress_v1(p_batch_size integer default 250)
returns jsonb
language plpgsql security definer set search_path to 'public','private','pg_temp'
as $$
declare
  v_today date := public.get_current_game_date_date();
  v_week date;
  v_limit integer := greatest(1,least(coalesce(p_batch_size,250),250));
  v_locked boolean;
  v_rider record;
  v_before public.riders%rowtype;
  v_after public.riders%rowtype;
  v_before_total integer;
  v_after_total integer;
  v_count integer := 0;
  v_changed integer := 0;
begin
  -- Only settle on a real in-game Monday, never in the middle of a training week.
  if v_today is null or extract(isodow from v_today) <> 1 then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_game_monday');
  end if;
  v_week := date_trunc('week',v_today)::date;
  select pg_try_advisory_xact_lock(20261019,82500) into v_locked;
  if not v_locked then
    return jsonb_build_object('ok',true,'skipped',true,'reason','another_settlement_running');
  end if;

  -- Bank values were earned by the actual training / race simulation, never
  -- predicted from rider potential or fabricated historical differences.
  for v_rider in
    select b.rider_id
    from public.rider_attribute_progress_bank b
    where abs(b.progress_points) >= 1
      and not exists (
        select 1 from private.rider_weekly_real_progress_settlement_v1 done
        where done.rider_id=b.rider_id and done.week_start_date=v_week
      )
    group by b.rider_id
    order by b.rider_id
    limit v_limit
  loop
    select * into v_before from public.riders where id=v_rider.rider_id;
    if not found then continue; end if;
    v_before_total :=
      coalesce(v_before.sprint,0)+coalesce(v_before.climbing,0)
      +coalesce(v_before.time_trial,0)+coalesce(v_before.endurance,0)
      +coalesce(v_before.flat,0)+coalesce(v_before.recovery,0)
      +coalesce(v_before.resistance,0)+coalesce(v_before.race_iq,0)
      +coalesce(v_before.teamwork,0);

    perform public.resolve_rider_attribute_progress_bank(v_rider.rider_id);
    select * into v_after from public.riders where id=v_rider.rider_id;
    v_after_total :=
      coalesce(v_after.sprint,0)+coalesce(v_after.climbing,0)
      +coalesce(v_after.time_trial,0)+coalesce(v_after.endurance,0)
      +coalesce(v_after.flat,0)+coalesce(v_after.recovery,0)
      +coalesce(v_after.resistance,0)+coalesce(v_after.race_iq,0)
      +coalesce(v_after.teamwork,0);

    -- Revise only this week's actual sample, never any prior week.
    insert into public.rider_skill_weekly_snapshots (
      rider_id,week_start_date,sprint,climbing,time_trial,endurance,
      flat,recovery,resistance,race_iq,teamwork,recorded_at
    ) values (
      v_after.id,v_week,v_after.sprint,v_after.climbing,v_after.time_trial,
      v_after.endurance,v_after.flat,v_after.recovery,v_after.resistance,
      v_after.race_iq,v_after.teamwork,now()
    )
    on conflict (rider_id,week_start_date) do update
      set sprint=excluded.sprint,climbing=excluded.climbing,
      time_trial=excluded.time_trial,endurance=excluded.endurance,
      flat=excluded.flat,recovery=excluded.recovery,
      resistance=excluded.resistance,race_iq=excluded.race_iq,
      teamwork=excluded.teamwork,recorded_at=now();

    insert into private.rider_weekly_real_progress_settlement_v1
      (rider_id,week_start_date,previous_skill_total,new_skill_total)
    values (v_after.id,v_week,v_before_total,v_after_total)
    on conflict do nothing;

    v_count := v_count+1;
    if v_after_total <> v_before_total then v_changed:=v_changed+1; end if;
  end loop;
  return jsonb_build_object('ok',true,'week_start_date',v_week,
    'settled_riders',v_count,'changed_riders',v_changed);
end $$;

revoke all on function public.settle_due_rider_real_progress_v1(integer) from public,anon,authenticated;
grant execute on function public.settle_due_rider_real_progress_v1(integer) to service_role;

-- A small bounded job avoids a 17,000-rider single-transaction lock/IO spike.
-- Subsequent ticks drain the Monday backlog, guarded by a unique per-rider key.
do $$
begin
  if exists (select 1 from cron.job where jobname='rider-real-progress-settlement-v1')
  then perform cron.unschedule('rider-real-progress-settlement-v1'); end if;
  perform cron.schedule(
    'rider-real-progress-settlement-v1',
    '* * * * *',
    'select public.settle_due_rider_real_progress_v1(250);'
  );
end $$;
