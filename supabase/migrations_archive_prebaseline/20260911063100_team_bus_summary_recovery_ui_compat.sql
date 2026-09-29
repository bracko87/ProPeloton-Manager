-- The existing Team Bus garage card labels one_day_fatigue_reduction_pct as Rider recovery.
-- Keep the legacy return signature, but feed that card the real Recovery Support value.
create or replace function public.get_club_team_bus_garage_summary(p_club_id uuid)
returns table(
  club_id uuid,
  total_buses integer,
  max_total_buses integer,
  available_buses integer,
  assigned_buses integer,
  in_repair_buses integer,
  pending_delivery_buses integer,
  best_available_support_score numeric,
  max_event_support_score numeric,
  best_available_support_ratio numeric,
  support_tier text,
  one_day_fatigue_reduction_pct numeric,
  short_tour_fatigue_reduction_pct numeric,
  long_tour_fatigue_reduction_pct numeric,
  recovery_comfort_bonus_pct numeric,
  max_assigned_per_event integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
with allowed as (
  select 1
  from public.clubs c
  left join public.club_memberships cm
    on cm.club_id = c.id
   and cm.user_id = auth.uid()
  where c.id = p_club_id
    and (c.owner_user_id = auth.uid() or cm.user_id is not null)
  limit 1
),
cfg as (
  select
    max(max_total_quantity)::integer as max_total_buses,
    max(max_assigned_per_event)::integer as max_assigned_per_event,
    max(support_value)::numeric as best_support_value
  from public.infrastructure_asset_config
  where asset_key = 'team_bus'
),
counts as (
  select
    count(*) filter (where status <> 'sold')::integer as total_buses,
    count(*) filter (where status = 'available')::integer as available_buses,
    count(*) filter (where status = 'assigned')::integer as assigned_buses,
    count(*) filter (where status = 'in_repair')::integer as in_repair_buses
  from public.club_team_buses
  where club_id = p_club_id
),
pending as (
  select coalesce(sum(asset_quantity), 0)::integer as pending_delivery_buses
  from public.club_infrastructure_jobs
  where club_id = p_club_id
    and job_type = 'asset_delivery'
    and target_key = 'team_bus'
    and status = 'pending'
),
best_available as (
  select
    tb.asset_level,
    public.team_bus_condition_factor(tb.condition_percent) as condition_factor,
    round(tb.support_value * public.team_bus_condition_factor(tb.condition_percent), 2) as effective_support_value
  from public.club_team_buses tb
  where tb.club_id = p_club_id
    and tb.status = 'available'
    and tb.condition_percent >= 30
  order by
    (case tb.asset_level when 1 then 3 when 2 then 6 when 3 then 11 else 0 end)
      * public.team_bus_condition_factor(tb.condition_percent) desc,
    tb.asset_level desc,
    tb.condition_percent desc
  limit 1
),
score as (
  select
    p_club_id as club_id,
    coalesce(counts.total_buses, 0) as total_buses,
    coalesce(cfg.max_total_buses, 3) as max_total_buses,
    coalesce(counts.available_buses, 0) as available_buses,
    coalesce(counts.assigned_buses, 0) as assigned_buses,
    coalesce(counts.in_repair_buses, 0) as in_repair_buses,
    coalesce(pending.pending_delivery_buses, 0) as pending_delivery_buses,
    coalesce(best_available.effective_support_value, 0)::numeric as best_available_support_score,
    coalesce(cfg.best_support_value, 3.00)::numeric as max_event_support_score,
    coalesce(cfg.max_assigned_per_event, 1) as max_assigned_per_event,
    coalesce(best_available.asset_level, 0)::integer as best_level,
    coalesce(best_available.condition_factor, 0)::numeric as condition_factor
  from counts
  cross join pending
  cross join cfg
  left join best_available on true
)
select
  score.club_id,
  score.total_buses,
  score.max_total_buses,
  score.available_buses,
  score.assigned_buses,
  score.in_repair_buses,
  score.pending_delivery_buses,
  round(score.best_available_support_score, 2),
  round(score.max_event_support_score, 2),
  round(least(score.best_available_support_score / nullif(score.max_event_support_score, 0), 1), 4),
  case
    when score.best_level <= 0 then 'None'
    when score.best_level = 1 then 'Basic'
    when score.best_level = 2 then 'Strong'
    else 'Elite'
  end,
  -- Legacy field consumed by the existing Rider recovery card: return real Recovery Support.
  round((case score.best_level when 1 then 1 when 2 then 2 when 3 then 4 else 0 end) * score.condition_factor, 2),
  -- Legacy fatigue fields: return the real Fatigue Control contribution (no fake tour multiplier).
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 2 when 2 then 4 when 3 then 7 else 0 end) * score.condition_factor, 2),
  round((case score.best_level when 1 then 1 when 2 then 2 when 3 then 4 else 0 end) * score.condition_factor, 2),
  score.max_assigned_per_event
from score
where exists (select 1 from allowed);
$function$;
