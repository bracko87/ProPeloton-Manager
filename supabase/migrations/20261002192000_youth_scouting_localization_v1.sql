-- Youth scouting report localization support.
-- Return stable skill codes rather than English labels; the UI translates them.

create or replace function private.youth_strengths_v1(
  p_sprint integer,
  p_climbing integer,
  p_time_trial integer,
  p_endurance integer,
  p_flat integer,
  p_recovery integer,
  p_resistance integer,
  p_race_iq integer,
  p_teamwork integer,
  p_confidence integer
)
returns jsonb
language sql
immutable
as $function$
  with skills(code,value) as (
    values
      ('sprint',p_sprint),
      ('climbing',p_climbing),
      ('time_trial',p_time_trial),
      ('endurance',p_endurance),
      ('flat',p_flat),
      ('recovery',p_recovery),
      ('resistance',p_resistance),
      ('race_iq',p_race_iq),
      ('teamwork',p_teamwork)
  ),
  ranked as (
    select code
    from skills
    order by value desc,code
    limit case when p_confidence>=78 then 3 else 2 end
  )
  select coalesce(jsonb_agg(code),'[]'::jsonb) from ranked;
$function$;
