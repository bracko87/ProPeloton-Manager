create table if not exists public.race_finish_line_point_reconciliation_audit_v1 (
  run_key text not null,
  point_id uuid not null references public.race_stage_points(id) on delete cascade,
  stage_id uuid not null references public.race_stages(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  point_type text not null,
  before_rows jsonb not null default '[]'::jsonb,
  after_rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_key, point_id)
);

create table if not exists public.race_report_event_compaction_audit_v1 (
  run_key text not null,
  stage_id uuid not null references public.race_stages(id) on delete cascade,
  before_crack_event_count integer not null,
  after_crack_event_count integer not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_key, stage_id)
);

alter table public.race_finish_line_point_reconciliation_audit_v1 enable row level security;
alter table public.race_report_event_compaction_audit_v1 enable row level security;

create temporary table tmp_finish_line_points on commit drop as
select
  rs.id as stage_id,
  rs.race_id,
  rs.stage_number,
  rs.stage_date,
  rs.distance_km,
  a.simulation_run_id,
  p.id as point_id,
  p.point_type,
  p.points_scheme,
  p.time_bonus_seconds
from public.race_stages rs
join public.race_stage_authoritative_runs a on a.stage_id=rs.id
join public.race_stage_points p on p.stage_id=rs.id
where p.point_type <> 'FINISH'
  and abs(p.km_from_start-rs.distance_km) <= 0.25;

create temporary table tmp_affected_races on commit drop as
select race_id,min(stage_number) as earliest_stage_number
from tmp_finish_line_points
group by race_id;

insert into public.race_finish_line_point_reconciliation_audit_v1(
  run_key,point_id,stage_id,race_id,point_type,before_rows
)
select
  'finish_line_points_20260920_v1',
  fp.point_id,
  fp.stage_id,
  fp.race_id,
  fp.point_type,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rider_id',pr.rider_id,
        'team_id',pr.team_id,
        'rank',pr.rank,
        'points_awarded',pr.points_awarded,
        'bonus_seconds_awarded',pr.bonus_seconds_awarded,
        'rider_name_snapshot',pr.rider_name_snapshot,
        'team_name_snapshot',pr.team_name_snapshot
      )
      order by pr.rank,pr.rider_id
    ) filter(where pr.id is not null),
    '[]'::jsonb
  )
from tmp_finish_line_points fp
left join public.race_stage_point_results pr on pr.point_id=fp.point_id
group by fp.point_id,fp.stage_id,fp.race_id,fp.point_type
on conflict(run_key,point_id) do nothing;

delete from public.race_stage_point_results pr
using tmp_finish_line_points fp
where pr.point_id=fp.point_id;

insert into public.race_stage_point_results(
  race_id,stage_id,point_id,rider_id,team_id,rank,
  points_awarded,bonus_seconds_awarded,
  rider_name_snapshot,team_name_snapshot,created_at
)
select
  fp.race_id,
  fp.stage_id,
  fp.point_id,
  sr.rider_id,
  sr.team_id,
  sr.rank,
  coalesce((fp.points_scheme ->> (sr.rank-1))::integer,0),
  coalesce((fp.time_bonus_seconds ->> (sr.rank-1))::integer,0),
  sr.rider_name_snapshot,
  sr.team_name_snapshot,
  clock_timestamp()
from tmp_finish_line_points fp
join public.race_stage_results sr
  on sr.stage_id=fp.stage_id
 and lower(sr.status)='finished'
 and sr.rank is not null
where
  coalesce((fp.points_scheme ->> (sr.rank-1))::integer,0) <> 0
  or coalesce((fp.time_bonus_seconds ->> (sr.rank-1))::integer,0) <> 0;

update public.race_finish_line_point_reconciliation_audit_v1 audit
set after_rows = q.rows
from (
  select
    fp.point_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rider_id',pr.rider_id,
          'team_id',pr.team_id,
          'rank',pr.rank,
          'points_awarded',pr.points_awarded,
          'bonus_seconds_awarded',pr.bonus_seconds_awarded,
          'rider_name_snapshot',pr.rider_name_snapshot,
          'team_name_snapshot',pr.team_name_snapshot
        )
        order by pr.rank,pr.rider_id
      ) filter(where pr.id is not null),
      '[]'::jsonb
    ) as rows
  from tmp_finish_line_points fp
  left join public.race_stage_point_results pr on pr.point_id=fp.point_id
  group by fp.point_id
) q
where audit.run_key='finish_line_points_20260920_v1'
  and audit.point_id=q.point_id;

