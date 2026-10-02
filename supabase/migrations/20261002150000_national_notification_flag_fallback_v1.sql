-- Ensure National Association / National Team / World Nations notifications
-- always carry enough nation metadata for a flag fallback image.
-- Dedicated notification images still take precedence in the frontend.

create or replace function private.enrich_national_notification_payload_v1(
  p_type_id bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
  v_code text;
  v_assoc_id uuid;
  v_candidate text;
  v_country_code text;
  v_association_name text;
begin
  select nt.code
  into v_code
  from public.notification_types nt
  where nt.id=p_type_id
  limit 1;

  if v_code is null or not (
    v_code like 'NATIONAL_ASSOCIATION_%'
    or v_code like 'NATIONAL_COACH_%'
    or v_code like 'NATIONAL_TEAM_%'
    or v_code like 'NATIONS_%'
  ) then
    return v_payload;
  end if;

  -- Prefer an explicit association reference when present.
  v_candidate:=nullif(v_payload->>'association_id','');
  if v_candidate is not null
     and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_assoc_id:=v_candidate::uuid;
  end if;

  -- Otherwise derive the association from the strongest entity reference.
  if v_assoc_id is null then
    v_candidate:=nullif(v_payload->>'election_id','');
    if v_candidate is not null
       and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select e.association_id
      into v_assoc_id
      from public.national_coach_elections e
      where e.id=v_candidate::uuid;
    end if;
  end if;

  if v_assoc_id is null then
    v_candidate:=nullif(v_payload->>'callup_id','');
    if v_candidate is not null
       and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select c.association_id
      into v_assoc_id
      from public.national_team_callups c
      where c.id=v_candidate::uuid;
    end if;
  end if;

  if v_assoc_id is null then
    v_candidate:=nullif(v_payload->>'squad_id','');
    if v_candidate is not null
       and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select s.association_id
      into v_assoc_id
      from public.national_team_squads s
      where s.id=v_candidate::uuid;
    end if;
  end if;

  if v_assoc_id is null then
    v_candidate:=nullif(v_payload->>'selection_id','');
    if v_candidate is not null
       and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select s.association_id
      into v_assoc_id
      from public.national_team_selection_cycles s
      where s.id=v_candidate::uuid;
    end if;
  end if;

  if v_assoc_id is null then
    v_candidate:=nullif(v_payload->>'competition_entry_id','');
    if v_candidate is not null
       and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select e.association_id
      into v_assoc_id
      from public.nations_competition_entries e
      where e.id=v_candidate::uuid;
    end if;
  end if;

  if v_assoc_id is null then
    v_candidate:=coalesce(
      nullif(v_payload->>'host_association_id',''),
      nullif(v_payload->>'champion_association_id','')
    );
    if v_candidate is not null
       and v_candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_assoc_id:=v_candidate::uuid;
    end if;
  end if;

  if v_assoc_id is not null then
    select upper(a.country_code),a.name
    into v_country_code,v_association_name
    from public.national_associations a
    where a.id=v_assoc_id;

    if nullif(v_payload->>'association_id','') is null then
      v_payload:=v_payload||jsonb_build_object('association_id',v_assoc_id);
    end if;
  end if;

  -- Host/champion/rider nation fields are valid fallbacks if no association
  -- could be resolved (or for old payload shapes).
  v_country_code:=coalesce(
    nullif(upper(v_payload->>'country_code'),''),
    nullif(v_country_code,''),
    nullif(upper(v_payload->>'host_country_code'),''),
    nullif(upper(v_payload->>'champion_country_code'),''),
    nullif(upper(v_payload->>'association_country_code'),''),
    nullif(upper(v_payload->>'nation_country_code'),''),
    nullif(upper(v_payload->>'nation_code'),''),
    nullif(upper(v_payload->>'team_country_code'),''),
    nullif(upper(v_payload->>'rider_country_code'),'')
  );

  if v_country_code is not null then
    v_payload:=v_payload||jsonb_build_object('country_code',v_country_code);
  end if;

  if nullif(v_payload->>'association_name','') is null
     and nullif(v_association_name,'') is not null then
    v_payload:=v_payload||jsonb_build_object('association_name',v_association_name);
  end if;

  return v_payload;
exception
  when others then
    -- Notification creation must never fail only because optional presentation
    -- metadata could not be enriched.
    return coalesce(p_payload,'{}'::jsonb);
end;
$function$;

revoke all on function private.enrich_national_notification_payload_v1(bigint,jsonb)
from public,anon,authenticated;

create or replace function private.trg_enrich_national_notification_payload_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  new.payload_json:=private.enrich_national_notification_payload_v1(
    new.type_id,
    new.payload_json
  );
  return new;
end;
$function$;

drop trigger if exists enrich_national_notification_payload_v1
on public.notifications;

create trigger enrich_national_notification_payload_v1
before insert or update of type_id,payload_json
on public.notifications
for each row
execute function private.trg_enrich_national_notification_payload_v1();

-- Repair existing National Association / National Team / World Nations notices
-- so already-delivered unread/read notifications can render their country flag.
with enriched as (
  select
    n.id,
    private.enrich_national_notification_payload_v1(n.type_id,n.payload_json) as payload_json
  from public.notifications n
  join public.notification_types nt on nt.id=n.type_id
  where
    nt.code like 'NATIONAL_ASSOCIATION_%'
    or nt.code like 'NATIONAL_COACH_%'
    or nt.code like 'NATIONAL_TEAM_%'
    or nt.code like 'NATIONS_%'
)
update public.notifications n
set payload_json=e.payload_json
from enriched e
where e.id=n.id
  and n.payload_json is distinct from e.payload_json;
