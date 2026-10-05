
create or replace function private.youth_generated_race_name_v2(
  p_class text,
  p_city text,
  p_country_code text,
  p_division_code text,
  p_seed text
)
returns text
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_country text;
  v_region text;
  v_sponsor text;
  v_variant integer;
  v_geo text;
begin
  select c.name into v_country
  from public.countries c
  where upper(c.code)=upper(coalesce(p_country_code,''))
  limit 1;

  v_country:=coalesce(nullif(v_country,''),upper(coalesce(p_country_code,'International')));
  v_region:=initcap(replace(replace(coalesce(p_division_code,'Youth'),'CONTINENTAL_',''),'_',' '));

  select sc.name into v_sponsor
  from public.sponsor_companies sc
  where sc.is_active=true
    and coalesce(sc.is_test,false)=false
  order by md5(coalesce(p_seed,'')||':'||sc.id::text)
  limit 1;

  v_sponsor:=coalesce(nullif(v_sponsor,''),'VeloNova');
  v_variant:=mod(abs(hashtext(coalesce(p_seed,''))),8);
  v_geo:=case mod(abs(hashtext(coalesce(p_seed,'')||':geo')),5)
    when 0 then 'Coastal'
    when 1 then 'Highland'
    when 2 then 'Island'
    when 3 then 'Valley'
    else 'Heritage'
  end;

  if p_class='world' then
    return case v_variant
      when 0 then v_country||' Youth World Tour'
      when 1 then p_city||' International U16 Classic'
      when 2 then v_sponsor||' World Youth Challenge – '||v_country
      when 3 then 'World Youth Trophy of '||v_region||' – '||p_city
      when 4 then v_geo||' World Cup – '||p_city
      when 5 then 'Grand Prix '||v_country||' U16'
      when 6 then v_sponsor||' Youth World Series – '||p_city
      else 'Tour of '||v_country||' – World Youth Class'
    end;
  elsif p_class='continental' then
    return case v_variant
      when 0 then 'Tour of '||v_country||' U16'
      when 1 then v_region||' Youth Classic – '||p_city
      when 2 then p_city||' Continental Trophy'
      when 3 then v_sponsor||' Continental Youth Tour – '||p_city
      when 4 then v_geo||' Youth Challenge – '||v_country
      when 5 then 'Grand Prix '||v_country||' Youth'
      when 6 then v_region||' Stage Trophy – '||p_city
      else v_sponsor||' Cup of '||v_region||' – '||p_city
    end;
  else
    return case v_variant
      when 0 then v_country||' Regional Youth Cup – '||p_city
      when 1 then 'Tour of '||v_region||' – '||p_city
      when 2 then p_city||' – '||v_region||' Classic'
      when 3 then v_sponsor||' Regional Trophy – '||v_country
      when 4 then v_geo||' Youth Race – '||p_city
      when 5 then 'Grand Prix '||v_country||' U16 – '||p_city
      when 6 then v_region||' Youth Challenge – '||p_city
      else v_sponsor||' Cup – '||p_city
    end;
  end if;
end;
$function$;

revoke all on function private.youth_generated_race_name_v2(text,text,text,text,text)
from public,anon,authenticated;

create or replace function private.youth_generated_race_variety_v2()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_seed text;
  v_offset integer;
  v_days integer;
  v_class text;
  v_name text;
begin
  if coalesce(new.metadata->>'calendar_source','')<>'youth_hierarchy_v1' then
    return new;
  end if;

  if TG_OP='UPDATE' and exists(
    select 1 from public.youth_race_processing_log l where l.race_id=new.id
  ) then
    return new;
  end if;

  if coalesce(new.metadata->>'calendar_variety_version','')='v2' then
    return new;
  end if;

  v_class:=coalesce(new.competition_class,'regional');
  v_seed:=concat_ws(':',
    new.season_number::text,
    v_class,
    coalesce(new.division_code,''),
    coalesce(new.host_country_code,''),
    coalesce(new.host_city,''),
    coalesce(new.race_name,''),
    coalesce(new.id::text,'new')
  );

  v_offset:=mod(abs(hashtext(v_seed||':date')),4);
  new.race_date:=new.race_date+v_offset;

  v_days:=case v_class
    when 'world' then (array[1,2,3,5,6,7])[1+mod(abs(hashtext(v_seed||':days')),6)]
    when 'continental' then (array[1,2,3,1,5])[1+mod(abs(hashtext(v_seed||':days')),5)]
    else (array[1,1,2,1,3,2])[1+mod(abs(hashtext(v_seed||':days')),6)]
  end;

  new.race_days:=v_days;
  new.race_end_date:=new.race_date+(v_days-1);
  new.distance_km:=60+mod(abs(hashtext(v_seed||':distance')),71);
  v_name:=private.youth_generated_race_name_v2(
    v_class,
    coalesce(new.host_city,'Youth Circuit'),
    new.host_country_code,
    new.division_code,
    v_seed
  );

  -- Keep the natural name, but disambiguate rare same-day collisions without
  -- reverting to generic numbered race names.
  if exists(
    select 1 from public.youth_races x
    where x.id<>new.id
      and x.season_number=new.season_number
      and x.race_date=new.race_date
      and x.race_name=v_name
  ) then
    v_name:=v_name||' – '||coalesce(new.host_city,new.host_country_code,new.division_code,'Youth');
  end if;
  if exists(
    select 1 from public.youth_races x
    where x.id<>new.id
      and x.season_number=new.season_number
      and x.race_date=new.race_date
      and x.race_name=v_name
  ) then
    v_name:=v_name||' '||coalesce(upper(new.host_country_code),'U16');
  end if;

  new.race_name:=v_name;
  new.invitation_response_deadline:=case v_class
    when 'world' then new.race_date-14
    when 'continental' then new.race_date-7
    else new.race_date-5
  end;

  new.metadata:=coalesce(new.metadata,'{}'::jsonb)||jsonb_build_object(
    'calendar_variety_version','v2',
    'distance_contract','60_130_km',
    'duration_contract',case
      when v_class='world' then '1_7_days'
      when v_class='continental' then '1_5_days'
      else '1_3_days'
    end
  );
  new.updated_at:=now();
  return new;
end;
$function$;

revoke all on function private.youth_generated_race_variety_v2()
from public,anon,authenticated;

drop trigger if exists youth_generated_race_variety_v2_trg on public.youth_races;
create trigger youth_generated_race_variety_v2_trg
before insert or update on public.youth_races
for each row execute function private.youth_generated_race_variety_v2();

do $block$
declare r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid='public.youth_races'::regclass
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%distance_km%'
  loop
    execute format('alter table public.youth_races drop constraint %I',r.conname);
  end loop;
end;
$block$;

update public.youth_races
set distance_km=greatest(60,least(130,distance_km))
where distance_km<60 or distance_km>130;

alter table public.youth_races
  add constraint youth_races_distance_km_v2_check
  check(distance_km between 60 and 130);

update public.youth_races r
set metadata=coalesce(r.metadata,'{}'::jsonb)-'calendar_variety_version',
    updated_at=now()
where r.metadata->>'calendar_source'='youth_hierarchy_v1'
  and not exists(
    select 1 from public.youth_race_processing_log l where l.race_id=r.id
  );

update public.youth_race_invitations i
set invited_on=case r.competition_class
      when 'world' then r.race_date-28
      when 'continental' then r.race_date-21
      else r.race_date-18
    end,
    response_deadline=r.invitation_response_deadline,
    updated_at=now()
from public.youth_races r
where r.id=i.race_id
  and r.metadata->>'calendar_source'='youth_hierarchy_v1'
  and i.status='pending';
