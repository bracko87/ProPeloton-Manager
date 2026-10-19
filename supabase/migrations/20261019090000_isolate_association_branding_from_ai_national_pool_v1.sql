-- Previously, some association technical identities re-used real AI national
-- club IDs. Their logo/jersey must NEVER be overwritten by association settings.
-- Future generated hidden technical clubs still receive association branding.
create or replace function private.sync_national_association_identity_v1(p_association_id uuid)
returns void language plpgsql security definer set search_path to ''
as $$
declare
  v_assoc public.national_associations%rowtype;
  v_team_id uuid;
  v_source text;
  v_logo text;
  v_jersey text;
  v_jersey_mode text;
begin
  select * into v_assoc
    from public.national_associations where id=p_association_id;
  if v_assoc.id is null then return; end if;

  select technical_club_id,identity_source into v_team_id,v_source
    from public.national_association_race_team_identities
    where association_id=v_assoc.id limit 1;
  if v_team_id is null then return; end if;

  -- Preserve the independent AI team's crest and normal club jersey.
  -- Association pages use association-owned logo_url and jersey_url directly.
  if v_source = 'existing_national_team_pool' then
    return;
  end if;

  v_logo := private.national_association_resolved_logo_url_v1(
    v_assoc.country_code,v_assoc.logo_url
  );
  v_jersey := coalesce(
    nullif(btrim(v_assoc.jersey_url),''),
    private.national_association_default_jersey_url_v1(v_assoc.country_code)
  );
  update public.clubs
    set logo_path=v_logo,updated_at=now()
    where id=v_team_id;

  v_jersey_mode := case
    when v_assoc.jersey_url is null or btrim(v_assoc.jersey_url)=''
      then 'generic_pool' else 'image_url' end;

  insert into public.team_kits(team_id,name,config,updated_at)
  values (
    v_team_id,'home',
    jsonb_build_object(
      'version',1,
      'template',case when v_jersey_mode='generic_pool'
        then 'generic_pool' else 'striped-tshirt' end,
      'mode',v_jersey_mode,
      'image_url',v_jersey,
      'image_data_url',null,
      'original_generic_image_url',
        private.national_association_default_jersey_url_v1(v_assoc.country_code),
      'source',case when v_jersey_mode='generic_pool'
        then 'national_association_default'
        else 'national_association_customization' end
    ),now()
  )
  on conflict(team_id,name) do update
    set config=excluded.config,updated_at=now();
end $$;
