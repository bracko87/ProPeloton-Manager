begin;

create or replace function public.rider_potential_headroom_multiplier_v1(
  p_rider_id uuid
)
returns numeric
language sql
stable
security definer
set search_path=public
as $function$
with rider as (
  select
    r.id,
    coalesce(r.overall,0)::numeric as overall,
    r.potential::numeric as potential,
    least(
      96::numeric,
      greatest(
        60::numeric,
        round(50::numeric + coalesce(r.potential,65)::numeric * 0.50)
      )
    ) as projected_ceiling
  from public.riders r
  where r.id=p_rider_id
)
select case
  when rider.id is null or rider.potential is null then 1.0000::numeric
  when rider.overall <= rider.projected_ceiling-15 then 1.0000
  when rider.overall <= rider.projected_ceiling-10 then 0.9000
  when rider.overall <= rider.projected_ceiling-6  then 0.7500
  when rider.overall <= rider.projected_ceiling-3  then 0.5500
  when rider.overall <= rider.projected_ceiling    then 0.3500
  when rider.overall <= rider.projected_ceiling+3  then 0.1800
  when rider.overall <= rider.projected_ceiling+6  then 0.0800
  else 0.0300
end::numeric
from rider
union all
select 1.0000::numeric
where not exists(select 1 from rider)
limit 1;
$function$;

comment on function public.rider_potential_headroom_multiplier_v1(uuid) is
'Soft career-ceiling development factor. Projected ceiling is derived from the game Potential scale (50 + 0.5*Potential, clamped 60..96) rather than treating Potential as literal Overall; growth slows near/above that projected ceiling.';

create or replace function public.get_race_plan_bonus_preview_v2(
  p_club_id uuid,
  p_staff_ids uuid[] default '{}'::uuid[],
  p_asset_assignments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_base jsonb;
  v_staff jsonb:='[]'::jsonb;
  v_live_staff jsonb:='[]'::jsonb;
begin
  v_base:=public.get_race_plan_bonus_preview_v1(
    p_club_id,
    coalesce(p_staff_ids,'{}'::uuid[]),
    coalesce(p_asset_assignments,'[]'::jsonb)
  );

  select coalesce(jsonb_agg(value),'[]'::jsonb)
  into v_staff
  from jsonb_array_elements(coalesce(v_base->'staff','[]'::jsonb))
  where coalesce(value->>'source_key','')
        not in('sport_director','u23_head_coach','nutritionist');

  with sport_directors as (
    select
      cs.id,cs.role_type,cs.staff_name,
      greatest(0,least(100,
        coalesce(cs.expertise,50)*.35+
        coalesce(cs.experience,50)*.15+
        coalesce(cs.potential,50)*.10+
        coalesce(cs.leadership,50)*.20+
        coalesce(cs.efficiency,50)*.15+
        coalesce(cs.loyalty,50)*.05
      )) as quality,
      public.get_staff_assignment_availability_factor(
        cs.id,public.get_current_game_date_date()
      ) as availability
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.id=any(coalesce(p_staff_ids,'{}'::uuid[]))
      and cs.is_active=true
      and cs.role_type='sport_director'
  ),
  best_nutritionist as (
    select
      cs.id,cs.role_type,cs.staff_name,
      greatest(0,least(100,
        coalesce(cs.expertise,50)*.35+
        coalesce(cs.experience,50)*.10+
        coalesce(cs.potential,50)*.10+
        coalesce(cs.leadership,50)*.10+
        coalesce(cs.efficiency,50)*.25+
        coalesce(cs.loyalty,50)*.10
      )) as quality,
      public.get_staff_assignment_availability_factor(
        cs.id,public.get_current_game_date_date()
      ) as availability
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true
      and cs.role_type='nutritionist'
    order by quality desc,cs.id
    limit 1
  ),
  candidates as (
    select * from sport_directors
    union all
    select * from best_nutritionist
  ),
  rows as (
    select case
      when role_type='sport_director' then
        jsonb_build_object(
          'source_type','staff',
          'source_key','sport_director',
          'source_label','Sport Director: '||staff_name,
          'effects',jsonb_build_array(
            jsonb_build_object(
              'effect_key','tactical_support_pct',
              'label','Race tactics & execution',
              'value','+'||
                round(
                  greatest(0,least(8,(quality-35)*.12))
                  *greatest(0,least(1,availability)),
                  1
                )::text||'%'
            )
          )
        )
      when role_type='nutritionist' then
        jsonb_build_object(
          'source_type','staff',
          'source_key','nutritionist',
          'source_label','Nutritionist: '||staff_name,
          'effects',jsonb_build_array(
            jsonb_build_object(
              'effect_key','feeding_support_pct',
              'label','Race feeding support',
              'value','+'||round(
                greatest(0,least(3.5,(quality-35)*.055))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','hydration_support_bonus_pct',
              'label','Hydration / fatigue control',
              'value','+'||round(
                greatest(0,least(4,(quality-35)*.065))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','recovery_comfort_bonus_pct',
              'label','Post-stage nutrition recovery',
              'value','+'||round(
                greatest(0,least(4,(quality-35)*.065))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            ),
            jsonb_build_object(
              'effect_key','minor_injury_risk_reduction_pct',
              'label','Health protection',
              'value','-'||round(
                greatest(0,least(2.5,(quality-35)*.040))
                *greatest(0,least(1,availability)),1
              )::text||'%'
            )
          )
        )
      else null
    end as row_json
    from candidates
  )
  select coalesce(
    jsonb_agg(row_json) filter(where row_json is not null),
    '[]'::jsonb
  )
  into v_live_staff
  from rows;

  return jsonb_set(
    coalesce(v_base,'{}'::jsonb),
    '{staff}',
    v_staff||v_live_staff,
    true
  );
end;
$function$;

commit;
