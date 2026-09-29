update public.infrastructure_facility_upgrade_config
set effect_summary = trim(regexp_replace(
  effect_summary,
  ';\s*applies club-wide to First Team and U23\.?',
  '',
  'gi'
))
where effect_summary ~* 'applies club-wide to First Team and U23';
