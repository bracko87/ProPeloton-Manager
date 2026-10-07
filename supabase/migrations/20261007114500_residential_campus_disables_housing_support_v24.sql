-- Team Residential Campus owns permanent home-base accommodation.
-- Keep away-race / tour / Training Camp accommodation policies unchanged,
-- but remove the separate rider Housing Support policy while the campus exists.

update public.club_team_policies ctp
set
  rider_housing_support = 'none',
  updated_at = now()
where ctp.rider_housing_support <> 'none'
  and public.team_residential_campus_active_v1(ctp.club_id);

create or replace function private.enforce_residential_campus_housing_policy_v24()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'pg_temp'
as $function$
begin
  if coalesce(new.team_residential_campus_level, 0) >= 1 then
    update public.club_team_policies
    set
      rider_housing_support = 'none',
      updated_at = now()
    where club_id = new.club_id
      and rider_housing_support <> 'none';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_residential_campus_disables_housing_support_v24
on public.club_infrastructure;

create trigger trg_residential_campus_disables_housing_support_v24
after insert or update of team_residential_campus_level
on public.club_infrastructure
for each row
execute function private.enforce_residential_campus_housing_policy_v24();

revoke all on function private.enforce_residential_campus_housing_policy_v24() from public;
revoke all on function private.enforce_residential_campus_housing_policy_v24() from anon;
revoke all on function private.enforce_residential_campus_housing_policy_v24() from authenticated;

-- Server-side guard: even an older client cannot re-enable rider housing support
-- after the Team Residential Campus has been built.
do $patch_update_team_policies$
declare
  ddl text;
  patched text;
begin
  ddl := pg_get_functiondef(
    'public.update_club_team_policies(uuid,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure
  );

  if position('team_residential_campus_active_v1(p_club_id)' in ddl) = 0 then
    patched := regexp_replace(
      ddl,
      'rider_housing_support[[:space:]]*=[[:space:]]*p_rider_housing_support[[:space:]]*,',
      'rider_housing_support = case when public.team_residential_campus_active_v1(p_club_id) then ''none'' else p_rider_housing_support end,',
      'g'
    );

    if patched = ddl then
      raise exception 'Could not patch update_club_team_policies housing assignment';
    end if;

    execute patched;
  end if;
end;
$patch_update_team_policies$;
