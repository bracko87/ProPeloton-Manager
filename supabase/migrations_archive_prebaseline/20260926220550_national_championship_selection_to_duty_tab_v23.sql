CREATE OR REPLACE FUNCTION public.national_championship_notify_selection_v1(p_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    return 0;
  end if;

  for x in
    select
      en.rider_id,
      en.rider_name_snapshot,
      en.entry_path,
      en.heat_number,
      en.participation_decision,
      root.owner_user_id
    from public.national_championship_entries en
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
      x.rider_name_snapshot||' selected for National Duty',
      x.rider_name_snapshot||
        ' is selected for the '||e.country_code||
        ' National Road Championship window from '||
        e.duty_window_start_date||' to '||e.duty_window_end_date||
        '. The rider is blocked from club races on all three days. '||
        case
          when x.entry_path='qualification'
            then 'Qualification heat '||coalesce(x.heat_number,1)||
                 ' is on '||e.qualification_date||' and the final is on '||e.final_date||'. '
          else 'The rider is directly qualified for the final on '||e.final_date||'. '
        end||
        'Open National Ranking to approve or refuse participation before '||
        e.participation_decision_deadline||'. Refusing releases the rider for club duty but reduces morale.',
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'country_code',e.country_code,
        'rider_id',x.rider_id,
        'rider_name',x.rider_name_snapshot,
        'entry_path',x.entry_path,
        'heat_number',x.heat_number,
        'qualification_date',e.qualification_date,
        'final_date',e.final_date,
        'duty_window_start_date',e.duty_window_start_date,
        'duty_window_end_date',e.duty_window_end_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'participation_decision',x.participation_decision,
        'action_path','/dashboard/national-ranking?tab=duty'
      ),
      'national-championship-selection:'||e.id::text||':'||x.rider_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;
