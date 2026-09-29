-- Increase premium Team Car bonuses so Levels 4 and 5 remain meaningful upgrades
-- even when a club already has strong support assets.

update public.race_plan_effect_rules
set effect_value = case
  when source_level = 4 and effect_key = 'race_support_coverage_pct' then 5
  when source_level = 4 and effect_key = 'tactical_communication_pct' then 4
  when source_level = 4 and effect_key = 'incident_response_pct' then 3
  when source_level = 5 and effect_key = 'race_support_quality_pct' then 7
  when source_level = 5 and effect_key = 'tactical_communication_pct' then 5
  when source_level = 5 and effect_key = 'feeding_support_pct' then 3
  when source_level = 5 and effect_key = 'incident_response_pct' then 4
  when source_level = 5 and effect_key = 'race_fatigue_protection_pct' then -2
  else effect_value
end,
updated_at = now()
where source_type = 'asset'
  and source_key = 'team_car'
  and (
    (source_level = 4 and effect_key in (
      'race_support_coverage_pct',
      'tactical_communication_pct',
      'incident_response_pct'
    ))
    or
    (source_level = 5 and effect_key in (
      'race_support_quality_pct',
      'tactical_communication_pct',
      'feeding_support_pct',
      'incident_response_pct',
      'race_fatigue_protection_pct'
    ))
  );

update public.infrastructure_asset_config
set effect_summary = case asset_level
  when 4 then 'Race Support Coverage +5%; Tactical Communication +4%; Mechanical Response +4%; Incident Response +3%; Race Fatigue Protection -1%'
  when 5 then 'Race Support Quality +7%; Tactical Communication +5%; Feeding Support +3%; Mechanical Response +5%; Incident Response +4%; Race Fatigue Protection -2%'
  else effect_summary
end,
updated_at = now()
where asset_key = 'team_car'
  and asset_level in (4,5);
