create or replace function public.sync_race_application_statuses_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_current record;
  v_today_ordinal integer;
  v_future_races_reset integer := 0;
  v_application_rows_updated integer := 0;
begin
  select * into v_current
  from public.get_current_game_date_parts()
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','current_game_date_not_found');
  end if;

  v_today_ordinal := public.game_date_ordinal_v1(
    v_current.season_number,
    v_current.month_number,
    v_current.day_number
  );

  with current_date_value as (
    select make_date(
      1999 + v_current.season_number,
      v_current.month_number,
      v_current.day_number
    ) as current_game_date
  )
  update public.races r
  set status='scheduled',updated_at=now()
  from current_date_value cd
  where r.start_date > cd.current_game_date
    and r.status in ('completed','finished','race_finished');

  get diagnostics v_future_races_reset = row_count;

  update public.race_entry_rules rer
  set applications_status = case
      when lower(trim(coalesce(r.status::text,''))) in ('completed','finished','race_finished','complete')
        then 'race_finished'
      when v_today_ordinal > public.game_date_ordinal_v1(
        extract(year from coalesce(r.end_date,r.start_date))::integer-1999,
        extract(month from coalesce(r.end_date,r.start_date))::integer,
        extract(day from coalesce(r.end_date,r.start_date))::integer
      ) then 'race_finished'
      when public.get_current_game_timestamp()::timestamp without time zone >= coalesce(
        (
          select rs.stage_date::timestamp + make_interval(
            hours=>coalesce(rs.planned_start_hour_number,r.planned_start_hour_number,12),
            mins=>coalesce(rs.planned_start_minute,r.planned_start_minute,0)
          )
          from public.race_stages rs
          where rs.race_id=r.id
          order by rs.stage_number
          limit 1
        ),
        r.start_date::timestamp + make_interval(
          hours=>coalesce(r.planned_start_hour_number,12),
          mins=>coalesce(r.planned_start_minute,0)
        )
      )
      and v_today_ordinal >= public.game_date_ordinal_v1(
        extract(year from r.start_date)::integer-1999,
        extract(month from r.start_date)::integer,
        extract(day from r.start_date)::integer
      )
      and v_today_ordinal <= public.game_date_ordinal_v1(
        extract(year from coalesce(r.end_date,r.start_date))::integer-1999,
        extract(month from coalesce(r.end_date,r.start_date))::integer,
        extract(day from coalesce(r.end_date,r.start_date))::integer
      ) then 'race_active'
      when lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
        then 'closed'
      when v_today_ordinal < public.game_date_ordinal_v1(
        rer.applications_open_season_number,
        rer.applications_open_month_number,
        rer.applications_open_day_number
      ) then 'not_open'
      when v_today_ordinal < public.game_date_ordinal_v1(
        rer.applications_close_season_number,
        rer.applications_close_month_number,
        rer.applications_close_day_number
      ) then 'open'
      else 'closed'
    end,
    updated_at=now()
  from public.races r
  where r.id=rer.race_id
    and rer.applications_open_season_number is not null
    and rer.applications_open_month_number is not null
    and rer.applications_open_day_number is not null
    and rer.applications_close_season_number is not null
    and rer.applications_close_month_number is not null
    and rer.applications_close_day_number is not null;

  get diagnostics v_application_rows_updated = row_count;

  return jsonb_build_object(
    'success',true,
    'current_game_date',public.game_date_display_v1(
      v_current.season_number,v_current.month_number,v_current.day_number
    ),
    'future_races_reset_to_scheduled',v_future_races_reset,
    'application_status_rows_updated',v_application_rows_updated,
    'close_day_is_first_closed_day',true
  );
end;
$$;

select public.sync_race_application_statuses_v1();