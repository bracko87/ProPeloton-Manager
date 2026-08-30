create or replace function public.trg_rebase_race_engine_activation_on_clock_rewind_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_season_start timestamp without time zone;
  v_rebase_target timestamp without time zone;
  v_is_canonical_full_reset boolean := false;
begin
  if new.base_game_at < old.base_game_at then
    v_season_start := make_date(
      1999 + coalesce(new.base_season, extract(year from new.base_game_at)::int - 1999),
      1,
      1
    )::timestamp;

    v_is_canonical_full_reset :=
      new.base_season = 1
      and new.base_game_at = timestamp '2000-01-01 01:00:00'
      and new.is_paused = true
      and exists (
        select 1
        from public.game_world_reset_runs r
        where r.status = 'source_frozen'
      );

    v_rebase_target := case
      when v_is_canonical_full_reset then new.base_game_at
      else v_season_start
    end;

    update public.race_engine_runtime_control_v1
    set typescript_activation_game_at = least(
          coalesce(typescript_activation_game_at, v_rebase_target),
          v_rebase_target
        ),
        updated_at = clock_timestamp(),
        notes = coalesce(notes,'') || E'\nClock rewind guard: TypeScript lifecycle activation rebased to ' || v_rebase_target::text
    where singleton_id=true
      and coalesce(typescript_lifecycle_enabled,false)=true
      and (
        typescript_activation_game_at is null
        or typescript_activation_game_at > v_rebase_target
      );
  end if;

  return new;
end;
$function$;
