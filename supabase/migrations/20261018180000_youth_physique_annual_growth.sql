-- Young riders mature physically at annual Youth Academy transitions.
-- Applies prospectively only. Senior physiques and historical results are untouched.
create table if not exists public.youth_physique_growth_history_v1 (
  youth_rider_id uuid not null references public.youth_riders(id),
  season_number integer not null check (season_number >= 1),
  prior_height_cm smallint not null,
  prior_weight_kg smallint not null,
  new_height_cm smallint not null,
  new_weight_kg smallint not null,
  updated_at timestamptz not null default now(),
  primary key(youth_rider_id,season_number)
);

alter table public.youth_physique_growth_history_v1 enable row level security;
revoke all on public.youth_physique_growth_history_v1 from anon, authenticated;

create or replace function private.advance_youth_physiques_for_season_v1(
  p_target_season integer
) returns integer language plpgsql security definer
set search_path to 'public','private','pg_temp'
as $function$
declare
  changed_count integer:=0;
begin
  if p_target_season is null or p_target_season<2 then return 0; end if;
  -- This function is only invoked by the authorized season rollover.
  if not exists(select 1 from public.season_transition_runs_v1 tr
      where tr.target_season=p_target_season and tr.source_season=p_target_season-1
        and tr.status='running') then
    raise exception 'Youth physical growth requires an active season rollover';
  end if;

  with eligible as (
    select r.id rider_id,p.height_cm old_height,p.weight_kg old_weight,
      extract(year from age(public.game_date_from_parts(p_target_season,12,31),r.birth_date))::int as age_this_year,
      pg_catalog.get_byte(pg_catalog.decode(pg_catalog.md5(r.id::text||':'||p_target_season::text),'hex'),0) as seed_h,
      pg_catalog.get_byte(pg_catalog.decode(pg_catalog.md5(r.id::text||':'||p_target_season::text),'hex'),1) as seed_w
    from public.youth_riders r
    join public.rider_physical_profiles_v1 p on p.rider_id=r.id and p.rider_kind='youth'
    join public.youth_academies a on a.id=r.academy_id
    where r.status in ('academy','graduating') and a.is_active
      and not exists(select 1 from public.youth_physique_growth_history_v1 g
        where g.youth_rider_id=r.id and g.season_number=p_target_season)
  ), growth as (
    select e.*,
      case
        when age_this_year <= 13 then 3+(seed_h%4)
        when age_this_year=14 then 2+(seed_h%3)
        when age_this_year=15 then 1+(seed_h%3)
        when age_this_year=16 then seed_h%3
        when age_this_year=17 then seed_h%2
        else 0 end as height_gain,
      case
        when age_this_year <= 13 then 2+(seed_w%3)
        when age_this_year=14 then 2+(seed_w%3)
        when age_this_year=15 then 1+(seed_w%3)
        when age_this_year=16 then 1+(seed_w%2)
        when age_this_year=17 then seed_w%2
        else 0 end as weight_gain
    from eligible e where e.age_this_year between 12 and 17
  )
  insert into public.youth_physique_growth_history_v1 (
    youth_rider_id,season_number,prior_height_cm,prior_weight_kg,new_height_cm,new_weight_kg
  )
  select rider_id,p_target_season,old_height,old_weight,
    least(202,old_height+height_gain)::smallint,
    least(105,old_weight+weight_gain)::smallint
  from growth
  on conflict(youth_rider_id,season_number) do nothing;
  get diagnostics changed_count=row_count;

  -- Reapply the exact stored target size if rollover safely retries: no double growth.
  update public.rider_physical_profiles_v1 p
    set height_cm=g.new_height_cm,weight_kg=g.new_weight_kg
  from public.youth_physique_growth_history_v1 g
  where p.rider_id=g.youth_rider_id and p.rider_kind='youth'
    and g.season_number=p_target_season
    and (p.height_cm,p.weight_kg) is distinct from (g.new_height_cm,g.new_weight_kg);

  return changed_count;
end;
$function$;

-- Attach once to the existing, guarded Youth Academy season transition.
do $patch$
declare v_body text;
begin
  select pg_get_functiondef(p.oid) into v_body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='run_youth_academy_season_transition_v1';
  if v_body is null or
     position('  runtime_result jsonb;' in v_body)=0 or
     position('  -- Source-season scouting decisions do not leak into a new season.' in v_body)=0 or
     position('''agreements_extended'',agreements_extended' in v_body)=0
  then raise exception 'Unexpected season transition function; no growth patch applied'; end if;

  v_body:=replace(v_body,
    '  runtime_result jsonb;',
    '  runtime_result jsonb;
  youth_growth_count integer:=0;');
  v_body:=replace(v_body,
    '  -- Source-season scouting decisions do not leak into a new season.',
    '  youth_growth_count:=private.advance_youth_physiques_for_season_v1(p_target_season);

  -- Source-season scouting decisions do not leak into a new season.');
  v_body:=replace(v_body,
    '''agreements_extended'',agreements_extended',
    '''agreements_extended'',agreements_extended,
    ''youth_growth_count'',youth_growth_count');
  execute v_body;
end;
$patch$;
