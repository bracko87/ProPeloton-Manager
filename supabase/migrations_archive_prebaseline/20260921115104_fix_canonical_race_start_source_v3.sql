-- Canonical race start source v3:
-- Parent race numeric hour/minute are authoritative.
-- Stage numeric values are fallback only; legacy text labels are last resort.
-- Keep unpublished stage labels synchronized so UI/scheduler cannot drift.

CREATE OR REPLACE FUNCTION public.race_stage_planned_start_game_at_v1(p_stage_id uuid)
RETURNS timestamp with time zone
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date;
  v_hour integer;
  v_minute integer;
  v_label text;
begin
  select
    s.stage_date::date,
    coalesce(r.planned_start_hour_number, s.planned_start_hour_number),
    coalesce(r.planned_start_minute, s.planned_start_minute, 0),
    coalesce(
      nullif(r.planned_start_time_label,''),
      nullif(s.planned_start_time_label,''),
      nullif(to_jsonb(s)->>'start_time_label','')
    )
  into v_date, v_hour, v_minute, v_label
  from public.race_stages s
  join public.races r on r.id = s.race_id
  where s.id = p_stage_id;

  if v_date is null then
    return null;
  end if;

  if v_hour is null then
    if coalesce(v_label,'') ~ '^[0-2][0-9]:[0-5][0-9]$' then
      v_hour := split_part(v_label,':',1)::integer;
      v_minute := split_part(v_label,':',2)::integer;
    else
      return null;
    end if;
  end if;

  if v_hour < 0 or v_hour > 23 or coalesce(v_minute,0) < 0 or coalesce(v_minute,0) > 59 then
    return null;
  end if;

  return make_timestamptz(
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    extract(day from v_date)::integer,
    v_hour,
    coalesce(v_minute,0),
    0,
    'UTC'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.race_stage_enforce_parent_start_time_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
declare
  v_hour integer;
  v_minute integer;
begin
  select r.planned_start_hour_number, coalesce(r.planned_start_minute,0)
    into v_hour, v_minute
  from public.races r
  where r.id = new.race_id;

  if found and v_hour is not null then
    new.planned_start_hour_number := v_hour;
    new.planned_start_minute := v_minute;
    new.planned_start_time_label :=
      lpad(v_hour::text,2,'0') || ':' || lpad(v_minute::text,2,'0');
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_race_stage_enforce_parent_start_time_v1
  ON public.race_stages;

CREATE TRIGGER trg_race_stage_enforce_parent_start_time_v1
BEFORE INSERT OR UPDATE OF
  race_id,
  planned_start_hour_number,
  planned_start_minute,
  planned_start_time_label
ON public.race_stages
FOR EACH ROW
EXECUTE FUNCTION public.race_stage_enforce_parent_start_time_v1();

CREATE OR REPLACE FUNCTION public.race_propagate_start_time_to_stages_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $function$
declare
  v_label text;
begin
  if new.planned_start_hour_number is distinct from old.planned_start_hour_number
     or coalesce(new.planned_start_minute,0) is distinct from coalesce(old.planned_start_minute,0)
     or new.planned_start_time_label is distinct from old.planned_start_time_label
  then
    if new.planned_start_hour_number is not null then
      v_label :=
        lpad(new.planned_start_hour_number::text,2,'0')
        || ':'
        || lpad(coalesce(new.planned_start_minute,0)::text,2,'0');
    else
      v_label := new.planned_start_time_label;
    end if;

    update public.race_stages stage
       set planned_start_hour_number = new.planned_start_hour_number,
           planned_start_minute = coalesce(new.planned_start_minute,0),
           planned_start_time_label = v_label,
           updated_at = clock_timestamp()
     where stage.race_id = new.id
       and not exists (
         select 1
         from public.race_stage_authoritative_runs authority
         where authority.stage_id = stage.id
       );
  end if;

  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_race_propagate_start_time_to_stages_v1
  ON public.races;

CREATE TRIGGER trg_race_propagate_start_time_to_stages_v1
AFTER UPDATE OF
  planned_start_hour_number,
  planned_start_minute,
  planned_start_time_label
ON public.races
FOR EACH ROW
EXECUTE FUNCTION public.race_propagate_start_time_to_stages_v1();

-- Repair only current/future stages that do not yet have an authoritative result.
UPDATE public.race_stages stage
   SET planned_start_hour_number = race.planned_start_hour_number,
       planned_start_minute = coalesce(race.planned_start_minute,0),
       planned_start_time_label =
         lpad(race.planned_start_hour_number::text,2,'0')
         || ':'
         || lpad(coalesce(race.planned_start_minute,0)::text,2,'0'),
       updated_at = clock_timestamp()
  FROM public.races race
 WHERE race.id = stage.race_id
   AND race.planned_start_hour_number IS NOT NULL
   AND stage.stage_date >= public.get_current_game_timestamp()::date
   AND NOT EXISTS (
     SELECT 1
     FROM public.race_stage_authoritative_runs authority
     WHERE authority.stage_id = stage.id
   )
   AND (
     stage.planned_start_hour_number IS DISTINCT FROM race.planned_start_hour_number
     OR coalesce(stage.planned_start_minute,0) IS DISTINCT FROM coalesce(race.planned_start_minute,0)
     OR stage.planned_start_time_label IS DISTINCT FROM (
       lpad(race.planned_start_hour_number::text,2,'0')
       || ':'
       || lpad(coalesce(race.planned_start_minute,0)::text,2,'0')
     )
   );

COMMENT ON FUNCTION public.race_stage_planned_start_game_at_v1(uuid) IS
'Canonical race-stage start timestamp. Uses parent race numeric hour/minute first, stage numeric values only as fallback, and legacy text labels only when numeric schedule data is absent.';

COMMENT ON FUNCTION public.race_stage_enforce_parent_start_time_v1() IS
'Keeps unpublished stage numeric and text start-time fields aligned to the parent race canonical schedule.';

COMMENT ON FUNCTION public.race_propagate_start_time_to_stages_v1() IS
'Propagates parent race start-time edits to unpublished stages, including the display label, so UI and lifecycle use one schedule.';
