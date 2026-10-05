CREATE OR REPLACE FUNCTION public.sync_youth_scheduled_race_invitations_v2(p_season integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  gd date:=public.get_current_game_date_date();
  del_count integer:=0;
  ins_count integer:=0;
begin
  perform public.ensure_youth_competition_memberships_v1(s);

  update public.youth_races r
  set division_code=private.youth_regional_division_for_country_v1(r.host_country_code),
      entry_cost=500,
      min_teams=6,
      target_teams=private.youth_race_target_teams_v1(r.competition_class,r.team_limit),
      updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='regional';

  update public.youth_races r
  set team_limit=16,division_code='WORLD',entry_cost=500,min_teams=6,
      target_teams=16,updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='world';

  update public.youth_races r
  set team_limit=20,entry_cost=500,min_teams=6,target_teams=12,updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='continental';

  delete from public.youth_race_invitations i
  using public.youth_races r
  where r.id=i.race_id and r.season_number=s and r.status='scheduled' and r.race_date>gd
    and not exists(
      select 1 from public.youth_race_entries e
      where e.race_id=i.race_id and e.academy_id=i.academy_id
        and e.status in ('entered','completed')
    )
    and not exists(
      select 1
      from public.youth_academy_competition_memberships m
      where m.season_number=s and m.academy_id=i.academy_id
        and (
          (r.competition_class='world' and m.competition_class='world')
          or
          (r.competition_class='continental' and (
            (m.competition_class='continental' and m.division_code=r.division_code)
            or
            (m.competition_class='regional'
             and private.youth_continental_division_for_regional_v1(m.division_code)=r.division_code)
          ))
          or
          (r.competition_class='regional'
           and m.competition_class='regional'
           and m.division_code=r.division_code)
        )
    );
  get diagnostics del_count=row_count;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,priority_score,metadata
  )
  select
    r.id,
    m.academy_id,
    case
      when r.competition_class='world' then 'world_class'
      when r.competition_class='continental' and m.competition_class='continental' then 'continental_pool'
      when r.competition_class='continental' then 'wildcard'
      else 'regional_local'
    end,
    'pending',
    greatest(gd,r.race_date-21),
    r.race_date-7,
    (
      case
        when public.get_amateur_division_for_country(c.country_code)
           = public.get_amateur_division_for_country(r.host_country_code)
        then case r.competition_class when 'regional' then 100 when 'continental' then 55 else 0 end
        else 0
      end
      +case when m.competition_class=r.competition_class then 35 else 5 end
      +greatest(0,1000-coalesce(m.seed_rank,500))*0.05
      +private.youth_academy_strength_v1(m.academy_id)*0.01
    )::numeric,
    jsonb_build_object(
      'source','youth_hierarchy_geo_v3',
      'host_market',public.get_amateur_division_for_country(r.host_country_code),
      'academy_market',public.get_amateur_division_for_country(c.country_code),
      'local_market',
        public.get_amateur_division_for_country(c.country_code)
        =public.get_amateur_division_for_country(r.host_country_code)
    )
  from public.youth_races r
  join public.youth_academy_competition_memberships m
    on m.season_number=s
   and (
      (r.competition_class='world' and m.competition_class='world')
      or
      (r.competition_class='continental' and (
        (m.competition_class='continental' and m.division_code=r.division_code)
        or
        (m.competition_class='regional'
         and private.youth_continental_division_for_regional_v1(m.division_code)=r.division_code)
      ))
      or
      (r.competition_class='regional'
       and m.competition_class='regional'
       and m.division_code=r.division_code)
   )
  join public.youth_academies a on a.id=m.academy_id and a.is_active
  join public.clubs c on c.id=a.club_id and c.deleted_at is null
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
  on conflict(race_id,academy_id) do nothing;
  get diagnostics ins_count=row_count;

  perform public.ensure_youth_race_runtime_for_season_v1(s);

  return jsonb_build_object(
    'season_number',s,
    'obsolete_invitations_removed',del_count,
    'invitations_added',ins_count
  );
end;
$function$;
