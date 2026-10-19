-- Temporary policy: U16 recruitment is exclusively through unattached-rider Academy scouting.
-- Keep existing historical results and contracts; no attached Youth Academy rider can be offered on.
do $migration$
declare
  source_def text;
  patched text;
begin
  select pg_get_functiondef(p.oid) into source_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='run_my_youth_scouting_search_v2';
  if source_def is null or position('if random()<0.30 then' in source_def)=0 then
    raise exception 'Youth scouting search definition changed; review attached candidate branch';
  end if;
  patched:=replace(source_def,'if random()<0.30 then',
    'if false then -- Attached U16 prospects intentionally suspended; scout unattached prospects only');
  execute patched;

  select pg_get_functiondef(p.oid) into source_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_public_youth_academy_profile_v1';
  if source_def is null or position('if not found then return null; end if;' in source_def)=0 then
    raise exception 'U16 Academy profile definition changed';
  end if;
  patched:=replace(source_def,'if not found then return null; end if;',
    'if not found then return null; end if;
     if v_record.owner_user_id is distinct from v_owner then return null; end if;');
  execute patched;

  select pg_get_functiondef(p.oid) into source_def
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_public_youth_rider_profile_v1';
  if source_def is null or position('if not found then return null; end if;' in source_def)=0 then
    raise exception 'U16 rider profile definition changed';
  end if;
  patched:=replace(source_def,'if not found then return null; end if;',
    'if not found then return null; end if;
     if v_r.owner_user_id is distinct from v_user then return null; end if;');
  execute patched;
end;
$migration$;

-- Existing public RPC remains present for backwards-compatible clients,
-- but performs no direct scouting, charges zero Coins, and creates no report.
create or replace function public.scout_youth_rider_direct_v1(
  p_youth_rider_id uuid,p_use_coins boolean default false
) returns jsonb language plpgsql security definer
set search_path to 'public','private','auth','pg_temp'
as $function$
begin
  raise exception 'Direct scouting of another Academy U16 rider is temporarily unavailable. Use Youth Academy scouting to discover unattached riders.';
end;
$function$;

create or replace function private.reject_attached_u16_offer_v2()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.youth_scouting_reports report
    where report.id=new.report_id and report.target_kind='academy'
  ) and (tg_op='INSERT' or new.status is distinct from old.status) then
    raise exception 'Recruiting riders contracted to another U16 Academy is currently disabled.';
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_block_attached_offers_v2 on public.youth_recruitment_offers;
create trigger youth_block_attached_offers_v2
before insert or update of status on public.youth_recruitment_offers
for each row execute function private.reject_attached_u16_offer_v2();

create or replace function private.reject_attached_u16_scout_report_v2()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  if new.target_kind='academy' then
    raise exception 'Direct U16 Academy-to-Academy scouting is disabled; use unattached prospects.';
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_block_attached_scout_reports_v2 on public.youth_scouting_reports;
create trigger youth_block_attached_scout_reports_v2
before insert on public.youth_scouting_reports
for each row execute function private.reject_attached_u16_scout_report_v2();
