-- When a new professional rider enters the game on day D, that rider has
-- no preceding in-game day D-1 to recover from. Initialize their processed
-- through-date to D-1 WITHOUT changing fatigue, load or health.
--
-- This fixes same-tick generated free agents and youth graduates created
-- after the daily recovery job. It does not backfill existing riders,
-- replay any game day, or modify already-finished race results.
create or replace function private.initialize_new_rider_fatigue_baseline_v1()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $function$
declare
  v_join_game_date date;
begin
  if new.fatigue_updated_on is not null then
    return new;
  end if;

  v_join_game_date := public.get_current_game_date_date();
  if v_join_game_date is null then
    raise exception 'Cannot initialize new rider fatigue without an in-game date';
  end if;

  -- This is an initial baseline (not a claimed recovery operation).
  -- The new rider did not participate in any previous day's activity.
  new.fatigue_updated_on := v_join_game_date - 1;
  return new;
end;
$function$;

revoke all on function private.initialize_new_rider_fatigue_baseline_v1()
from public, anon, authenticated;

drop trigger if exists trg_initialize_new_rider_fatigue_baseline_v1 on public.riders;
create trigger trg_initialize_new_rider_fatigue_baseline_v1
before insert on public.riders
for each row
when (new.fatigue_updated_on is null)
execute function private.initialize_new_rider_fatigue_baseline_v1();
