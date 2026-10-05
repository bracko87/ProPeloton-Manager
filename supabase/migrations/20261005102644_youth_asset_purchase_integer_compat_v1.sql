
create or replace function private.purchase_youth_academy_asset_v1(
  p_academy_id uuid,
  p_asset_key text,
  p_asset_level integer,
  p_actor text
)
returns uuid
language sql
security definer
set search_path=public,private,pg_temp
as $$
  select private.purchase_youth_academy_asset_v1(
    p_academy_id,p_asset_key,p_asset_level::smallint,p_actor
  );
$$;

revoke all on function private.purchase_youth_academy_asset_v1(uuid,text,integer,text)
from public,anon,authenticated;
