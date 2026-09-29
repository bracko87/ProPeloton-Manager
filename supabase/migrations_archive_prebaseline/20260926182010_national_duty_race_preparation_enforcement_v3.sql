
create or replace function public.get_race_preparation_blocked_resources_v1(
  p_club_id uuid,
  p_race_id uuid,
  p_exclude_race_preparation_id uuid default null::uuid
)
returns table(
  resource_type text,
  resource_id uuid,
  asset_key text,
  asset_slot_key text,
  blocking_race_preparation_id uuid,
  blocking_race_id uuid,
  blocking_race_name text,
  blocking_start_date date,
  blocking_end_date date
)
language sql
stable
security definer
set search_path to 'public'
as $$
with target_race as (
  select
    r.id,
    r.start_date::date as start_date,
    coalesce(r.end_date::date, r.start_date::date) as end_date
  from public.races r
  where r.id = p_race_id
),
overlapping_preps as (
  select
    rp.id as race_preparation_id,
    rp.race_id,
    r.name as race_name,
    r.start_date::date as start_date,
    coalesce(r.end_date::date, r.start_date::date) as end_date
  from public.race_preparations rp
  join public.races r
    on r.id = rp.race_id
  cross join target_race tr
  where rp.club_id = p_club_id
    and rp.id is distinct from p_exclude_race_preparation_id
    and rp.race_id <> p_race_id
    and (
      coalesce(rp.status, '') in ('submitted', 'locked', 'sent_to_engine')
      or coalesce(rp.startlist_status, '') in ('submitted', 'locked', 'sent_to_engine')
    )
    and r.start_date::date <= tr.end_date
    and coalesce(r.end_date::date, r.start_date::date) >= tr.start_date
)
select
  'rider'::text as resource_type,
  rpr.rider_id as resource_id,
  null::text as asset_key,
  null::text as asset_slot_key,
  op.race_preparation_id as blocking_race_preparation_id,
  op.race_id as blocking_race_id,
  op.race_name as blocking_race_name,
  op.start_date as blocking_start_date,
  op.end_date as blocking_end_date
from overlapping_preps op
join public.race_preparation_riders rpr
  on rpr.race_preparation_id = op.race_preparation_id

union all

select
  'staff'::text,
  rps.staff_id,
  null::text,
  null::text,
  op.race_preparation_id,
  op.race_id,
  op.race_name,
  op.start_date,
  op.end_date
from overlapping_preps op
join public.race_preparation_staff rps
  on rps.race_preparation_id = op.race_preparation_id

union all

select
  'asset'::text,
  rpa.asset_id,
  rpa.asset_key,
  rpa.asset_slot_key,
  op.race_preparation_id,
  op.race_id,
  op.race_name,
  op.start_date,
  op.end_date
from overlapping_preps op
join public.race_preparation_assets rpa
  on rpa.race_preparation_id = op.race_preparation_id

union all

select
  'rider'::text,
  nd.rider_id,
  null::text,
  null::text,
  null::uuid,
  case
    when nd.duty_type = 'qualification' then h.race_id
    when nd.duty_type = 'final' then e.final_race_id
    else null::uuid
  end,
  nd.label,
  nd.duty_date,
  nd.duty_date
from public.national_championship_duties nd
join public.national_championship_editions e
  on e.id = nd.edition_id
left join public.national_championship_heats h
  on h.id = nd.heat_id
cross join target_race tr
where nd.status = 'confirmed'
  and nd.duty_date between tr.start_date and tr.end_date;
$$;
