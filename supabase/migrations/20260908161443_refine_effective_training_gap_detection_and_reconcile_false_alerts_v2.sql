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
    dp.id as daily_plan_id,
    dp.source_type as daily_source_type,
    dp.status as daily_status,
    dp.focus_code as daily_focus,
    dp.intensity as daily_intensity,
    rtp.rider_id as rider_plan_id,
    rtp.focus_code as rider_focus,
    rtp.intensity as rider_intensity,
    rtp.auto_when_free as rider_auto_when_free,
    rtp.preferred_days as rider_preferred_days,
    ctd.club_id as club_default_id,
    ctd.focus_code as club_focus,
    ctd.intensity as club_intensity,
    ctd.auto_when_free as club_auto_when_free,
    exists (
      select 1
      from public.rider_daily_activity a
      where a.rider_id = g.rider_id
        and a.activity_date = g.plan_date
    ) as activity_day,
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
), chosen as (
  select
    r.*,
    case
      when r.daily_plan_id is not null
        and r.daily_status = 'planned'
        and r.daily_focus is not null
        and r.daily_intensity is not null
        then r.daily_focus
      when r.daily_plan_id is not null then null
      when r.rider_plan_id is not null
        and coalesce(r.rider_auto_when_free, false)
        and r.rider_focus is not null
        and r.rider_intensity is not null
        and (
          r.rider_preferred_days is null
          or array_length(r.rider_preferred_days, 1) is null
          or r.iso_dow = any(r.rider_preferred_days)
        )
        then r.rider_focus
      when r.rider_plan_id is not null then null
      when r.club_default_id is not null
        and coalesce(r.club_auto_when_free, false)
        and r.club_focus is not null
        and r.club_intensity is not null
        then r.club_focus
      else null
    end as effective_focus,
    case
      when r.daily_plan_id is not null
        and r.daily_status = 'planned'
        and r.daily_focus is not null
        and r.daily_intensity is not null
        then r.daily_source_type
      when r.daily_plan_id is not null then null
      when r.rider_plan_id is not null
        and coalesce(r.rider_auto_when_free, false)
        and r.rider_focus is not null
        and r.rider_intensity is not null
        and (
          r.rider_preferred_days is null
          or array_length(r.rider_preferred_days, 1) is null
          or r.iso_dow = any(r.rider_preferred_days)
        )
        then 'rider_plan'
      when r.rider_plan_id is not null then null
      when r.club_default_id is not null
        and coalesce(r.club_auto_when_free, false)
        and r.club_focus is not null
        and r.club_intensity is not null
        then 'club_default'
      else null
    end as effective_source
  from resolved r
), classified as (
  select
    c.*,
    (
      not c.activity_day
      and not c.race_day
      and not c.camp_day
      and not c.health_block
      and not c.unavailable
      and c.effective_focus is not null
      and c.effective_focus <> 'day_off'
    ) as scheduled,
    (
      c.activity_day
      or c.race_day
      or c.camp_day
      or c.health_block
      or c.unavailable
      or c.effective_focus is not null
    ) as covered
  from chosen c
)
select
  count(*) filter (where scheduled)::integer,
  count(*) filter (
    where not activity_day
      and not race_day
      and not camp_day
      and not health_block
      and not unavailable
      and effective_focus is not null
      and effective_source = 'manual_override'
  )::integer,
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
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'staff_advisory_scan_head_coach_events_v1'
  limit 1;

  if v_def is null then
    raise exception 'staff_advisory_scan_head_coach_events_v1 not found';
  end if;

  v_def := replace(
    v_def,
    'v_total > 0 and v_covered_count = 0',
    'v_total > 0 and v_plan_count = 0 and v_uncovered_count > 0'
  );

  v_def := replace(
    v_def,
    E'    and v_covered_count = 0\n    and (',
    E'    and v_plan_count = 0\n    and v_uncovered_count > 0\n    and ('
  );

  execute v_def;
end
$migration$;

do $migration$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'staff_advisory_build_head_coach_report_v1'
  limit 1;

  if v_def is null then
    raise exception 'staff_advisory_build_head_coach_report_v1 not found';
  end if;

  v_def := replace(
    v_def,
    'if v_covered_count = 0 and v_total > 0 then',
    'if v_plans = 0 and v_total > 0 and v_uncovered_count > 0 then'
  );

  v_def := replace(
    v_def,
    'when v_high_fatigue = 0 and v_unavailable = 0 and v_plans > 0',
    'when v_high_fatigue = 0 and v_unavailable = 0 and (v_plans > 0 or v_uncovered_count = 0)'
  );

  execute v_def;
