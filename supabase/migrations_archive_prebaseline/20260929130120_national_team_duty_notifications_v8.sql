insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group,default_image_url
)
values
  ('NATIONAL_TEAM_DUTY_STARTED','National Duty Started','game','flag',82,true,'races',null),
  ('NATIONAL_TEAM_DUTY_COMPLETED','National Duty Completed','game','check-circle',70,true,'races',null)
on conflict(code) do update
set name=excluded.name,
    source=excluded.source,
    icon_name=excluded.icon_name,
    priority=excluded.priority,
    is_active=true,
    preference_group=excluded.preference_group;

create or replace function private.trg_notify_national_team_duty_status_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_member record;
  v_assoc record;
  v_type text;
  v_title text;
  v_message text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('active','completed') then
    return new;
  end if;

  select a.name,a.country_code
  into v_assoc
  from public.national_associations a
  where a.id=new.association_id;

  if new.status='active' then
    v_type:='NATIONAL_TEAM_DUTY_STARTED';
  else
    v_type:='NATIONAL_TEAM_DUTY_COMPLETED';
  end if;

  for v_member in
    select
      sm.rider_id,
      coalesce(c.rider_name_snapshot,r.display_name,sm.rider_id::text) as rider_name,
      c.club_owner_user_id_snapshot as user_id
    from public.national_team_squad_members sm
    left join public.national_team_callups c on c.id=sm.callup_id
    left join public.riders r on r.id=sm.rider_id
    where sm.squad_id=new.squad_id
      and c.club_owner_user_id_snapshot is not null
  loop
    if new.status='active' then
      v_title:='National Duty started for '||v_member.rider_name;
      v_message:=v_member.rider_name||
        ' is now on National Duty with '||coalesce(v_assoc.name,'the National Team')||
        ' from '||new.start_date::text||' through '||new.end_date::text||
        ' and is unavailable for overlapping club races.';
    else
      v_title:='National Duty completed for '||v_member.rider_name;
      v_message:=v_member.rider_name||
        ' has completed National Duty with '||coalesce(v_assoc.name,'the National Team')||
        ' and is available to the club again, subject to normal health and race availability.';
    end if;

    perform public.create_user_game_notification_v1(
      v_member.user_id,
      v_type,
      v_title,
      v_message,
      '/dashboard/national-association',
      jsonb_build_object(
        'duty_id',new.id,
        'squad_id',new.squad_id,
        'association_id',new.association_id,
        'association_name',v_assoc.name,
        'country_code',v_assoc.country_code,
        'season_number',new.season_number,
        'cycle_key',new.cycle_key,
        'rider_id',v_member.rider_id,
        'rider_name',v_member.rider_name,
        'start_date',new.start_date,
        'end_date',new.end_date,
        'status',new.status
      ),
      'national-team-duty:'||new.id::text||':'||v_member.rider_id::text||':'||new.status,
      null
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_notify_national_team_duty_status_v1 on public.national_team_duties;
create trigger trg_notify_national_team_duty_status_v1
after update of status
on public.national_team_duties
for each row execute function private.trg_notify_national_team_duty_status_v1();
