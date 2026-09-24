begin;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.get_available_scout_staff_for_rider(uuid,uuid)'::regprocedure) into d;
  if position('team_policy_staff_quality_bonus_v1' in d)=0 then
    d:=regexp_replace(
      d,
      'cs\\.efficiency,[[:space:]]*cs\\.loyalty,',
      'least(100, cs.efficiency + public.team_policy_staff_quality_bonus_v1(v_club_id)), cs.loyalty,',
      'g'
    );
    execute d;
  end if;
end
$patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.start_rider_scout_task_v1(uuid,uuid,uuid)'::regprocedure) into d;
  if position('team_policy_staff_quality_bonus_v1' in d)=0 then
    d:=regexp_replace(
      d,
      'v_scout\\.efficiency,[[:space:]]*v_scout\\.loyalty,',
      'least(100, v_scout.efficiency + public.team_policy_staff_quality_bonus_v1(v_club_id)), v_scout.loyalty,',
      'g'
    );
    execute d;
  end if;
end
$patch$;

do $patch$
declare d text;
begin
  select pg_get_functiondef('public.get_race_plan_bonus_preview_v2(uuid,uuid[],jsonb)'::regprocedure) into d;
  if position('team_policy_staff_quality_bonus_v1' in d)=0 then
    d:=replace(
      d,
      'coalesce(cs.efficiency,50)*.15+',
      '(coalesce(cs.efficiency,50)+public.team_policy_staff_quality_bonus_v1(p_club_id))*.15+'
    );
    d:=replace(
      d,
      'coalesce(cs.efficiency,50)*.25+',
      '(coalesce(cs.efficiency,50)+public.team_policy_staff_quality_bonus_v1(p_club_id))*.25+'
    );
    execute d;
  end if;
end
$patch$;

commit;
