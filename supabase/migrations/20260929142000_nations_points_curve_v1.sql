-- Nations Championship points curve v1.
-- Simulation target:
-- - TTT meaningfully contributes without dominating the tournament.
-- - Road days reward depth because only the best three riders per nation count.
-- - Losing one top rider does not mathematically eliminate a nation.
--
-- Trial simulations across 6/8/10/16-nation fields produced a typical TTT
-- contribution of roughly one quarter of a winning nation's total score.

create table if not exists public.nations_points_curve (
  race_type text not null
    check (race_type in ('team_time_trial','road_race')),
  finishing_position integer not null check (finishing_position > 0),
  points integer not null check (points >= 0),
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(race_type,finishing_position,version)
);

insert into public.nations_points_curve(
  race_type,finishing_position,points,version,is_active
)
values
  ('team_time_trial',1,70,1,true),
  ('team_time_trial',2,58,1,true),
  ('team_time_trial',3,50,1,true),
  ('team_time_trial',4,44,1,true),
  ('team_time_trial',5,39,1,true),
  ('team_time_trial',6,34,1,true),
  ('team_time_trial',7,30,1,true),
  ('team_time_trial',8,26,1,true),
  ('team_time_trial',9,22,1,true),
  ('team_time_trial',10,18,1,true),
  ('team_time_trial',11,15,1,true),
  ('team_time_trial',12,12,1,true),
  ('team_time_trial',13,10,1,true),
  ('team_time_trial',14,8,1,true),
  ('team_time_trial',15,6,1,true),
  ('team_time_trial',16,4,1,true),

  ('road_race',1,40,1,true),
  ('road_race',2,35,1,true),
  ('road_race',3,31,1,true),
  ('road_race',4,28,1,true),
  ('road_race',5,25,1,true),
  ('road_race',6,23,1,true),
  ('road_race',7,21,1,true),
  ('road_race',8,19,1,true),
  ('road_race',9,17,1,true),
  ('road_race',10,15,1,true),
  ('road_race',11,14,1,true),
  ('road_race',12,13,1,true),
  ('road_race',13,12,1,true),
  ('road_race',14,11,1,true),
  ('road_race',15,10,1,true),
  ('road_race',16,9,1,true),
  ('road_race',17,8,1,true),
  ('road_race',18,7,1,true),
  ('road_race',19,6,1,true),
  ('road_race',20,5,1,true),
  ('road_race',21,4,1,true),
  ('road_race',22,4,1,true),
  ('road_race',23,3,1,true),
  ('road_race',24,3,1,true),
  ('road_race',25,2,1,true),
  ('road_race',26,2,1,true),
  ('road_race',27,1,1,true),
  ('road_race',28,1,1,true),
  ('road_race',29,1,1,true),
  ('road_race',30,1,1,true)
on conflict(race_type,finishing_position,version) do update
set points=excluded.points,
    is_active=excluded.is_active;

create or replace function public.nations_ttt_points_v1(p_finishing_position integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.points
    from public.nations_points_curve c
    where c.race_type='team_time_trial'
      and c.version=1
      and c.is_active=true
      and c.finishing_position=p_finishing_position
  ),0);
$$;

create or replace function public.nations_road_rider_points_v1(p_finishing_position integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.points
    from public.nations_points_curve c
    where c.race_type='road_race'
      and c.version=1
      and c.is_active=true
      and c.finishing_position=p_finishing_position
  ),0);
$$;

create or replace function public.calculate_nation_road_race_points_v1(
  p_finish_positions integer[]
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(x.points),0)::integer
  from (
    select public.nations_road_rider_points_v1(pos) as points
    from unnest(coalesce(p_finish_positions,array[]::integer[])) pos
    where pos is not null and pos>0
    order by public.nations_road_rider_points_v1(pos) desc,pos
    limit 3
  ) x;
$$;

alter table public.nations_points_curve enable row level security;

drop policy if exists nations_points_curve_read
  on public.nations_points_curve;
create policy nations_points_curve_read
on public.nations_points_curve
for select
to authenticated
using (is_active=true);

revoke all on public.nations_points_curve from anon,authenticated;
grant select on public.nations_points_curve to authenticated;

revoke all on function public.nations_ttt_points_v1(integer)
from public,anon;
grant execute on function public.nations_ttt_points_v1(integer)
to authenticated,service_role;

revoke all on function public.nations_road_rider_points_v1(integer)
from public,anon;
grant execute on function public.nations_road_rider_points_v1(integer)
to authenticated,service_role;

revoke all on function public.calculate_nation_road_race_points_v1(integer[])
from public,anon;
grant execute on function public.calculate_nation_road_race_points_v1(integer[])
to authenticated,service_role;
