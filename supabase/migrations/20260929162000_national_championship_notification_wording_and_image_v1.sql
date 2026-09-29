-- National Championship notification wording/image correction.
-- "National Duty" is reserved for the separate National Team system.
-- National Championship participation is never described as National Duty.

update public.notification_types
set default_image_url='https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
where code in (
  'NATIONAL_CHAMPIONSHIP_SELECTED',
  'NATIONAL_CHAMPIONSHIP_QUALIFICATION_RESULT',
  'NATIONAL_CHAMPIONSHIP_QUALIFIED',
  'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
  'NATIONAL_CHAMPIONSHIP_FINAL_RESULT',
  'NATIONAL_CHAMPION'
);

create or replace function public.national_championship_notify_selection_v1(p_edition_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer:=0;
  v_country_name text;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then return 0; end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=upper(e.country_code)
  limit 1;

  v_country_name:=coalesce(v_country_name,e.country_code);

  for x in
    select
      en.rider_id,en.rider_name_snapshot,en.entry_path,en.heat_number,
      en.participation_decision,h.qualification_date,
      root.owner_user_id
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root
      on root.id=case
        when rc.club_type='developing' and rc.parent_club_id is not null
          then rc.parent_club_id
        else rc.id
      end
    where en.edition_id=e.id
      and root.owner_user_id is not null
  loop
    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_name_snapshot||' selected for National Championship',
      x.rider_name_snapshot||' is selected for the '||v_country_name||
        ' National Championship. '||
        case
          when x.entry_path='qualification'
            then 'Qualification Group '||coalesce(x.heat_number,1)||
                 ' races on '||x.qualification_date||
                 '. If the rider qualifies, the final is on '||e.final_date||'. '
          else 'No qualification is required; the final is on '||e.final_date||'. '
        end||
        'Open National Championship participation to approve or refuse the rider before '||
        e.participation_decision_deadline||'.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'country_name',v_country_name,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',x.qualification_date,
        'qualification_window_start_date',e.qualification_window_start_date,
        'qualification_window_end_date',e.qualification_window_end_date,
        'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'participation_decision',x.participation_decision,
        'action_path','/dashboard/national-ranking?tab=duty',
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$$;

-- Backfill the shared image into existing National Championship notifications
-- so already-created inbox items render consistently too.
update public.notifications n
set payload_json=coalesce(n.payload_json,'{}'::jsonb)
  || jsonb_build_object(
       'image_url',
       'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
     )
from public.notification_types nt
where nt.id=n.type_id
  and nt.code in (
    'NATIONAL_CHAMPIONSHIP_SELECTED',
    'NATIONAL_CHAMPIONSHIP_QUALIFICATION_RESULT',
    'NATIONAL_CHAMPIONSHIP_QUALIFIED',
    'NATIONAL_CHAMPIONSHIP_FINAL_CONFIRMATION_REQUIRED',
    'NATIONAL_CHAMPIONSHIP_FINAL_RESULT',
    'NATIONAL_CHAMPION'
  )
  and coalesce(n.payload_json->>'image_url','')='';

-- Correct already-generated selection notification wording without touching
-- unrelated notification types.
update public.notifications n
set title=regexp_replace(
      n.title,
      ' selected for National Duty$',
      ' selected for National Championship'
    ),
    message=replace(
      replace(
        n.message,
        'Open My National Duty to approve or refuse participation',
        'Open National Championship participation to approve or refuse the rider'
      ),
      'National Duty',
      'National Championship participation'
    )
from public.notification_types nt
where nt.id=n.type_id
  and nt.code='NATIONAL_CHAMPIONSHIP_SELECTED';
