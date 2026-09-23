begin;

create or replace function public.get_club_squad_season_dashboard_v1(
  p_club_id uuid,
  p_season_year integer default 2000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, finance, auth, pg_temp
as $$
declare
  v_payload jsonb;
  v_is_premium boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '28000';
  end if;

  if p_club_id is null then
    raise exception 'Club id is required.' using errcode = '22023';
  end if;

  if not finance.is_club_member_or_owner(p_club_id, auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;

  v_payload := public._get_club_squad_season_dashboard_v1_internal(
    p_club_id,
    p_season_year
  );

  select coalesce(status.is_premium, false)
  into v_is_premium
  from public.get_my_premium_status() status
  limit 1;

  if v_is_premium then
    return v_payload;
  end if;

  return jsonb_build_object(
    'seasonTrend', '[]'::jsonb,
    'podiumChart', '[]'::jsonb,
    'summary', coalesce(
      v_payload -> 'summary',
      jsonb_build_object(
        'wins', 0,
        'podiums', 0,
        'top10s', 0,
        'bestGC', 0
      )
    ),
    'lastTeamRace', coalesce(v_payload -> 'lastTeamRace', '{}'::jsonb),
    'nextRaceSelection', coalesce(v_payload -> 'nextRaceSelection', '{}'::jsonb),
    'raceTypeSnapshot', '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_club_squad_season_dashboard_v1(uuid, integer)
  from public, anon;

grant execute on function public.get_club_squad_season_dashboard_v1(uuid, integer)
  to authenticated, service_role;

commit;
