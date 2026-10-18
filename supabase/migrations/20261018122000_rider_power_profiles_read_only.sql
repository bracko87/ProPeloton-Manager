-- Read-only rider physique records. Race-engine inputs, results and ratings are untouched.
create table if not exists public.rider_physical_profiles_v1 (
  rider_id uuid primary key,
  rider_kind text not null check (rider_kind in ('senior','youth')),
  height_cm smallint not null check (height_cm between 135 and 210),
  weight_kg smallint not null check (weight_kg between 32 and 115),
  created_at timestamptz not null default now()
);
alter table public.rider_physical_profiles_v1 enable row level security;
-- No table privileges are granted to clients: only the restricted physique-only RPC is exposed.
revoke all on public.rider_physical_profiles_v1 from public, anon, authenticated;

create or replace function private.seed_rider_physique_v1(p_id uuid, p_role text, p_youth boolean)
returns integer[] language plpgsql immutable set search_path = '' as $$
declare
  a integer := pg_catalog.get_byte(pg_catalog.uuid_send(p_id),0);
  b integer := pg_catalog.get_byte(pg_catalog.uuid_send(p_id),1);
  role_text text := lower(coalesce(p_role,''));
  base_height integer;
  base_weight integer;
  height integer;
  weight integer;
begin
  -- Permanent reference dimensions, distinct for specialization and rider identity.
  if p_youth then
    base_height := case when role_text like '%climb%' then 158
      when role_text like '%sprint%' then 167 when role_text like '%time%' then 166 else 163 end;
    base_weight := case when role_text like '%climb%' then 48
      when role_text like '%sprint%' then 60 when role_text like '%time%' then 57 else 54 end;
  else
    base_height := case when role_text like '%climb%' then 174
      when role_text like '%sprint%' then 184 when role_text like '%time%' then 182 else 179 end;
    base_weight := case when role_text like '%climb%' then 63
      when role_text like '%sprint%' then 80 when role_text like '%time%' then 76 else 71 end;
  end if;
  height := base_height + (a % 17) - 8;
  weight := greatest(case when p_youth then 34 else 48 end,
    least(case when p_youth then 85 else 105 end,
      round(base_weight + (height-base_height)*0.5 + ((b % 11)-5)*0.8)::integer));
  return array[height, weight];
end; $$;

insert into public.rider_physical_profiles_v1(rider_id,rider_kind,height_cm,weight_kg)
select r.id,'senior',(s.physique)[1]::smallint,(s.physique)[2]::smallint
from public.riders r
cross join lateral (select private.seed_rider_physique_v1(r.id,r.role::text,false) physique) s
on conflict (rider_id) do nothing;
insert into public.rider_physical_profiles_v1(rider_id,rider_kind,height_cm,weight_kg)
select r.id,'youth',(s.physique)[1]::smallint,(s.physique)[2]::smallint
from public.youth_riders r
cross join lateral (select private.seed_rider_physique_v1(r.id,r.role::text,true) physique) s
on conflict (rider_id) do nothing;

create or replace function private.ensure_rider_physique_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare values_ integer[];
begin
  values_ := private.seed_rider_physique_v1(new.id,new.role::text,tg_table_name='youth_riders');
  insert into public.rider_physical_profiles_v1(rider_id,rider_kind,height_cm,weight_kg)
  values(new.id,case when tg_table_name='youth_riders' then 'youth' else 'senior' end,
    values_[1]::smallint,values_[2]::smallint)
  on conflict(rider_id) do nothing;
  return new;
end; $$;

drop trigger if exists trg_rider_physique_seed_v1 on public.riders;
create trigger trg_rider_physique_seed_v1 after insert on public.riders
for each row execute function private.ensure_rider_physique_v1();
drop trigger if exists trg_youth_rider_physique_seed_v1 on public.youth_riders;
create trigger trg_youth_rider_physique_seed_v1 after insert on public.youth_riders
for each row execute function private.ensure_rider_physique_v1();

-- Promotion creates a different professional rider UUID. Keep the original physique.
create or replace function private.copy_graduated_rider_physique_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.professional_rider_id is not null then
    insert into public.rider_physical_profiles_v1(rider_id,rider_kind,height_cm,weight_kg)
    select new.professional_rider_id,'senior',p.height_cm,p.weight_kg
    from public.rider_physical_profiles_v1 p where p.rider_id=new.youth_rider_id
    on conflict (rider_id) do update
      set height_cm=excluded.height_cm,weight_kg=excluded.weight_kg;
  end if;
  return new;
end; $$;

drop trigger if exists trg_copy_graduated_rider_physique_v1 on public.youth_graduation_records;
create trigger trg_copy_graduated_rider_physique_v1
after insert or update of professional_rider_id on public.youth_graduation_records
for each row execute function private.copy_graduated_rider_physique_v1();

-- Preserve the height/weight of youth graduates who already existed before this migration.
insert into public.rider_physical_profiles_v1(rider_id,rider_kind,height_cm,weight_kg)
select g.professional_rider_id,'senior',p.height_cm,p.weight_kg
from public.youth_graduation_records g
join public.rider_physical_profiles_v1 p on p.rider_id=g.youth_rider_id
where g.professional_rider_id is not null
on conflict (rider_id) do update set height_cm=excluded.height_cm,weight_kg=excluded.weight_kg;

-- Only exposes physical measurements; no rider skills, potential or scouting fields.
create or replace function public.get_rider_physiques_v1(p_rider_ids uuid[])
returns table(rider_id uuid, height_cm smallint, weight_kg smallint)
language sql stable security definer set search_path = '' as $$
  select p.rider_id,p.height_cm,p.weight_kg
  from public.rider_physical_profiles_v1 p
  where auth.uid() is not null
    and coalesce(pg_catalog.cardinality(p_rider_ids),0) between 1 and 50
    and p.rider_id = any(p_rider_ids);
$$;
revoke all on function public.get_rider_physiques_v1(uuid[]) from public,anon;
grant execute on function public.get_rider_physiques_v1(uuid[]) to authenticated;
comment on function public.get_rider_physiques_v1(uuid[]) is
  'Reference height/weight only; not a race input, not scouting intelligence.';
