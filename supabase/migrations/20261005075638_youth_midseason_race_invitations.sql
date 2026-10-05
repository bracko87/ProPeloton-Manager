CREATE OR REPLACE FUNCTION public.ensure_youth_competition_memberships_v1(p_season integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_season integer:=coalesce(p_season,public.get_current_season_number(),1);
begin
  if not exists(
    select 1 from public.youth_academy_competition_memberships
    where season_number=v_season
  ) then
    with ranked as (
      select a.id academy_id,
        row_number() over(
          order by private.youth_academy_strength_v1(a.id) desc,a.id
        )::integer rn
      from public.youth_academies a
      where a.is_active=true
    )
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select v_season,academy_id,'world','WORLD',rn,
      jsonb_build_object('assignment','initial_strength_top_16')
    from ranked
    where rn<=16;

    with remaining as (
      select a.id academy_id,
        private.youth_continental_division_for_country_v1(c.country_code) division_code,
        private.youth_academy_strength_v1(a.id) strength
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active=true
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=v_season and m.academy_id=a.id
        )
    ),
    ranked as (
      select r.*,
        row_number() over(
          partition by division_code order by strength desc,academy_id
        )::integer rn
      from remaining r
    )
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select v_season,academy_id,'continental',division_code,rn,
      jsonb_build_object('assignment','initial_continental_top_8')
    from ranked
    where rn<=8;

    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select
      v_season,a.id,'regional',
      coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER'),
      null,
      jsonb_build_object('assignment','initial_regional')
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active=true
      and not exists(
        select 1 from public.youth_academy_competition_memberships m
        where m.season_number=v_season and m.academy_id=a.id
      );
  end if;

  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,metadata
  )
  select
    v_season,a.id,'regional',
    coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER'),
    jsonb_build_object('assignment','midseason_new_academy')
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where a.is_active=true
    and not exists(
      select 1 from public.youth_academy_competition_memberships m
      where m.season_number=v_season and m.academy_id=a.id
    )
  on conflict(season_number,academy_id) do nothing;

  -- New academies receive the same home-division opportunities as season-start academies.
  -- Do not redraw the fixed World/Continental pools or change existing invitation responses.
  insert into public.youth_race_invitations(race_id,academy_id,invitation_type,status,invited_on,response_deadline,priority_score,metadata)
  select r.id,a.id,'regional_local','pending',public.get_current_game_date_date(),r.invitation_response_deadline,
    50+private.youth_deterministic_fraction_v1(r.id::text||a.id::text||'regional_invite')*5,
    jsonb_build_object('source','midseason_home_regional_division')
  from public.youth_academies a join public.clubs c on c.id=a.club_id
  join public.youth_races r on r.season_number=v_season and r.competition_class='regional'
    and r.division_code=public.get_amateur_division_for_country(c.country_code)
  where a.is_active and c.deleted_at is null and r.status='scheduled' and r.race_date>public.get_current_game_date_date()
  on conflict(race_id,academy_id) do nothing;

  return jsonb_build_object(
    'season_number',v_season,
    'world',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=v_season and competition_class='world'
    ),
    'continental_west',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=v_season and division_code='CONTINENTAL_WEST'
    ),
    'continental_east',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=v_season and division_code='CONTINENTAL_EAST'
    ),
    'regional',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=v_season and competition_class='regional'
    )
  );
end;
$function$
;
select public.ensure_youth_competition_memberships_v1(public.get_current_season_number());
