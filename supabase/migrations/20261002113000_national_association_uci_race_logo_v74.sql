
create or replace function public.enforce_national_association_race_logo_v1()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_logo constant text :=
    'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/world%20championship%20logo.webp';
begin
  if coalesce(new.metadata->>'nations_competition','false')='true' then
    new.logo_url := v_logo;
    new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'custom_logo_url',v_logo,
      'display_logo_mode','custom_logo',
      'national_association_race_logo',true
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_enforce_national_association_race_logo_v1
  on public.races;

create trigger trg_enforce_national_association_race_logo_v1
before insert or update of logo_url,metadata
on public.races
for each row
execute function public.enforce_national_association_race_logo_v1();

update public.races
set logo_url='https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/world%20championship%20logo.webp',
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'custom_logo_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Others/world%20championship%20logo.webp',
      'display_logo_mode','custom_logo',
      'national_association_race_logo',true
    ),
    updated_at=now()
where coalesce(metadata->>'nations_competition','false')='true';
