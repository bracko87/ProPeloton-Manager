create or replace function public.universal_race_stage_other_supply_reservations_v1(
  p_stage_id uuid,
  p_team_id uuid,
  p_supply_key text
)
returns integer
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_owner uuid;
  v_stage_date date;
  v_stage_order_ts timestamp;
  v_reserved integer := 0;
  v_one integer := 0;
  x record;
begin
  select
    public.universal_race_resource_owner_club_v1(p_team_id),
    s.stage_date::date,
    s.stage_date::timestamp
      + make_interval(
          hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
          mins => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
        )
  into v_owner, v_stage_date, v_stage_order_ts
  from public.race_stages s
  where s.id = p_stage_id;

  if v_owner is null or v_stage_date is null or v_stage_order_ts is null then
    return 0;
  end if;

  for x in
    select distinct
      rsp.stage_id,
      coalesce(rp.participating_club_id, rp.club_id) as sporting_team_id,
      s.stage_date::date as stage_date,
      s.stage_date::timestamp
        + make_interval(
            hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
            mins => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
          ) as stage_order_ts
    from public.race_stage_plans rsp
    join public.race_preparations rp
      on rp.id = rsp.race_preparation_id
    join public.race_stages s
      on s.id = rsp.stage_id
    join public.races r
      on r.id = rsp.race_id
    where rsp.stage_id is not null
      and rsp.stage_id <> p_stage_id
      and rsp.last_saved_at is not null
      and lower(coalesce(rp.status, '')) in (
        'submitted', 'locked', 'sent_to_engine', 'final', 'finalized',
        'completed', 'auto_defaulted'
      )
      and public.universal_race_resource_owner_club_v1(
            coalesce(rp.participating_club_id, rp.club_id)
          ) = v_owner
      and lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
      and not coalesce(s.weather_cancelled, false)
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = rsp.stage_id
      )
      and (
        s.stage_date::timestamp
          + make_interval(
              hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
              mins => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
            )
      ) < v_stage_order_ts
      and (
        p_supply_key not in ('race_jersey_complete', 'rain_jackets')
        or s.stage_date::date = v_stage_date
      )
    order by stage_order_ts, rsp.stage_id
  loop
    select coalesce(max(req.required_quantity), 0)
    into v_one
    from public.universal_race_stage_planned_supplies_v1(
      x.stage_id,
      x.sporting_team_id
    ) req
    where req.supply_key = p_supply_key;

    v_reserved := v_reserved + greatest(coalesce(v_one, 0), 0);
  end loop;

  return greatest(v_reserved, 0);
end;
$function$;
