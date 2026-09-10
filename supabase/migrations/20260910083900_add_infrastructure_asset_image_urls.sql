alter table public.infrastructure_asset_config
  add column if not exists image_url text;

comment on column public.infrastructure_asset_config.image_url is
  'Public image URL for the purchasable infrastructure asset tier. Frontend must fall back safely when null or unavailable.';

update public.infrastructure_asset_config
set image_url = case asset_level
  when 1 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%201.png'
  when 2 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%202.png'
  when 3 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%203.png'
  when 4 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%204.png'
  when 5 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/car%20level%205.png'
end
where asset_key = 'team_car'
  and asset_level between 1 and 5;

update public.infrastructure_asset_config
set image_url = case asset_level
  when 1 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Team%20Bus%20lvl1.png'
  when 2 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Team%20Bus%20lvl2.png'
  when 3 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Team%20Bus%20lvl3.png'
end
where asset_key = 'team_bus'
  and asset_level between 1 and 3;

update public.infrastructure_asset_config
set image_url = case asset_level
  when 1 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Equipment%20Van%20lvl1.png'
  when 2 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Equipment%20Van%20lvl2.png'
  when 3 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Equipment%20Van%20lvl3.png'
end
where asset_key = 'equipment_van'
  and asset_level between 1 and 3;

update public.infrastructure_asset_config
set image_url = case asset_level
  when 1 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Mobile%20Workshops%20lvl%201.png'
  when 2 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Mobile%20Workshops%20lvl%202.png'
end
where asset_key = 'mobile_workshop'
  and asset_level between 1 and 2;

update public.infrastructure_asset_config
set image_url = case asset_level
  when 1 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Medical%20Van%20lvl1.png'
  when 2 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Medical%20Van%20lvl%202.png'
  when 3 then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Assets/Medical%20Van%20lvl%203.png'
end
where asset_key = 'medical_van'
  and asset_level between 1 and 3;
