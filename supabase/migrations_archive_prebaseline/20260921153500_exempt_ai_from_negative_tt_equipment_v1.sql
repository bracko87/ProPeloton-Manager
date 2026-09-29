-- AI teams do not participate in the player-facing equipment-management loop.
-- On TT/prologue/TTT stages they must therefore never receive a negative
-- sporting modifier merely because no TT-specific equipment is assigned.
-- User-controlled teams keep the existing positive/negative equipment rules.

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid
  into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'race_engine_get_stage_phase9_inputs_v1'
  order by p.oid desc
  limit 1;

  if v_oid is null then
    raise exception 'race_engine_get_stage_phase9_inputs_v1 not found';
  end if;

  v_def := replace(pg_get_functiondef(v_oid), E'\r\n', E'\n');

  v_new := replace(
    v_def,
    $old$greatest(
      -5::numeric,
      least(
        5::numeric,
        coalesce(
          nullif(source.weighted_bonuses ->> source.stage_bonus_key, '')::numeric,
          0
        ) * 5
      )
    ) as equipment_performance_bonus_points,$old$,
    $new$case
      when source.stage_bonus_key = 'time_trial_bonus_pct'
       and exists (
         select 1
         from public.clubs club
         where club.id = source.team_id
           and coalesce(club.is_ai, false)
       )
      then greatest(
        0::numeric,
        greatest(
          -5::numeric,
          least(
            5::numeric,
            coalesce(
              nullif(source.weighted_bonuses ->> source.stage_bonus_key, '')::numeric,
              0
            ) * 5
          )
        )
      )
      else greatest(
        -5::numeric,
        least(
          5::numeric,
          coalesce(
            nullif(source.weighted_bonuses ->> source.stage_bonus_key, '')::numeric,
            0
          ) * 5
        )
      )
    end as equipment_performance_bonus_points,$new$
  );

  if v_new = v_def then
    raise exception 'AI TT equipment exemption patch point not found';
  end if;

  execute v_new;
end $$;