with affected_stages as (
  select distinct stage_id from tmp_finish_line_points
),
aggregated as (
  select
    sr.stage_id,
    sr.rider_id,
    coalesce(sum(pr.points_awarded) filter(where p.point_type='FINISH'),0)::integer as finish_points,
    coalesce(sum(pr.points_awarded) filter(where p.point_type='KOM'),0)::integer as mountain_points,
    coalesce(sum(pr.points_awarded) filter(where p.point_type not in ('FINISH','KOM')),0)::integer as sprint_points,
    coalesce(sum(pr.bonus_seconds_awarded),0)::integer as bonus_seconds
  from public.race_stage_results sr
  join affected_stages a on a.stage_id=sr.stage_id
  left join public.race_stage_point_results pr
    on pr.stage_id=sr.stage_id and pr.rider_id=sr.rider_id
  left join public.race_stage_points p on p.id=pr.point_id
  group by sr.stage_id,sr.rider_id
)
update public.race_stage_results sr
set
  finish_points=a.finish_points,
  sprint_points=a.sprint_points,
  mountain_points=a.mountain_points,
  bonus_seconds=a.bonus_seconds
from aggregated a
where sr.stage_id=a.stage_id
  and sr.rider_id=a.rider_id;

do $classification_rebuild$
declare
  v record;
begin
  for v in
    select
      rs.race_id,
      rs.stage_number,
      ar.simulation_run_id
    from public.race_stages rs
    join public.race_stage_authoritative_runs ar on ar.stage_id=rs.id
    join tmp_affected_races affected on affected.race_id=rs.race_id
    where rs.stage_number >= affected.earliest_stage_number
    order by rs.race_id,rs.stage_number
  loop
    perform public.race_engine_write_cumulative_classifications_v2(
      v.simulation_run_id,
      false,
      'CONFIRM_CANONICAL_CLASSIFICATIONS_V2'
    );
  end loop;
end
$classification_rebuild$;

create temporary table tmp_crack_stage_before on commit drop as
select stage_id,count(*)::integer as before_count
from public.race_stage_report_events
where title='Riders crack on the climb'
group by stage_id
having count(*)>1;

create temporary table tmp_crack_groups on commit drop as
select
  e.stage_id,
  floor(coalesce(e.km_marker,0)/1.5)::integer as km_bucket,
  (array_agg(e.id order by e.event_order))[1] as keep_id,
  min(e.km_marker)::numeric as start_km,
  max(e.km_marker)::numeric as end_km,
  count(*)::integer as event_count,
  sum(
    coalesce(
      nullif(e.metadata->>'riderCount','')::integer,
      nullif(substring(e.description from '^([0-9]+)'),'')::integer,
      1
    )
  )::integer as rider_count,
  (array_agg(e.description order by e.event_order desc))[1] as last_description
from public.race_stage_report_events e
join tmp_crack_stage_before b on b.stage_id=e.stage_id
where e.title='Riders crack on the climb'
group by e.stage_id,floor(coalesce(e.km_marker,0)/1.5)::integer;

update public.race_stage_report_events e
set
  description =
    g.rider_count::text ||
    ' riders can no longer hold the main group' ||
    case
      when substring(g.last_description from 'on the ([0-9.]+)% climb') is not null
        then ' on the ' || substring(g.last_description from 'on the ([0-9.]+)% climb') || '% climb'
      else ' on this climb section'
    end ||
    ' between ' || round(g.start_km,1)::text || ' km and ' || round(g.end_km,1)::text || ' km.',
  rider_id=null,
  team_id=null,
  rider_name_snapshot=null,
  team_name_snapshot=null,
  metadata=coalesce(e.metadata,'{}'::jsonb) || jsonb_build_object(
    'historical_compaction','climb_contact_loss_section_v1',
    'aggregated_event_count',g.event_count,
    'riderCount',g.rider_count,
    'startKm',g.start_km,
    'endKm',g.end_km
  ),
  updated_at=clock_timestamp()
from tmp_crack_groups g
where e.id=g.keep_id
  and g.event_count>1;

delete from public.race_stage_report_events e
using tmp_crack_groups g
where e.stage_id=g.stage_id
  and e.title='Riders crack on the climb'
  and floor(coalesce(e.km_marker,0)/1.5)::integer=g.km_bucket
  and e.id<>g.keep_id
  and g.event_count>1;

insert into public.race_report_event_compaction_audit_v1(
  run_key,stage_id,before_crack_event_count,after_crack_event_count
)
select
  'climb_crack_report_compaction_20260920_v1',
  b.stage_id,
  b.before_count,
  count(e.id)::integer
from tmp_crack_stage_before b
left join public.race_stage_report_events e
  on e.stage_id=b.stage_id
 and e.title='Riders crack on the climb'
group by b.stage_id,b.before_count
on conflict(run_key,stage_id) do nothing;

comment on table public.race_finish_line_point_reconciliation_audit_v1 is
'Audit of historical finish-line KOM/sprint point reconciliation to the authoritative stage classification.';
comment on table public.race_report_event_compaction_audit_v1 is
'Audit of historical published climb-contact commentary compaction.';
