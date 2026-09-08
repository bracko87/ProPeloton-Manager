create or replace function public.staff_advisory_game_date_label_v1(p_date date)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_date is null then 'Season —'
    else format(
      'Season %s · %s %s',
      greatest(1, extract(year from p_date)::integer - 1999),
      (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p_date)::integer],
      extract(day from p_date)::integer
    )
  end;
$$;

revoke execute on function public.staff_advisory_game_date_label_v1(date) from public, anon, authenticated;

create or replace function public.staff_advisory_effective_training_window_v1(
  p_club_id uuid,
  p_start_date date,
  p_days integer default 3
)
returns table(
  scheduled_rider_days integer,
  manual_override_rider_days integer,
  race_rider_days integer,
  camp_rider_days integer,
  health_block_rider_days integer,
  unavailable_rider_days integer,
  covered_rider_days integer,
  uncovered_rider_days integer
)
language sql
stable
security invoker
set search_path to 'public'
as $$
with day_window as (
  select d::date as plan_date
  from generate_series(
    p_start_date::timestamp,
    (p_start_date + greatest(0, coalesce(p_days, 3) - 1))::timestamp,
    interval '1 day'
  ) d
), rider_base as (
  select
    cr.rider_id,
    coalesce(r.availability_status, 'fit') as availability_status,
    case
      when coalesce(c.club_type, 'main') = 'developing' then 'u23'
      else 'first_team'
    end as team_scope
  from public.club_riders cr
  join public.riders r on r.id = cr.rider_id
  join public.clubs c on c.id = cr.club_id and c.deleted_at is null
  where cr.club_id = p_club_id
), grid as (
  select
    rb.*,
    dw.plan_date,
    extract(isodow from dw.plan_date)::integer as iso_dow
  from rider_base rb
  cross join day_window dw
), resolved as (
  select
    g.*,
    dp.source_type as daily_source_type,
    (
      dp.id is not null
      and dp.status = 'planned'
      and dp.focus_code is not null
      and dp.intensity is not null
    ) as has_daily_schedule,
    (
      rtp.rider_id is not null
      and coalesce(rtp.is_active, true)
      and coalesce(rtp.auto_when_free, false)
      and rtp.focus_code is not null
      and rtp.intensity is not null
      and (
        rtp.preferred_days is null
        or array_length(rtp.preferred_days, 1) is null
        or g.iso_dow = any(rtp.preferred_days)
      )
    ) as has_rider_schedule,
    (
      ctd.club_id is not null
      and coalesce(ctd.auto_when_free, false)
      and ctd.focus_code is not null
      and ctd.intensity is not null
    ) as has_club_schedule,
    exists (
      select 1
      from public.race_preparation_riders rpr
      join public.race_preparations rp on rp.id = rpr.race_preparation_id
      join public.races rr on rr.id = rp.race_id
      where rpr.rider_id = g.rider_id
        and rp.participating_club_id = p_club_id
        and rp.status in ('submitted', 'locked')
        and g.plan_date between rr.start_date and rr.end_date
        and exists (
          select 1
          from public.race_stages rs
          where rs.race_id = rr.id
            and rs.stage_date = g.plan_date
            and coalesce(rs.weather_cancelled, false) = false
        )
    ) as race_day,
    exists (
      select 1
      from public.training_camp_participants tcp
      join public.training_camp_bookings tcb on tcb.id = tcp.booking_id
      where tcp.rider_id = g.rider_id
        and tcb.status in ('planned', 'active')
        and g.plan_date between tcb.start_date and tcb.end_date
    ) as camp_day,
    exists (
      select 1
      from public.rider_health_cases hc
      where hc.rider_id = g.rider_id
        and hc.status in ('active', 'recovering')
        and hc.training_blocked = true
        and g.plan_date between hc.started_on and coalesce(hc.recovery_until, hc.active_until)
    ) as health_block,
    g.availability_status in ('injured', 'sick') as unavailable
  from grid g
  left join lateral (
    select p.*
    from public.rider_regular_training_daily_plans p
    where p.club_id = p_club_id
      and p.rider_id = g.rider_id
      and p.plan_date = g.plan_date
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1
  ) dp on true
  left join lateral (
    select p.*
    from public.rider_regular_training_plans p
    where p.club_id = p_club_id
      and p.rider_id = g.rider_id
      and coalesce(p.is_active, true) = true
    order by p.updated_at desc nulls last, p.created_at desc nulls last
    limit 1
  ) rtp on true
  left join lateral (
    select d.*
    from public.club_regular_training_defaults d
    where d.club_id = p_club_id
      and d.team_scope in (g.team_scope, 'all')
    order by
      case when d.team_scope = g.team_scope then 0 else 1 end,
      d.updated_at desc nulls last,
      d.created_at desc nulls last
    limit 1
  ) ctd on true
), classified as (
  select
    r.*,
    (
      not r.race_day
      and not r.camp_day
      and not r.health_block
      and not r.unavailable
      and (r.has_daily_schedule or r.has_rider_schedule or r.has_club_schedule)
    ) as scheduled,
    (
      r.race_day
      or r.camp_day
      or r.health_block
      or r.unavailable
      or (
        not r.race_day
        and not r.camp_day
        and not r.health_block
        and not r.unavailable
        and (r.has_daily_schedule or r.has_rider_schedule or r.has_club_schedule)
      )
    ) as covered
  from resolved r
)
select
  count(*) filter (where scheduled)::integer,
  count(*) filter (where scheduled and daily_source_type = 'manual_override')::integer,
  count(*) filter (where race_day)::integer,
  count(*) filter (where camp_day)::integer,
  count(*) filter (where health_block)::integer,
  count(*) filter (where unavailable)::integer,
  count(*) filter (where covered)::integer,
  count(*) filter (where not covered)::integer
