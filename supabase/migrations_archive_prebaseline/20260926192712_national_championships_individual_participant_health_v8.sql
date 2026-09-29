create or replace function public.enforce_race_participant_rider_health_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_race_date date;
  v_is_national_championship boolean := false;
begin
  perform public.assert_rider_race_selectable_v1(new.rider_id);

  select
    r.start_date,
    coalesce((r.metadata->>'national_championship')::boolean,false)
  into
    v_race_date,
    v_is_national_championship
  from public.races r
  where r.id=new.race_id;

  if not coalesce(v_is_national_championship,false) then
    perform public.assert_developing_rider_race_eligibility_v1(
      new.rider_id,
      new.team_id,
      v_race_date
    );
  end if;

  return new;
end;
$$;
