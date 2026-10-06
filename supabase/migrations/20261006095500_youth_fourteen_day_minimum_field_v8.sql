-- Fill every Youth race to the 16-team baseline once it enters the
-- 14-day allocation window, while preserving four open places for user teams.

create or replace function public.process_youth_team_allocations_v2(
  p_game_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=coalesce(p_game_date,public.get_current_game_date_date());
  x record;
  n integer:=0;
  f integer:=0;
  staff_applications integer:=0;
  decision_result jsonb;
begin
  perform public.sync_youth_scheduled_race_invitations_v2(
    public.get_current_season_number()
  );
  staff_applications:=private.submit_due_youth_staff_applications_v1(gd);
  decision_result:=private.resolve_due_youth_race_applications_v8(gd);
  perform private.fill_due_youth_lineups_v1(gd);

  for x in
    select id,race_date
    from public.youth_races
    where status='scheduled'
      and race_date>gd
      and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    perform private.fill_youth_race_field_v2(
      x.id,gd,x.race_date<=gd+7
    );
    if x.race_date<=gd+7 then
      f:=f+1;
    end if;
    n:=n+1;
  end loop;

  return jsonb_build_object(
    'game_date',gd,
    'application_window_days',150,
    'allocation_window_days',14,
    'decision_days_before_race',7,
    'minimum_teams_per_race',16,
    'maximum_teams_per_race',20,
    'staff_applications',staff_applications,
    'application_decisions',decision_result,
    'races_processed',n,
    'final_decision_window_races',f
  );
end;
$function$;

select public.process_youth_team_allocations_v2(
  public.get_current_game_date_date()
);
