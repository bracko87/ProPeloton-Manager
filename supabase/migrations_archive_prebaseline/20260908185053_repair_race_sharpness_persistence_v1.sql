create or replace function public.trg_apply_race_development_condition_v2()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_anchor_date date;
  v_race_days_last_14 integer := 0;
  v_race_days_last_30 integer := 0;
  v_total_race_events integer := 0;
begin
  if coalesce(new.applied_to_condition, false) then
    return new;
  end if;

  v_anchor_date := coalesce(
    public.get_current_game_date_date(),
    new.stage_date
  );

  select
    count(distinct e.stage_date) filter (
      where v_anchor_date is not null
        and e.stage_date between v_anchor_date - 13 and v_anchor_date
    )::integer,
    count(distinct e.stage_date) filter (
      where v_anchor_date is not null
        and e.stage_date between v_anchor_date - 29 and v_anchor_date
    )::integer,
    count(*)::integer
  into
    v_race_days_last_14,
    v_race_days_last_30,
    v_total_race_events
  from public.rider_race_development_events e
  where e.rider_id = new.rider_id;

  insert into public.rider_race_condition (
    rider_id,
    race_sharpness,
    last_raced_on,
    race_days_last_14,
    race_days_last_30,
    total_race_days,
    last_stage_sharpness_delta,
    last_stage_overload_penalty,
    updated_at
  )
  values (
    new.rider_id,
    least(
      100,
      greatest(
        0,
        50 + coalesce(new.sharpness_delta, 0) - coalesce(new.overload_penalty, 0)
      )
    )::numeric(6,2),
    new.stage_date,
    coalesce(v_race_days_last_14, 0),
    coalesce(v_race_days_last_30, 0),
    coalesce(v_total_race_events, 0),
    coalesce(new.sharpness_delta, 0)::numeric(8,3),
    coalesce(new.overload_penalty, 0)::numeric(8,3),
    now()
  )
  on conflict (rider_id) do update
  set
    race_sharpness = least(
      100,
      greatest(
        0,
        public.rider_race_condition.race_sharpness
        + coalesce(new.sharpness_delta, 0)
        - coalesce(new.overload_penalty, 0)
      )
    )::numeric(6,2),
    last_raced_on = greatest(
      coalesce(public.rider_race_condition.last_raced_on, new.stage_date),
      new.stage_date
    ),
    race_days_last_14 = coalesce(v_race_days_last_14, 0),
    race_days_last_30 = coalesce(v_race_days_last_30, 0),
    total_race_days = coalesce(v_total_race_events, 0),
    last_stage_sharpness_delta = case
      when new.stage_date is not null
       and (
         public.rider_race_condition.last_raced_on is null
         or new.stage_date >= public.rider_race_condition.last_raced_on
       )
      then coalesce(new.sharpness_delta, 0)::numeric(8,3)
      else public.rider_race_condition.last_stage_sharpness_delta
    end,
    last_stage_overload_penalty = case
      when new.stage_date is not null
       and (
         public.rider_race_condition.last_raced_on is null
         or new.stage_date >= public.rider_race_condition.last_raced_on
       )
      then coalesce(new.overload_penalty, 0)::numeric(8,3)
      else public.rider_race_condition.last_stage_overload_penalty
    end,
    updated_at = now();

  update public.rider_race_development_events
  set
    applied_to_condition = true,
    updated_at = now()
  where id = new.id
    and applied_to_condition = false;

  return new;
end;
$$;

drop trigger if exists trg_apply_race_development_condition_v2
  on public.rider_race_development_events;

create trigger trg_apply_race_development_condition_v2
after insert on public.rider_race_development_events
for each row
execute function public.trg_apply_race_development_condition_v2();

-- Repair historical development events without recalculating any race.
-- Existing condition rows (for example health-driven sharpness changes) are
-- preserved and receive only the previously unapplied race delta.
do $$
declare
  v_anchor_date date := public.get_current_game_date_date();
  r record;
begin
  for r in
    with unapplied as (
      select
        e.rider_id,
        sum(coalesce(e.sharpness_delta, 0) - coalesce(e.overload_penalty, 0))::numeric as net_delta
      from public.rider_race_development_events e
      where e.applied_to_condition = false
      group by e.rider_id
    )
    select
      u.rider_id,
      u.net_delta,
      s.last_raced_on,
      s.race_days_last_14,
      s.race_days_last_30,
      s.total_race_events,
      s.last_stage_sharpness_delta,
      s.last_stage_overload_penalty
    from unapplied u
    cross join lateral (
      select
        max(e.stage_date) as last_raced_on,
        count(distinct e.stage_date) filter (
          where v_anchor_date is not null
            and e.stage_date between v_anchor_date - 13 and v_anchor_date
        )::integer as race_days_last_14,
        count(distinct e.stage_date) filter (
          where v_anchor_date is not null
            and e.stage_date between v_anchor_date - 29 and v_anchor_date
        )::integer as race_days_last_30,
        count(*)::integer as total_race_events,
        (
          select e2.sharpness_delta
          from public.rider_race_development_events e2
          where e2.rider_id = u.rider_id
          order by e2.stage_date desc nulls last,
                   e2.stage_number desc nulls last,
                   e2.created_at desc,
                   e2.id desc
          limit 1
        ) as last_stage_sharpness_delta,
        (
          select e2.overload_penalty
          from public.rider_race_development_events e2
          where e2.rider_id = u.rider_id
          order by e2.stage_date desc nulls last,
                   e2.stage_number desc nulls last,
                   e2.created_at desc,
                   e2.id desc
          limit 1
        ) as last_stage_overload_penalty
      from public.rider_race_development_events e
      where e.rider_id = u.rider_id
    ) s
  loop
    insert into public.rider_race_condition (
      rider_id,
      race_sharpness,
      last_raced_on,
      race_days_last_14,
      race_days_last_30,
      total_race_days,
      last_stage_sharpness_delta,
      last_stage_overload_penalty,
      updated_at
    )
    values (
      r.rider_id,
      least(100, greatest(0, 50 + r.net_delta))::numeric(6,2),
      r.last_raced_on,
      coalesce(r.race_days_last_14, 0),
      coalesce(r.race_days_last_30, 0),
      coalesce(r.total_race_events, 0),
      coalesce(r.last_stage_sharpness_delta, 0)::numeric(8,3),
      coalesce(r.last_stage_overload_penalty, 0)::numeric(8,3),
      now()
    )
    on conflict (rider_id) do update
    set
      race_sharpness = least(
        100,
        greatest(
          0,
          public.rider_race_condition.race_sharpness + r.net_delta
        )
      )::numeric(6,2),
      last_raced_on = greatest(
        coalesce(public.rider_race_condition.last_raced_on, r.last_raced_on),
        r.last_raced_on
      ),
      race_days_last_14 = coalesce(r.race_days_last_14, 0),
      race_days_last_30 = coalesce(r.race_days_last_30, 0),
      total_race_days = coalesce(r.total_race_events, 0),
      last_stage_sharpness_delta = coalesce(r.last_stage_sharpness_delta, 0)::numeric(8,3),
      last_stage_overload_penalty = coalesce(r.last_stage_overload_penalty, 0)::numeric(8,3),
      updated_at = now();
  end loop;

  update public.rider_race_development_events
  set
    applied_to_condition = true,
    updated_at = now()
  where applied_to_condition = false;
end;
$$;