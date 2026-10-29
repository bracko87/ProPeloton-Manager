CREATE OR REPLACE FUNCTION public.is_developing_rider_race_eligible_v1(p_rider_id uuid, p_club_id uuid, p_effective_game_date date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type text;
  v_birth date;
  v_effective date:=coalesce(p_effective_game_date,public.get_current_game_date_date());
  v_window_end date;
begin
  select c.club_type,r.birth_date into v_type,v_birth
  from public.clubs c cross join public.riders r
  where c.id=p_club_id and r.id=p_rider_id;
  if not found then return false; end if;
  if coalesce(v_type,'main') <> 'developing' then return true; end if;
  -- A squad that was purchased for the CURRENT game season remains
  -- eligible to finish its already-scheduled races after Premium lapses.
  -- Management and NEW race preparation are still Premium-locked.
  if not exists(
    select 1 from public.developing_team_season_access a
    join public.clubs dev on dev.id=a.developing_club_id
    where a.developing_club_id=p_club_id and dev.is_active and dev.deleted_at is null
      and a.access_status='active'
      and a.active_season=coalesce(public.get_current_season_number(),1)
      and a.expires_after_season>=coalesce(public.get_current_season_number(),1)
  ) then return false; end if;
  if v_birth is null or v_effective is null then return false; end if;
  if public.get_age_years_on_game_date(v_birth) < 24 and v_effective < (v_birth+interval '24 years')::date then return true; end if;
  select w.required_window_end into v_window_end from public.get_developing_rider_age_out_window_v1(v_birth) w;
  return v_effective <= v_window_end;
end;
$function$;
