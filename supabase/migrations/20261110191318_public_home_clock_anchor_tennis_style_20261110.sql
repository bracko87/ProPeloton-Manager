-- Isolated, read-only ProPeloton public game-clock anchor.
-- Mirrors Tennis Legacy's server-anchor + client tick approach, while using
-- ONLY ProPeloton Manager game_state and game_clock_config. No clock writes.
create or replace function public.get_public_home_clock_anchor_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'game_epoch_ms',
      (extract(epoch from (
        make_timestamp(
          1999 + gs.season_number,
          gs.month_number,
          gs.day_number,
          coalesce(gs.hour_number,0),
          coalesce(gs.minute_number,0),
          0
        ) at time zone 'UTC'
      )) * 1000)::bigint,
    'server_epoch_ms',
      (extract(epoch from statement_timestamp()) * 1000)::bigint,
    'speed_multiplier',
      case when coalesce(gs.is_paused,false) or coalesce(cfg.is_paused,false)
        then 0
        else greatest(0, least(coalesce(cfg.speed_multiplier,0),1000))
      end,
    'is_paused',
      coalesce(gs.is_paused,false) or coalesce(cfg.is_paused,false),
    'game_time_label',
      format('S%s · %s %s · %s:%s',
        gs.season_number,
        to_char(make_date(1999+gs.season_number,gs.month_number,gs.day_number),'Mon'),
        gs.day_number,
        lpad(coalesce(gs.hour_number,0)::text,2,'0'),
        lpad(coalesce(gs.minute_number,0)::text,2,'0')
      )
  )
  from public.game_state gs
  left join public.game_clock_config cfg on cfg.id = true
  where gs.id=true
  limit 1;
$function$;
revoke all on function public.get_public_home_clock_anchor_v1() from public,anon,authenticated;
grant execute on function public.get_public_home_clock_anchor_v1() to anon,authenticated;
comment on function public.get_public_home_clock_anchor_v1()
is 'Read-only public clock anchor for display: own game state + configured speed, no player data or changes to game time';