from classified;
$$;

revoke execute on function public.staff_advisory_effective_training_window_v1(uuid, date, integer) from public, anon, authenticated;

do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select replace(pg_get_functiondef(p.oid), E'\r\n', E'\n')
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'staff_advisory_scan_head_coach_events_v1'
  limit 1;

  if v_def is null then
    raise exception 'staff_advisory_scan_head_coach_events_v1 not found';
  end if;

  v_old := E'  v_plan_count integer := 0;\n  v_manual_overrides integer := 0;';
  v_new := E'  v_plan_count integer := 0;\n  v_manual_overrides integer := 0;\n  v_covered_count integer := 0;\n  v_uncovered_count integer := 0;\n  v_race_rider_days integer := 0;\n  v_camp_rider_days integer := 0;\n  v_health_block_rider_days integer := 0;\n  v_unavailable_rider_days integer := 0;';

  if strpos(v_def, v_old) = 0 then
    raise exception 'scanner declaration patch anchor not found';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := E'-- TRAINING WINDOW\n  select\n    count(*)::integer,\n    count(*) filter (where p.source_type = ''manual_override'')::integer\n  into v_plan_count, v_manual_overrides\n  from public.rider_regular_training_daily_plans p\n  where p.club_id = v_access.club_id\n    and p.plan_date between v_today and v_today + 2\n    and p.status = ''planned'';';
  v_new := E'-- TRAINING WINDOW — use the same effective schedule sources as the Training page/processor.\n  select\n    w.scheduled_rider_days,\n    w.manual_override_rider_days,\n    w.covered_rider_days,\n    w.uncovered_rider_days,\n    w.race_rider_days,\n    w.camp_rider_days,\n    w.health_block_rider_days,\n    w.unavailable_rider_days\n  into\n    v_plan_count,\n    v_manual_overrides,\n    v_covered_count,\n    v_uncovered_count,\n    v_race_rider_days,\n    v_camp_rider_days,\n    v_health_block_rider_days,\n    v_unavailable_rider_days\n  from public.staff_advisory_effective_training_window_v1(\n    v_access.club_id,\n    v_today,\n    3\n  ) w;';

  if strpos(v_def, v_old) = 0 then
    raise exception 'scanner training-window patch anchor not found';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_def := replace(v_def, 'v_total > 0 and v_plan_count = 0', 'v_total > 0 and v_covered_count = 0');
  v_def := replace(v_def, E'    and v_plan_count = 0\n    and (', E'    and v_covered_count = 0\n    and (');

  v_old := E'      format(\n        ''No regular training sessions are planned from %s through %s. Review the training calendar before the next race block.'',\n        v_today,\n        v_today + 2\n      ),';
  v_new := E'      format(\n        ''No regular training sessions or intentional race/recovery blocks are scheduled from %s through %s. Review the training calendar before the next race block.'',\n        public.staff_advisory_game_date_label_v1(v_today),\n        public.staff_advisory_game_date_label_v1(v_today + 2)\n      ),';

  if strpos(v_def, v_old) = 0 then
    raise exception 'scanner date-message patch anchor not found';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := E'        ''planned_sessions'', v_plan_count,\n        ''manual_overrides'', v_manual_overrides';
  v_new := E'        ''planned_sessions'', v_plan_count,\n        ''manual_overrides'', v_manual_overrides,\n        ''covered_rider_days'', v_covered_count,\n        ''uncovered_rider_days'', v_uncovered_count,\n        ''race_rider_days'', v_race_rider_days,\n        ''camp_rider_days'', v_camp_rider_days,\n        ''health_block_rider_days'', v_health_block_rider_days,\n        ''unavailable_rider_days'', v_unavailable_rider_days,\n        ''window_start_label'', public.staff_advisory_game_date_label_v1(v_today),\n        ''window_end_label'', public.staff_advisory_game_date_label_v1(v_today + 2)';
  if strpos(v_def, v_old) = 0 then
    raise exception 'scanner snapshot patch anchor not found';
  end if;
  v_def := replace(v_def, v_old, v_new);

  execute v_def;
