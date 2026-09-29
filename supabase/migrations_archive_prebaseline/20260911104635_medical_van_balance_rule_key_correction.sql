-- Correct the Medical Van balance against the effect-key variants that are
-- actually stored in the current production catalogue.
update public.race_plan_effect_rules
set effect_value = case
  when source_level = 1 and effect_key = 'medical_response_pct' then 2
  when source_level = 1 and effect_key = 'minor_injury_risk_reduction_pct' then -1
  when source_level = 1 and effect_key = 'post_stage_recovery_pct' then 1

  when source_level = 2 and effect_key = 'medical_response_pct' then 3
  when source_level = 2 and effect_key = 'minor_injury_risk_reduction_pct' then -2
  when source_level = 2 and effect_key = 'hydration_support_pct' then 2
  when source_level = 2 and effect_key = 'post_stage_recovery_pct' then 2

  when source_level = 3 and effect_key = 'medical_response_pct' then 4
  when source_level = 3 and effect_key = 'minor_injury_risk_reduction_pct' then -4
  when source_level = 3 and effect_key = 'heat_hydration_support_pct' then 4
  when source_level = 3 and effect_key = 'post_stage_recovery_pct' then 4
  else effect_value
end,
updated_at = clock_timestamp()
where source_type = 'asset'
  and source_key = 'medical_van'
  and source_level in (1,2,3)
  and effect_key in (
    'medical_response_pct',
    'minor_injury_risk_reduction_pct',
    'hydration_support_pct',
    'heat_hydration_support_pct',
    'post_stage_recovery_pct'
  );