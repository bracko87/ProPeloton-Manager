-- Production migration applied 2026-11-23 11:32:42 UTC.
-- Give new Saturn guest teams a real home jersey selected from the existing
-- generic Storage pool (CreateClub uses these same Genkit assets).
-- A chosen/uploaded jersey is never replaced; team, coins, Premium, clock
-- and registration/identity workflows are unchanged.

create or replace function private.saturn_assign_missing_home_kit_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_asset_name text;
  v_url text;
begin
  if exists (
    select 1 from public.team_kits k
    where k.team_id = new.club_id and k.name = 'home'
  ) then
    return new;
  end if;

  select o.name into v_asset_name
  from storage.objects o
  join storage.buckets b on b.id = o.bucket_id
  where o.bucket_id = 'Admin Staff'
    and b.public is true
    and o.name ~ '^AI Teams Kits/[Gg]enkit[0-9]+[.]png$'
  order by random()
  limit 1;

  -- Failure of the asset pool must not stop the club onboarding transaction.
  if v_asset_name is null then
    raise warning 'Saturn generic jersey pool unavailable for club %', new.club_id;
    return new;
  end if;

  v_url := 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/'
      || replace(v_asset_name, ' ', '%20');

  insert into public.team_kits(team_id, name, config, updated_at)
  values (
    new.club_id,
    'home',
    jsonb_build_object(
      'version', 1,
      'mode', 'generic_pool',
      'template', 'generic_pool',
      'image_url', v_url,
      'image_data_url', null,
      'original_generic_image_url', v_url,
      'source', 'saturn_guest_default'
    ),
    now()
  )
  on conflict (team_id, name) do nothing;

  return new;
end;
$function$;

revoke all on function private.saturn_assign_missing_home_kit_v1()
  from public, anon, authenticated;

create trigger saturn_assign_missing_home_kit_v1
after insert on public.saturn_test_accounts_v1
for each row execute function private.saturn_assign_missing_home_kit_v1();

-- One-time backfill only where the guest-origin club has no 'home' record;
-- applies to already-converted guests too, preserving all selected kits.
do $backfill$
declare
  v_club_id uuid;
  v_asset_name text;
  v_url text;
begin
  for v_club_id in
    select s.club_id
    from public.saturn_test_accounts_v1 s
    where not exists (
      select 1 from public.team_kits k
      where k.team_id = s.club_id and k.name = 'home'
    )
  loop
    select o.name into v_asset_name
    from storage.objects o
    join storage.buckets b on b.id = o.bucket_id
    where o.bucket_id = 'Admin Staff'
      and b.public is true
      and o.name ~ '^AI Teams Kits/[Gg]enkit[0-9]+[.]png$'
    order by random()
    limit 1;

    if v_asset_name is null then
      raise warning 'Generic jersey pool empty during Saturn backfill';
      exit;
    end if;

    v_url := 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/'
        || replace(v_asset_name, ' ', '%20');

    insert into public.team_kits(team_id, name, config, updated_at)
    values (
      v_club_id,
      'home',
      jsonb_build_object(
        'version', 1,
        'mode', 'generic_pool',
        'template', 'generic_pool',
        'image_url', v_url,
        'image_data_url', null,
        'original_generic_image_url', v_url,
        'source', 'saturn_guest_default'
      ),
      now()
    )
    on conflict (team_id, name) do nothing;
  end loop;
end;
$backfill$;
