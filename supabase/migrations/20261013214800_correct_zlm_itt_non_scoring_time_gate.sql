-- The 7km Westkapelle ITT split is a time checkpoint, not a points sprint.
-- Preserve the marker (position, name, time, label) and the entire scoring catalogue.
-- This is idempotent; published stages and genuinely scored sprints are excluded.
update public.race_stage_profile_details d
set route_markers=jsonb_set(d.route_markers,'{1,type}',to_jsonb('time_check'::text),false),
    updated_at=clock_timestamp()
where d.stage_id='9c792088-c90c-403d-bc5d-99a43a17031e'
  and d.route_markers #>> '{1,type}'='sprint'
  and lower(d.route_markers #>> '{1,label}')='time check'
  and coalesce(jsonb_array_length(d.intermediate_sprints),0)=0
  and not exists(select 1 from public.race_stage_points p
                 where p.stage_id=d.stage_id
                   and p.point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT'))
  and not exists(select 1 from public.race_stage_authoritative_runs a
                 where a.stage_id=d.stage_id);
