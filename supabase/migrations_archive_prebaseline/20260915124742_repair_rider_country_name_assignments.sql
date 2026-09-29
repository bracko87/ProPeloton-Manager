-- Repair existing riders whose name components do not belong to their
-- nationality's canonical master pools. Rider IDs, nationality, stats, roles,
-- teams, contracts and sporting results are preserved.

create temporary table rider_name_country_repair_targets_v1
on commit drop
as
select r.id
from public.riders r
where not exists (
        select 1
        from public.first_names_master fn
        where fn.country_code = upper(r.country_code)
          and lower(fn.first_name) = lower(r.first_name)
      )
   or not exists (
        select 1
        from public.last_names_master ln
        where ln.country_code = upper(r.country_code)
          and lower(ln.last_name) = lower(r.last_name)
      );

create unique index on rider_name_country_repair_targets_v1 (id);

do $block$
begin
  if exists (
    select 1
    from public.riders r
    join rider_name_country_repair_targets_v1 t on t.id = r.id
    where not exists (
            select 1 from public.first_names_master fn
            where fn.country_code = upper(r.country_code)
          )
       or not exists (
            select 1 from public.last_names_master ln
            where ln.country_code = upper(r.country_code)
          )
  ) then
    raise exception 'Rider name repair aborted: at least one rider country lacks a canonical name pool';
  end if;
end;
$block$;

with target_rows as (
  select
    r.id,
    upper(r.country_code) as country_code,
    r.first_name,
    r.last_name,
    exists (
      select 1 from public.first_names_master fn
      where fn.country_code = upper(r.country_code)
        and lower(fn.first_name) = lower(r.first_name)
    ) as first_is_valid,
    exists (
      select 1 from public.last_names_master ln
      where ln.country_code = upper(r.country_code)
        and lower(ln.last_name) = lower(r.last_name)
    ) as last_is_valid,
    row_number() over (partition by upper(r.country_code) order by r.id) as first_pick_no,
    row_number() over (partition by upper(r.country_code) order by md5(r.id::text)) as last_pick_no
  from public.riders r
  join rider_name_country_repair_targets_v1 t on t.id = r.id
), first_pool as (
  select
    fn.country_code,
    fn.first_name,
    row_number() over (partition by fn.country_code order by lower(fn.first_name), fn.id) as pool_no,
    count(*) over (partition by fn.country_code) as pool_count
  from public.first_names_master fn
), last_pool as (
  select
    ln.country_code,
    ln.last_name,
    row_number() over (partition by ln.country_code order by lower(ln.last_name), ln.id) as pool_no,
    count(*) over (partition by ln.country_code) as pool_count
  from public.last_names_master ln
), choices as (
  select
    tr.id,
    tr.first_is_valid,
    tr.last_is_valid,
    tr.first_name as old_first_name,
    tr.last_name as old_last_name,
    fp.first_name as replacement_first_name,
    lp.last_name as replacement_last_name
  from target_rows tr
  join first_pool fp
    on fp.country_code = tr.country_code
   and fp.pool_no = 1 + mod(tr.first_pick_no - 1, fp.pool_count)
  join last_pool lp
    on lp.country_code = tr.country_code
   and lp.pool_no = 1 + mod(tr.last_pick_no - 1, lp.pool_count)
)
update public.riders r
set
  first_name = case when c.first_is_valid then c.old_first_name else c.replacement_first_name end,
  last_name = case when c.last_is_valid then c.old_last_name else c.replacement_last_name end
from choices c
where r.id = c.id;

update public.race_participant_riders x
set rider_name_snapshot = r.first_name || ' ' || r.last_name
from public.riders r
join rider_name_country_repair_targets_v1 t on t.id = r.id
where x.rider_id = r.id
  and x.rider_name_snapshot is distinct from (r.first_name || ' ' || r.last_name);

update public.race_stage_results x
set rider_name_snapshot = r.first_name || ' ' || r.last_name
from public.riders r
join rider_name_country_repair_targets_v1 t on t.id = r.id
where x.rider_id = r.id
  and x.rider_name_snapshot is distinct from (r.first_name || ' ' || r.last_name);

update public.race_stage_point_results x
set rider_name_snapshot = r.first_name || ' ' || r.last_name
from public.riders r
join rider_name_country_repair_targets_v1 t on t.id = r.id
where x.rider_id = r.id
  and x.rider_name_snapshot is distinct from (r.first_name || ' ' || r.last_name);

update public.race_stage_report_events x
set rider_name_snapshot = r.first_name || ' ' || r.last_name
from public.riders r
join rider_name_country_repair_targets_v1 t on t.id = r.id
where x.rider_id = r.id
  and x.rider_name_snapshot is distinct from (r.first_name || ' ' || r.last_name);

update public.race_ranking_point_awards x
set display_name_snapshot = r.first_name || ' ' || r.last_name
from public.riders r
join rider_name_country_repair_targets_v1 t on t.id = r.id
where x.rider_id = r.id
  and x.display_name_snapshot is distinct from (r.first_name || ' ' || r.last_name);

update public.race_stage_replay_frames f
set rider_names = array(
  select coalesce(r.first_name || ' ' || r.last_name, f.rider_names[g.i])
  from generate_subscripts(f.rider_ids, 1) as g(i)
  left join public.riders r on r.id = f.rider_ids[g.i]
  order by g.i
)
where exists (
  select 1
  from rider_name_country_repair_targets_v1 t
  where t.id = any(f.rider_ids)
);
