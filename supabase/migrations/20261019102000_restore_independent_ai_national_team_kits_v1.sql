-- Restore AI national club kits polluted by earlier Association customization.
-- The separated Association identity retains its own uploaded jersey.
-- No race result, roster, start list or race snapshot is rewritten.
update public.team_kits k
set config = jsonb_set(
               jsonb_set(
                 k.config,
                 '{image_url}',
                 to_jsonb(k.config->>'original_generic_image_url'),
                 true
               ),
               '{source}',
               to_jsonb('ai_national_pool_own_kit'::text),
               true
             ),
    updated_at=now()
from public.clubs c
where c.id=k.team_id
  and c.is_ai=true
  and c.is_active=true
  and public.is_national_team_club_v1(c.id)
  and k.name='home'
  and k.config->>'source' in ('national_association_customization','national_association_default')
  and coalesce(k.config->>'original_generic_image_url','')<>''
  and not exists(
    select 1 from public.national_association_race_team_identities ni
    where ni.technical_club_id=c.id
  )
  and k.config->>'image_url' is distinct from
      k.config->>'original_generic_image_url';
