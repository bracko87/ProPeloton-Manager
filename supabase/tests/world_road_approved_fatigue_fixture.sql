-- Isolated PostgreSQL regression fixture. Never run against production.
-- Starts from an empty PostgreSQL test database.
create table public.world_road_championship_editions (
  id uuid primary key, status text, race_date date, race_id uuid
);
create table public.world_road_championship_entries (
  id uuid primary key, edition_id uuid, rider_id uuid,
  participation_decision text, final_participation_decision text,
  entry_status text, updated_at timestamptz default now()
);
create table public.world_road_championship_duties (
  edition_id uuid, rider_id uuid, status text, updated_at timestamptz default now()
);
create table public.riders (
  id uuid primary key, availability_status text, unavailable_until date
);
create table public.rider_health_cases (
  rider_id uuid, status text, selection_blocked boolean
);
create table public.world_road_sync_audit (edition_id uuid);
create or replace function public.world_road_championship_sync_participants_v1(p_edition_id uuid)
returns jsonb language plpgsql set search_path = '' as $$
begin
  insert into public.world_road_sync_audit(edition_id) values (p_edition_id);
  return '{}'::jsonb;
end; $$;

-- The exact migration proposed for production is executed against fixture.
\i supabase/migrations/20261022092000_world_road_preserve_approved_fatigued_champions.sql

insert into public.world_road_championship_editions values
('10000000-0000-0000-0000-000000000000','ready','2000-12-17','20000000-0000-0000-0000-000000000000');

-- Cases 1-3: transient fatigue (AI / accepted human / expired until-date).
-- Cases 4-6: genuine injuries, active medical prohibition, through-race restriction.
-- Cases 7-9: pending invitation, refused invitation, final rejection.
-- Case 10: already confirmed; no spurious update.
insert into public.riders
select ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  case i
    when 4 then 'injured'
    when 1 then 'not_fully_fit'
    when 2 then 'not_fully_fit'
    when 3 then 'not_fully_fit'
    when 5 then 'fit'
    when 6 then 'not_fully_fit'
    else 'fit'
  end,
  case i when 3 then date '2000-10-01'
         when 6 then date '2000-12-20'
         else null end
from generate_series(1,10) i;

insert into public.world_road_championship_entries(id,edition_id,rider_id,participation_decision,final_participation_decision,entry_status)
select ('40000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  '10000000-0000-0000-0000-000000000000',
  ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
  case i when 2 then 'approved' when 7 then 'pending' when 8 then 'rejected' else 'auto_approved' end,
  case i when 9 then 'rejected' else 'not_open' end,
  case i when 7 then 'invited' when 8 then 'withdrawn' when 9 then 'withdrawn'
         when 10 then 'confirmed' else 'unavailable' end
from generate_series(1,10) i;
insert into public.rider_health_cases values
('30000000-0000-0000-0000-000000000005','active',true);

insert into public.world_road_championship_duties(edition_id,rider_id,status)
select '10000000-0000-0000-0000-000000000000',
 ('30000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,
 'cancelled'
from generate_series(1,6) i;

do $$
declare
  change_count integer;
  states text[];
  duty_states text[];
begin
  change_count := public.world_road_championship_refresh_availability_v1();
  if change_count <> 3 then
    raise exception 'Expected 3 transiently unavailable approved riders to recover, observed %',change_count;
  end if;
  select array_agg(entry_status order by id) into states from public.world_road_championship_entries;
  if states is distinct from array[
    'confirmed','confirmed','confirmed','unavailable','unavailable','unavailable',
    'invited','withdrawn','withdrawn','confirmed'
  ]::text[] then
    raise exception 'Wrong entry statuses after refresh: %',states;
  end if;
  select array_agg(status order by rider_id) into duty_states
  from public.world_road_championship_duties;
  if duty_states is distinct from array[
    'confirmed','confirmed','confirmed','cancelled','cancelled','cancelled'
  ]::text[] then
    raise exception 'Wrong medical-duty statuses after refresh: %',duty_states;
  end if;
  if exists(select 1 from public.world_road_championship_entries
            where id='40000000-0000-0000-0000-000000000001'::uuid
              and participation_decision <> 'auto_approved') then
    raise exception 'AI approval was modified';
  end if;
  if exists(select 1 from public.world_road_championship_entries
            where id='40000000-0000-0000-0000-000000000002'::uuid
              and participation_decision <> 'approved') then
    raise exception 'Human manager decision was modified';
  end if;
  if public.world_road_championship_refresh_availability_v1() <> 0 then
    raise exception 'Repeated refresh is not idempotent';
  end if;
  if (select count(*) from public.world_road_sync_audit) <> 2 then
    raise exception 'Participant sync not called once per refresh';
  end if;
  raise notice 'PASS: AI + human approvals retained through fatigue; hard medical blocks, refusals, duties and idempotence preserved';
end $$;
