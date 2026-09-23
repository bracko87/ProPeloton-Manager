begin;

create or replace function public.normalize_contiguous_race_stage_calendar_v1(
  p_race_id uuid,
  p_force boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_start_date date;
  v_end_date date;
  v_stage_count integer;
  v_race_metadata jsonb;
  v_row_count integer;
  v_distinct_stage_numbers integer;
  v_min_stage_number integer;
  v_max_stage_number integer;
  v_changed integer := 0;
begin
  select
    r.start_date::date,
    r.end_date::date,
    r.stage_count,
    coalesce(r.metadata, '{}'::jsonb)
  into
    v_start_date,
    v_end_date,
    v_stage_count,
    v_race_metadata
  from public.races r
  where r.id = p_race_id;

  if not found
     or v_start_date is null
     or v_end_date is null
     or coalesce(v_stage_count, 0) <= 1
  then
    return 0;
  end if;

  -- Exactly one stage per day: use native date arithmetic so leap days are valid.
  if v_stage_count <> (v_end_date - v_start_date + 1) then
    return 0;
  end if;

  -- Escape hatch for an intentionally unusual split-stage schedule.
  if lower(coalesce(v_race_metadata->>'allow_same_day_stages', 'false'))
       in ('true', '1', 'yes', 'on')
  then
    return 0;
  end if;

  select
    count(*)::integer,
    count(distinct s.stage_number)::integer,
    min(s.stage_number),
    max(s.stage_number)
  into
    v_row_count,
    v_distinct_stage_numbers,
    v_min_stage_number,
    v_max_stage_number
  from public.race_stages s
  where s.race_id = p_race_id;

  if v_row_count <> v_stage_count
     or v_distinct_stage_numbers <> v_stage_count
     or v_min_stage_number <> 1
     or v_max_stage_number <> v_stage_count
  then
    return 0;
  end if;

  -- Future imports self-heal before authoritative calculations exist.
  if not p_force
     and exists (
       select 1
       from public.race_stage_authoritative_runs authority
       join public.race_stages stage on stage.id = authority.stage_id
       where stage.race_id = p_race_id
     )
  then
    return 0;
  end if;

  update public.race_stages stage
  set
    stage_date = v_start_date + (stage.stage_number - 1),
    metadata = jsonb_set(
      coalesce(stage.metadata, '{}'::jsonb),
      '{actual_stage_date}',
      to_jsonb(
        format(
          'S%s %s',
          extract(year from (v_start_date + (stage.stage_number - 1)))::integer - 1999,
          to_char(v_start_date + (stage.stage_number - 1), 'MM.DD')
        )
      ),
      true
    ),
    updated_at = clock_timestamp()
  where stage.race_id = p_race_id
    and (
      stage.stage_date is distinct from (v_start_date + (stage.stage_number - 1))
      or coalesce(stage.metadata->>'actual_stage_date', '') is distinct from
         format(
           'S%s %s',
           extract(year from (v_start_date + (stage.stage_number - 1)))::integer - 1999,
           to_char(v_start_date + (stage.stage_number - 1), 'MM.DD')
         )
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$function$;

create or replace function public.race_stage_normalize_contiguous_calendar_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.normalize_contiguous_race_stage_calendar_v1(new.race_id, false);
  return new;
end;
$function$;

drop trigger if exists trg_race_stage_normalize_contiguous_calendar_v1
  on public.race_stages;

create trigger trg_race_stage_normalize_contiguous_calendar_v1
after insert or update of race_id, stage_number, stage_date
on public.race_stages
for each row
execute function public.race_stage_normalize_contiguous_calendar_trigger_v1();

create or replace function public.race_normalize_contiguous_stage_calendar_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.normalize_contiguous_race_stage_calendar_v1(new.id, false);
  return new;
end;
$function$;

drop trigger if exists trg_race_normalize_contiguous_stage_calendar_v1
  on public.races;

create trigger trg_race_normalize_contiguous_stage_calendar_v1
after update of start_date, end_date, stage_count
on public.races
for each row
execute function public.race_normalize_contiguous_stage_calendar_trigger_v1();

-- Explicit repair of the known malformed contiguous calendars.
select public.normalize_contiguous_race_stage_calendar_v1(
  '7c6ae6aa-f343-4657-82ce-4946011b7f48'::uuid,
  true
);

select public.normalize_contiguous_race_stage_calendar_v1(
  '9f433187-ff45-4577-8bcf-325e331937a2'::uuid,
  true
);

select public.normalize_contiguous_race_stage_calendar_v1(
  '07ba1986-bca1-4aeb-a54d-c7cc4c5dc812'::uuid,
  true
);

comment on function public.normalize_contiguous_race_stage_calendar_v1(uuid, boolean) is
'Normalizes one-stage-per-day race calendars with PostgreSQL date arithmetic, including leap days. Only races whose stage_count exactly equals their inclusive date span are eligible; p_force=true is reserved for explicit repairs.';

commit;
