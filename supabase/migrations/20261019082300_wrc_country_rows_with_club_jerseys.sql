-- One World Road Championship country slot per National Road Championship.
-- Confirmed entrants receive a current-club jersey; countries awaiting a champion
-- retain their greyed-out reserved place. No race results or invitations altered.
create or replace function public.get_world_road_championship_expected_field_v1(p_race_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'country_code', nc.country_code,
      'national_final_date', nc.final_date,
      'champion_rider_id', nc.champion_rider_id,
      'champion_name', nc.champion_name_snapshot,
      'champion_club_id', nc.champion_club_id,
      'champion_club_name', nc.champion_club_name_snapshot,
      'champion_jersey_url',
        case when nc.champion_club_id is not null
             then public.club_jersey_url_v1(nc.champion_club_id)
             else null end,
      'entry_status', we.entry_status,
      'participation_decision', we.participation_decision,
      'final_participation_decision', we.final_participation_decision,
      'national_status', nc.status
    ) order by nc.country_code
  ), '[]'::jsonb)
  from public.world_road_championship_editions wc
  join public.national_championship_editions nc
    on nc.season_number=wc.season_number and nc.discipline='road'
  left join public.world_road_championship_entries we
    on we.edition_id=wc.id and we.source_national_edition_id=nc.id
  where wc.race_id=p_race_id
    and exists(
      select 1 from public.races r
      where r.id=p_race_id
        and (
          r.metadata->>'world_road_championship'='true'
          or r.name='World Road Championship Grand Finale'
        )
    );
$function$;

revoke all on function public.get_world_road_championship_expected_field_v1(uuid) from public;
grant execute on function public.get_world_road_championship_expected_field_v1(uuid) to authenticated;
