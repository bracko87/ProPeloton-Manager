begin;

create or replace function public.get_overview_recent_race_results_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $function$
declare
  v_today date;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  v_today := public.get_current_game_date_date();

  if v_today is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stage_id', row_data.stage_id,
        'race_id', row_data.race_id,
        'race_name', row_data.race_name,
        'country_code', row_data.country_code,
        'stage_number', row_data.stage_number,
        'stage_count', row_data.stage_count,
        'stage_date', row_data.stage_date,
        'winner_rider_id', row_data.winner_rider_id,
        'winner_name', row_data.winner_name,
        'winner_team_id', row_data.winner_team_id,
        'winner_team_name', row_data.winner_team_name
      )
      order by row_data.stage_date desc, row_data.race_name, row_data.stage_number
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      stage.id as stage_id,
      race.id as race_id,
      race.name as race_name,
      nullif(
        coalesce(
          to_jsonb(race)->>'country_code',
          to_jsonb(race)->>'host_country_code',
          to_jsonb(race)->>'country_iso2',
          to_jsonb(race)->>'country_iso'
        ),
        ''
      ) as country_code,
      stage.stage_number,
      coalesce(race.stage_count, 1) as stage_count,
      stage.stage_date::date as stage_date,
      winner.rider_id as winner_rider_id,
      coalesce(
        nullif(winner.rider_name_snapshot, ''),
        nullif(to_jsonb(rider)->>'display_name', ''),
        nullif(to_jsonb(rider)->>'full_name', ''),
        nullif(
          trim(
            concat_ws(
              ' ',
              to_jsonb(rider)->>'first_name',
              to_jsonb(rider)->>'last_name'
            )
          ),
          ''
        ),
        winner.rider_id::text
      ) as winner_name,
      winner.team_id as winner_team_id,
      nullif(winner.team_name_snapshot, '') as winner_team_name
    from public.race_stages stage
    join public.races race
      on race.id = stage.race_id
    join public.race_stage_results winner
      on winner.stage_id = stage.id
     and winner.rank = 1
    left join public.riders rider
      on rider.id = winner.rider_id
    where stage.stage_date::date between v_today - 1 and v_today
  ) row_data;

  return v_result;
end;
$function$;

revoke all on function public.get_overview_recent_race_results_v1()
  from public, anon;

grant execute on function public.get_overview_recent_race_results_v1()
  to authenticated, service_role;

comment on function public.get_overview_recent_race_results_v1() is
'Returns all completed stage winners from the current and previous in-game day for the Overview results carousel. Available to every authenticated player; no Premium entitlement is required.';

commit;
