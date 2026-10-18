-- Give managers a non-mutating, authenticated scouting-range preflight.
-- Does not reveal private rider attributes or bypass the existing scouting limits.
create or replace function public.get_youth_direct_scout_eligibility_v1(p_youth_rider_id uuid)
returns jsonb language plpgsql stable security definer
set search_path to 'public','private','auth','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();
  v_home text;
  v_target text;
  v_current text;
  v_required text;
  v_found boolean:=false;
  v_mine boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select c.country_code,coalesce(b.scouting_range,'local') into v_home,v_current
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    left join public.youth_academy_season_budgets b on b.academy_id=a.id
      and b.season_number=public.get_current_season_number()
    where c.owner_user_id=v_user and c.deleted_at is null
      and a.is_active=true order by a.created_at limit 1;
  select r.country_code,exists(
    select 1 from public.youth_academies a join public.clubs c on c.id=a.club_id
    where a.id=r.academy_id and c.owner_user_id=v_user
  ) into v_target,v_mine
    from public.youth_riders r where r.id=p_youth_rider_id and r.status='academy';
  v_found:=found;
  if not v_found or v_home is null then
    return jsonb_build_object('available',false,'can_scout',false);
  end if;
  for v_required in select range_value from (
    values('local',1),('regional',2),('continental',3),('world',4)
  ) as levels(range_value,sort_order) order by sort_order loop
    if private.youth_country_allowed_v1(v_home,v_target,v_required) then exit; end if;
  end loop;
  return jsonb_build_object(
    'available',true,'can_scout',not v_mine and
      private.youth_country_allowed_v1(v_home,v_target,v_current),
    'own_rider',v_mine,'home_country',v_home,'target_country',v_target,
    'current_range',v_current,'required_range',v_required
  );
end;
$function$;
revoke all on function public.get_youth_direct_scout_eligibility_v1(uuid) from public;
grant execute on function public.get_youth_direct_scout_eligibility_v1(uuid) to authenticated;
