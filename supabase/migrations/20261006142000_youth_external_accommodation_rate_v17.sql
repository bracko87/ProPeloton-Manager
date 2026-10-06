-- Align non-local U16/U23 home accommodation with the agreed
-- $240/week standard. Existing signed U16 agreements are not rewritten;
-- future scouting offers use $240/week for foreign riders.

create or replace function private.youth_standard_external_accommodation_weekly_v1(
  p_club_country_code text,
  p_rider_country_code text
)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case
    when upper(coalesce(p_club_country_code,''))=
         upper(coalesce(p_rider_country_code,'')) then 0
    else 240
  end;
$function$;

do $patch_youth_scouting_accommodation$
declare
  ddl text;
  old_block text;
  new_block text;
begin
  ddl:=pg_get_functiondef(
    'public.run_my_youth_scouting_search_v2(boolean)'::regprocedure
  );

  old_block:=
    '    v_accommodation:=case'||chr(10)||
    '      when upper(v_country)=upper(v_club.country_code) then 0'||chr(10)||
    '      when v_relocation=''moderate'' then 70+floor(random()*41)::integer'||chr(10)||
    '      when v_relocation=''hard'' then 100+floor(random()*61)::integer'||chr(10)||
    '      else 130+floor(random()*91)::integer'||chr(10)||
    '    end;';

  new_block:=
    '    v_accommodation:=private.youth_standard_external_accommodation_weekly_v1('||
    chr(10)||'      v_club.country_code,v_country'||
    chr(10)||'    );';

  if position(
    'youth_standard_external_accommodation_weekly_v1' in ddl
  )=0 then
    if position(old_block in ddl)=0 then
      raise exception 'Could not find Youth scouting accommodation block';
    end if;
    ddl:=replace(ddl,old_block,new_block);
    execute ddl;
  end if;
end;
$patch_youth_scouting_accommodation$;

create or replace function public.finance_process_weekly_developing_team_accommodation_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,finance,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  week_key text;
  x record;
  rider_count integer;
  amount bigint;
  existing_id uuid;
  funds jsonb;
  charged integer:=0;
  total bigint:=0;
begin
  if gd is null then
    return jsonb_build_object('ok',false,'reason','game_date_missing');
  end if;

  if extract(isodow from gd)::integer<>1 then
    return jsonb_build_object(
      'ok',true,'did_run',false,'reason','not_week_start','game_date',gd
    );
  end if;

  week_key:=to_char(gd,'IYYY-IW');

  for x in
    select p.id parent_club_id,p.country_code,d.id developing_club_id
    from public.clubs p
    join public.clubs d
      on d.parent_club_id=p.id and d.club_type='developing'
    where p.club_type='main'
      and p.deleted_at is null
      and d.deleted_at is null
      and p.owner_user_id is not null
      and coalesce(p.is_ai,false)=false
  loop
    if public.team_residential_campus_active_v1(x.parent_club_id) then
      continue;
    end if;

    select count(*)::integer
    into rider_count
    from public.club_riders cr
    join public.riders r on r.id=cr.rider_id
    where cr.club_id=x.developing_club_id
      and upper(coalesce(r.country_code,''))<>
          upper(coalesce(x.country_code,''));

    amount:=greatest(0,coalesce(rider_count,0))*240;
    if amount<=0 then continue; end if;

    select t.id
    into existing_id
    from finance.transactions t
    where t.idempotency_key=
      'u23_home_accommodation:'||x.parent_club_id::text||':'||week_key
    limit 1;

    if existing_id is not null then continue; end if;

    funds:=public.finance_ensure_mandatory_funds(
      x.parent_club_id,
      amount,
      'u23_home_accommodation',
      week_key,
      'mandatory_funds:u23_home_accommodation:'||
        x.parent_club_id::text||':'||week_key
    );

    if coalesce((funds->>'ok')::boolean,false) is not true then
      continue;
    end if;

    perform public.finance_spend_from_club(
      x.parent_club_id,
      amount,
      'u23_home_accommodation',
      'SINK',
      'u23_home_accommodation:'||x.parent_club_id::text||':'||week_key,
      jsonb_build_object(
        'developing_club_id',x.developing_club_id,
        'non_local_u23_riders',rider_count,
        'weekly_rate_per_rider',240,
        'week_key',week_key,
        'game_date',gd,
        'source','u23_home_accommodation'
      )
    );

    charged:=charged+1;
    total:=total+amount;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'did_run',true,
    'game_date',gd,
    'week_key',week_key,
    'clubs_charged',charged,
    'weekly_rate_per_non_local_rider',240,
    'total_charged',total
  );
end;
$function$;

select public.monitor_special_infrastructure_health_v1();
