-- Reconcile January-locked, unstarted editions that were held only by the
-- old two-route gate. Existing selections, races and ranking snapshots are
-- excluded. The planner picks an eligible host-country source and valid climate
-- windows; it may reuse the same source for heats and the final.
WITH plans AS (
  SELECT e.id, p.plan,
    CASE WHEN coalesce(e.qualification_heat_count,0)>0
      THEN nullif(p.plan->>'qualification_window_start_date','')::date
      ELSE nullif(p.plan->>'final_date','')::date END AS first_event
  FROM public.national_championship_editions e
  CROSS JOIN LATERAL (
    SELECT public.national_championship_schedule_plan_v2(
      e.country_code,e.season_number,e.eligible_count
    ) AS plan
  ) p
  WHERE e.season_number=(SELECT season_number FROM public.game_state WHERE id=true)
    AND e.discipline='road'
    AND e.status='planned'
    AND e.schedule_draw_status='locked'
    AND e.route_status='single_route_only'
    AND NOT EXISTS (SELECT 1 FROM public.national_championship_entries en WHERE en.edition_id=e.id)
    AND NOT EXISTS (SELECT 1 FROM public.national_championship_ranking_snapshots sn WHERE sn.edition_id=e.id)
),
ready AS (
  SELECT id,plan,first_event
  FROM plans
  WHERE plan->>'status'='ready'
    AND first_event IS NOT NULL
    AND plan->>'final_source_stage_id' IS NOT NULL
    AND plan->>'qualification_source_stage_id' IS NOT NULL
)
UPDATE public.national_championship_editions e
SET qualification_window_start_date=nullif(p.plan->>'qualification_window_start_date','')::date,
    qualification_window_end_date=nullif(p.plan->>'qualification_window_end_date','')::date,
    final_window_start_date=nullif(p.plan->>'final_window_start_date','')::date,
    final_window_end_date=nullif(p.plan->>'final_window_end_date','')::date,
    duty_window_start_date=p.first_event,
    duty_window_end_date=CASE WHEN coalesce(e.qualification_heat_count,0)>0
      THEN nullif(p.plan->>'qualification_window_end_date','')::date
      ELSE nullif(p.plan->>'final_date','')::date END,
    qualification_date=nullif(p.plan->>'qualification_date','')::date,
    final_date=nullif(p.plan->>'final_date','')::date,
    ranking_snapshot_date=p.first_event-cfg.ranking_freeze_lead_days,
    participation_decision_deadline=p.first_event-cfg.participation_decision_lead_days,
    final_participation_decision_deadline=nullif(p.plan->>'final_date','')::date-7,
    climate_source_country_code=p.plan->>'climate_source_country_code',
    climate_week_of_year=nullif(p.plan->>'week_of_year','')::int,
    climate_expected_max_temp_c=nullif(p.plan->>'expected_max_temp_c','')::numeric,
    climate_status='ready',
    route_status='ready',
    qualification_source_stage_id=(p.plan->>'qualification_source_stage_id')::uuid,
    final_source_stage_id=(p.plan->>'final_source_stage_id')::uuid,
    updated_at=now()
FROM ready p
CROSS JOIN public.national_championship_config cfg
WHERE e.id=p.id
  AND cfg.id=true
  AND e.status='planned'
  AND e.route_status='single_route_only'
RETURNING e.country_code,e.final_date,e.ranking_snapshot_date,e.qualification_source_stage_id=e.final_source_stage_id AS reused_source;