end
$migration$;

do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select replace(pg_get_functiondef(p.oid), E'\r\n', E'\n')
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'staff_advisory_build_head_coach_report_v1'
  limit 1;

  if v_def is null then
    raise exception 'staff_advisory_build_head_coach_report_v1 not found';
  end if;

  v_old := E'  v_plans integer := 0;\n  v_manual_overrides integer := 0;';
  v_new := E'  v_plans integer := 0;\n  v_manual_overrides integer := 0;\n  v_covered_count integer := 0;\n  v_uncovered_count integer := 0;\n  v_race_rider_days integer := 0;\n  v_camp_rider_days integer := 0;';
  if strpos(v_def, v_old) = 0 then
    raise exception 'builder declaration patch anchor not found';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_old := E'  select\n    count(*)::integer,\n    count(*) filter (where p.source_type = ''manual_override'')::integer\n  into\n    v_plans,\n    v_manual_overrides\n  from public.rider_regular_training_daily_plans p\n  where p.club_id = p_club_id\n    and p.plan_date between v_today and v_today + 2\n    and p.status = ''planned'';';
  v_new := E'  select\n    w.scheduled_rider_days,\n    w.manual_override_rider_days,\n    w.covered_rider_days,\n    w.uncovered_rider_days,\n    w.race_rider_days,\n    w.camp_rider_days\n  into\n    v_plans,\n    v_manual_overrides,\n    v_covered_count,\n    v_uncovered_count,\n    v_race_rider_days,\n    v_camp_rider_days\n  from public.staff_advisory_effective_training_window_v1(\n    p_club_id,\n    v_today,\n    3\n  ) w;';
  if strpos(v_def, v_old) = 0 then
    raise exception 'builder training-window patch anchor not found';
  end if;
  v_def := replace(v_def, v_old, v_new);

  v_def := replace(
    v_def,
    'if v_plans = 0 and v_total > 0 then',
    'if v_covered_count = 0 and v_total > 0 then'
  );

  execute v_def;
end
$migration$;

with corrected as (
  select
    n.id,
    format(
      'No regular training sessions are planned from %s through %s. Review the training calendar before the next race block.',
      public.staff_advisory_game_date_label_v1((n.payload_json #>> '{snapshot,window_start}')::date),
      public.staff_advisory_game_date_label_v1((n.payload_json #>> '{snapshot,window_end}')::date)
    ) as corrected_message
  from public.notifications n
  where n.payload_json->>'report_code' = 'hc_training_schedule_gap'
    and (n.payload_json #>> '{snapshot,window_start}') ~ '^200[0-9]-[0-9]{2}-[0-9]{2}$'
    and (n.payload_json #>> '{snapshot,window_end}') ~ '^200[0-9]-[0-9]{2}-[0-9]{2}$'
)
update public.notifications n
set
  message = c.corrected_message,
  payload_json = jsonb_set(
    jsonb_set(
      n.payload_json,
      '{summary}',
      to_jsonb(c.corrected_message),
      true
    ),
    '{snapshot,window_start_label}',
    to_jsonb(public.staff_advisory_game_date_label_v1((n.payload_json #>> '{snapshot,window_start}')::date)),
    true
  )
from corrected c
where n.id = c.id;

with corrected as (
  select
    r.id,
    format(
      'No regular training sessions are planned from %s through %s. Review the training calendar before the next race block.',
      public.staff_advisory_game_date_label_v1((r.report_json #>> '{snapshot,window_start}')::date),
      public.staff_advisory_game_date_label_v1((r.report_json #>> '{snapshot,window_end}')::date)
    ) as corrected_summary
  from public.staff_advisory_reports r
  where r.report_code = 'hc_training_schedule_gap'
    and (r.report_json #>> '{snapshot,window_start}') ~ '^200[0-9]-[0-9]{2}-[0-9]{2}$'
    and (r.report_json #>> '{snapshot,window_end}') ~ '^200[0-9]-[0-9]{2}-[0-9]{2}$'
)
update public.staff_advisory_reports r
set
  summary = c.corrected_summary,
  report_json = jsonb_set(r.report_json, '{summary}', to_jsonb(c.corrected_summary), true)
from corrected c
where r.id = c.id;

update public.staff_advisory_event_state es
set
  condition_active = false,
  last_signature = '',
  last_checked_at = now(),
  state_json = coalesce(es.state_json, '{}'::jsonb) || jsonb_build_object(
    'reconciled_by', 'effective_training_window_v1',
    'reconciled_at', now()
  ),
  updated_at = now()
from public.staff_advisory_access a,
lateral public.staff_advisory_effective_training_window_v1(
  a.club_id,
  public.get_current_game_date_date(),
  3
) w
where es.access_id = a.id
  and es.event_code = 'hc_training_schedule_gap'
  and w.covered_rider_days > 0;