end
$migration$;

-- Reconcile current/future false-positive schedule-gap reports without deleting history.
with candidate as (
  select
    r.id as report_id,
    r.notification_id,
    r.club_id,
    (r.report_json #>> '{snapshot,window_start}')::date as window_start,
    (r.report_json #>> '{snapshot,window_end}')::date as window_end
  from public.staff_advisory_reports r
  where r.report_code = 'hc_training_schedule_gap'
    and (r.report_json #>> '{snapshot,window_start}') ~ '^200[0-9]-[0-9]{2}-[0-9]{2}$'
    and (r.report_json #>> '{snapshot,window_end}') ~ '^200[0-9]-[0-9]{2}-[0-9]{2}$'
    and (r.report_json #>> '{snapshot,window_end}')::date >= public.get_current_game_date_date()
), resolved as (
  select
    c.*,
    w.scheduled_rider_days,
    w.manual_override_rider_days,
    w.race_rider_days,
    w.camp_rider_days,
    w.health_block_rider_days,
    w.unavailable_rider_days,
    w.covered_rider_days,
    w.uncovered_rider_days,
    format(
      'No training schedule gap exists from %s through %s. %s rider-day(s) have regular training/recovery scheduled and %s rider-day(s) are assigned to race activity.',
      public.staff_advisory_game_date_label_v1(c.window_start),
      public.staff_advisory_game_date_label_v1(c.window_end),
      w.scheduled_rider_days,
      w.race_rider_days
    ) as corrected_summary
  from candidate c
  cross join lateral public.staff_advisory_effective_training_window_v1(
    c.club_id,
    c.window_start,
    greatest(1, (c.window_end - c.window_start) + 1)
  ) w
  where w.scheduled_rider_days > 0
     or w.uncovered_rider_days = 0
), updated_reports as (
  update public.staff_advisory_reports r
  set
    title = 'Head Coach Advisory — Training Schedule Covered',
    summary = x.corrected_summary,
    report_json =
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  coalesce(r.report_json, '{}'::jsonb),
                  '{title}',
                  to_jsonb('Head Coach Advisory — Training Schedule Covered'::text),
                  true
                ),
                '{summary}',
                to_jsonb(x.corrected_summary),
                true
              ),
              '{snapshot,planned_sessions}',
              to_jsonb(x.scheduled_rider_days),
              true
            ),
            '{snapshot,race_rider_days}',
            to_jsonb(x.race_rider_days),
            true
          ),
          '{snapshot,covered_rider_days}',
          to_jsonb(x.covered_rider_days),
          true
        ),
        '{snapshot,uncovered_rider_days}',
        to_jsonb(x.uncovered_rider_days),
        true
      ) || jsonb_build_object(
        'resolved_false_positive', true,
        'resolution', 'effective_training_schedule_detected'
      ),
    generated_at = r.generated_at
  from resolved x
  where r.id = x.report_id
  returning r.notification_id, x.corrected_summary, x.scheduled_rider_days,
            x.race_rider_days, x.covered_rider_days, x.uncovered_rider_days
)
update public.notifications n
set
  title = 'Head Coach Advisory — Training Schedule Covered',
  message = u.corrected_summary,
  payload_json =
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                coalesce(n.payload_json, '{}'::jsonb),
                '{title}',
                to_jsonb('Head Coach Advisory — Training Schedule Covered'::text),
                true
              ),
              '{summary}',
              to_jsonb(u.corrected_summary),
              true
            ),
            '{snapshot,planned_sessions}',
            to_jsonb(u.scheduled_rider_days),
            true
          ),
          '{snapshot,race_rider_days}',
          to_jsonb(u.race_rider_days),
          true
        ),
        '{snapshot,covered_rider_days}',
        to_jsonb(u.covered_rider_days),
        true
      ),
      '{snapshot,uncovered_rider_days}',
      to_jsonb(u.uncovered_rider_days),
      true
    ) || jsonb_build_object(
      'resolved_false_positive', true,
      'resolution', 'effective_training_schedule_detected'
    )
from updated_reports u
where n.id = u.notification_id;

-- Reconcile event state using the refined definition.
update public.staff_advisory_event_state es
set
  condition_active = false,
  last_signature = '',
  last_checked_at = now(),
  state_json = coalesce(es.state_json, '{}'::jsonb) || jsonb_build_object(
    'reconciled_by', 'effective_training_window_v2',
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
  and (
    w.scheduled_rider_days > 0
    or w.uncovered_rider_days = 0
  );