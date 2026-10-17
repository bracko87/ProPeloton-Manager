-- Premium Rider Development Lab: calculate genuine changes from the existing
-- weekly skill snapshots. Do not fabricate historical changes or expose
-- arbitrary clubs' snapshots to authenticated clients.
create or replace function public.premium_get_rider_skill_history_v1(p_club_id uuid)
returns table (
  rider_id uuid,
  development_8w integer,
  weeks_recorded integer,
  first_snapshot_week date,
  last_snapshot_week date
)
language plpgsql
stable security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_club_id uuid;
  v_game_date date;
begin
  v_club_id := public.premium_assert_manager_access_v1(p_club_id);
  v_game_date := public.get_current_game_timestamp()::date;
  return query
  select
    cr.rider_id,
    case
      when newest.week_start_date is not null
       and oldest.week_start_date is not null
       and newest.week_start_date > oldest.week_start_date then
        (newest.sprint - oldest.sprint)
        + (newest.climbing - oldest.climbing)
        + (newest.time_trial - oldest.time_trial)
        + (newest.endurance - oldest.endurance)
        + (newest.flat - oldest.flat)
        + (newest.recovery - oldest.recovery)
        + (newest.resistance - oldest.resistance)
        + (newest.race_iq - oldest.race_iq)
        + (newest.teamwork - oldest.teamwork)
      else 0
    end::integer as development_8w,
    greatest(0, coalesce(coverage.snapshot_count, 0) - 1)::integer as weeks_recorded,
    oldest.week_start_date as first_snapshot_week,
    newest.week_start_date as last_snapshot_week
  from public.club_riders cr
  left join lateral (
    select s.*
    from public.rider_skill_weekly_snapshots s
    where s.rider_id = cr.rider_id
      and s.week_start_date between v_game_date - 56 and v_game_date
    order by s.week_start_date asc
    limit 1
  ) oldest on true
  left join lateral (
    select s.*
    from public.rider_skill_weekly_snapshots s
    where s.rider_id = cr.rider_id
      and s.week_start_date between v_game_date - 56 and v_game_date
    order by s.week_start_date desc
    limit 1
  ) newest on true
  left join lateral (
    select count(*)::integer as snapshot_count
    from public.rider_skill_weekly_snapshots s
    where s.rider_id = cr.rider_id
      and s.week_start_date between v_game_date - 56 and v_game_date
  ) coverage on true
  where cr.club_id = v_club_id;
end;
$$;

revoke all on function public.premium_get_rider_skill_history_v1(uuid) from public;
grant execute on function public.premium_get_rider_skill_history_v1(uuid) to authenticated;

comment on function public.premium_get_rider_skill_history_v1(uuid) is
  'Premium-gated 8-week NET skill deltas calculated from genuine chronological rider skill snapshots. An unchanged week is 0, and weeks_recorded counts comparable intervals. Snapshot skills do not store historical overall rating; never synthesize an overall delta.';