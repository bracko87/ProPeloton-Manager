CREATE OR REPLACE FUNCTION control_center_private.build_admin_analytics_dashboard_snapshot_v2()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'control_center_private'
AS $function$
  select jsonb_build_object(
    'generated_at', now(),
    'dashboard', coalesce(public.get_admin_analytics_dashboard_v1(30), '{}'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION finance.is_club_member_or_owner(p_club_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1 from public.clubs c
    where c.id = p_club_id and c.owner_user_id = p_user_id
  )
  or exists (
    select 1 from public.club_memberships cm
    where cm.club_id = p_club_id and cm.user_id = p_user_id
  );
$function$
;

CREATE OR REPLACE FUNCTION finance.can_spend_from_club(p_club_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
      and c.owner_user_id = p_user_id
  )
  or exists (
    select 1
    from public.club_memberships cm
    where cm.club_id = p_club_id
      and cm.user_id = p_user_id
      and cm.role in ('owner','finance','treasurer')
  );
$function$
;

CREATE OR REPLACE FUNCTION private.national_association_eligible_main_club_v1(p_user_id uuid)
 RETURNS TABLE(club_id uuid, country_code text, club_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id,upper(c.country_code),c.name
  from public.clubs c
  where c.owner_user_id=p_user_id
    and c.club_type='main'
    and coalesce(c.is_ai,false)=false
    and coalesce(c.is_active,true)=true
    and c.deleted_at is null
    and coalesce(c.inactivity_status,'active')='active'
  order by c.created_at asc,c.id
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION private.national_association_member_is_eligible_v1(p_association_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1
    from public.national_associations a
    join public.national_association_memberships m
      on m.association_id=a.id
     and m.user_id=p_user_id
     and m.status='active'
    join public.clubs c
      on c.id=m.club_id
     and c.owner_user_id=p_user_id
     and c.club_type='main'
     and coalesce(c.is_ai,false)=false
     and coalesce(c.is_active,true)=true
     and c.deleted_at is null
     and coalesce(c.inactivity_status,'active')='active'
    where a.id=p_association_id
      and upper(c.country_code)=a.country_code
  );
$function$
;

CREATE OR REPLACE FUNCTION private.national_association_active_member_count_v1(p_association_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer
  from public.national_association_memberships m
  join public.national_associations a on a.id=m.association_id
  join public.clubs c
    on c.id=m.club_id
   and c.owner_user_id=m.user_id
   and c.club_type='main'
   and coalesce(c.is_ai,false)=false
   and coalesce(c.is_active,true)=true
   and c.deleted_at is null
   and coalesce(c.inactivity_status,'active')='active'
  where m.association_id=p_association_id
    and m.status='active'
    and upper(c.country_code)=a.country_code;
$function$
;

CREATE OR REPLACE FUNCTION private.current_national_coach_context_v1(p_user_id uuid)
 RETURNS TABLE(term_id uuid, association_id uuid, country_code text, season_number integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    t.id,
    t.association_id,
    a.country_code,
    t.season_number
  from public.national_coach_terms t
  join public.national_associations a
    on a.id=t.association_id
   and a.status='active'
  join public.game_state gs
    on gs.id=true
   and gs.season_number=t.season_number
  where t.user_id=p_user_id
    and t.status='active'
    and private.national_association_member_is_eligible_v1(
      t.association_id,
      p_user_id
    )
  order by
    case t.term_kind when 'elected' then 0 when 'replacement' then 1 else 2 end,
    t.created_at desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION private.national_team_race_type_for_day_v1(p_race_day integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_race_day
    when 1 then 'team_time_trial'
    when 2 then 'flat_road_race'
    when 3 then 'hilly_mountain_road_race'
    else null
  end;
$function$
;

CREATE OR REPLACE FUNCTION private.nations_group_count_for_field_v1(p_entrants integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select greatest(
    1,
    least(
      greatest(1,ceil(p_entrants::numeric/6.0)::integer),
      greatest(1,ceil(p_entrants::numeric/8.0)::integer)
    )
  );
$function$
;

