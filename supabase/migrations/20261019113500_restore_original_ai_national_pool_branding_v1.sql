-- Restore the six independent AI national clubs whose identities were
-- accidentally overwritten by National Association branding.
-- Keep all Association technical identities, squads and historic race snapshots intact.
-- The original assets are verified against the existing Supabase Storage catalog.
create table if not exists public.ai_national_pool_branding_restore_audit_v1 (
  club_id uuid primary key references public.clubs(id),
  country_code text not null,
  original_logo_path text,
  original_kit_config jsonb,
  restored_logo_path text not null,
  restored_jersey_url text not null,
  restored_at timestamptz not null default now()
);

do $restore$
declare
  v record;
  v_club_id uuid;
  v_matches integer;
  v_logo_url text;
  v_jersey_url text;
  v_prefix text := 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/';
begin
  for v in
    select * from (values
      ('AU','Australia National Team','AI Teams Logo/Australia National.png','AI Teams Kits/Australia National.png'),
      ('BD','Bangladesh National team','AI Teams Logo/Bangladesh national.png','AI Teams Kits/Bangladesh national.png'),
      ('BO','National Team Bolivia','AI Teams Logo/Bolivia National.png','AI Teams Kits/Bolivia Team.png'),
      ('BR','Brasil National team','AI Teams Logo/Brasil National.png','AI Teams Kits/Brasil National.png'),
      ('NZ','New Zealand National Team','AI Teams Logo/New Zealand national.png','AI Teams Kits/New Zealand National.png'),
      ('RS','Serbian National Team','AI Teams Logo/Serbain national.png','AI Teams Kits/Serbia National.png')
    ) as assets(country_code, club_name, logo_object, jersey_object)
  loop
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id='Admin Staff' and o.name=v.logo_object
    ) or not exists (
      select 1 from storage.objects o
      where o.bucket_id='Admin Staff' and o.name=v.jersey_object
    ) then
      raise exception 'Original AI national team assets missing for %',v.country_code;
    end if;

    select count(*), (array_agg(c.id))[1]
      into v_matches,v_club_id
    from public.clubs c
    where c.country_code=v.country_code
      and c.name=v.club_name
      and c.is_ai is true
      and c.is_active is true
      and c.created_at < '2026-09-29'::timestamptz
      and exists (
        select 1 from public.club_roster_country_rules r
        where r.club_id=c.id and r.rule_key='national_team_country_lock_v1'
          and r.is_active and r.allowed_country_code=v.country_code
      )
      and not exists (
        select 1 from public.national_association_race_team_identities i
        where i.technical_club_id=c.id
      );

    if v_matches <> 1 then
      raise exception 'Expected one independent AI club for %, found %',v.country_code,v_matches;
    end if;
    if exists (
      select 1 from public.club_riders cr
      join public.riders r on r.id=cr.rider_id
      where cr.club_id=v_club_id
        and upper(coalesce(r.country_code,''))<>v.country_code
    ) then
      raise exception 'AI national team % has riders of other nationalities',v.country_code;
    end if;

    v_logo_url := v_prefix || replace(v.logo_object,' ','%20');
    v_jersey_url := v_prefix || replace(v.jersey_object,' ','%20');

    insert into public.ai_national_pool_branding_restore_audit_v1
      (club_id,country_code,original_logo_path,original_kit_config,restored_logo_path,restored_jersey_url)
    select c.id,c.country_code,c.logo_path,k.config,v_logo_url,v_jersey_url
      from public.clubs c
      left join public.team_kits k on k.team_id=c.id and k.name='home'
      where c.id=v_club_id
    on conflict (club_id) do nothing;

    update public.clubs
      set logo_path=v_logo_url,updated_at=now()
      where id=v_club_id and logo_path is distinct from v_logo_url;

    insert into public.team_kits (team_id,name,config,updated_at)
    values (
      v_club_id,'home',
      jsonb_build_object(
        'version',1,
        'template','striped-tshirt',
        'mode','image_url',
        'image_url',v_jersey_url,
        'image_data_url',null,
        'original_generic_image_url',v_jersey_url,
        'source','ai_national_pool_own_kit'
      ),
      now()
    )
    on conflict (team_id,name) do update
      set config=excluded.config,updated_at=now();
  end loop;
end $restore$;

comment on table public.ai_national_pool_branding_restore_audit_v1 is
  'One-time original logo/jersey restoration audit of six legacy AI national pool clubs, separate from National Association selections.';
