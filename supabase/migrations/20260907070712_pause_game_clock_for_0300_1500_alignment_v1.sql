do $$
begin
  perform pg_advisory_xact_lock(hashtext('public.run_daily_tick_if_needed')::bigint);

  update public.game_clock_config
  set is_paused = true,
      base_real_at = clock_timestamp()
  where id = true
    and is_paused is distinct from true;

  update public.game_state
  set is_paused = true,
      last_advanced_at = clock_timestamp()
  where id = true
    and is_paused is distinct from true;
end
$$;
