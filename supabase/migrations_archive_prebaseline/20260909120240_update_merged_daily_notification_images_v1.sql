create or replace function public.set_merged_daily_notification_image_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_image_url text;
begin
  select nt.code into v_code
  from public.notification_types nt
  where nt.id = new.type_id;

  v_image_url := case v_code
    when 'RACE_APPLICATION_DAILY_UPDATE' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20daily%20update.png'
    when 'RACE_PREPARATION_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Preparation%20daily%20report.png'
    when 'STAGE_PLANNING_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Planning%20Daily%20Report.png'
    when 'RIDER_HEALTH_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20health%20daily%20report.png'
    else null
  end;

  if v_image_url is not null then
    new.payload_json := jsonb_set(
      coalesce(new.payload_json, '{}'::jsonb),
      '{image_url}',
      to_jsonb(v_image_url),
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_merged_daily_notification_image_v1 on public.notifications;
create trigger trg_set_merged_daily_notification_image_v1
before insert or update of type_id, payload_json on public.notifications
for each row execute function public.set_merged_daily_notification_image_v1();

update public.notifications n
set payload_json = coalesce(n.payload_json, '{}'::jsonb)
from public.notification_types nt
where nt.id = n.type_id
  and nt.code in (
    'RACE_APPLICATION_DAILY_UPDATE',
    'RACE_PREPARATION_DAILY_REPORT',
    'STAGE_PLANNING_DAILY_REPORT',
    'RIDER_HEALTH_DAILY_REPORT'
  );