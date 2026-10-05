do $block$
declare
  x record;
begin
  for x in
    with race_counts as (
      select r.id race_id,
             coalesce(r.target_teams,private.youth_race_target_teams_v1(r.competition_class,r.team_limit)) target_teams,
             count(*) filter(where e.status='entered')::integer entered_count
      from public.youth_races r
      left join public.youth_race_entries e on e.race_id=r.id
      where r.status='scheduled' and r.race_date>public.get_current_game_date_date()
      group by r.id
    ), ranked as (
      select
        e.id entry_id,e.race_id,e.academy_id,e.entry_cost,r.season_number,
        rc.target_teams,rc.entered_count,
        row_number() over(
          partition by e.race_id
          order by
            case when private.youth_race_local_market_v1(e.academy_id,e.race_id) then 1 else 0 end,
            private.youth_academy_strength_v1(e.academy_id),
            e.id
        ) rn
      from public.youth_race_entries e
      join public.youth_academies a on a.id=e.academy_id and a.is_ai
      join public.youth_races r on r.id=e.race_id
      join race_counts rc on rc.race_id=e.race_id
      where e.status='entered'
        and r.status='scheduled'
        and r.race_date>public.get_current_game_date_date()
        and rc.entered_count>rc.target_teams
    )
    select * from ranked
    where rn<=greatest(0,entered_count-target_teams)
  loop
    delete from public.youth_race_lineups where entry_id=x.entry_id;

    update public.youth_race_entries
    set status='withdrawn',updated_at=now()
    where id=x.entry_id;

    update public.youth_race_invitations
    set status='pending',responded_on=null,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'field_trimmed_to_target',true,'field_trimmed_at',now()
        ),
        updated_at=now()
    where race_id=x.race_id and academy_id=x.academy_id;

    update public.youth_academy_season_budgets
    set spent_amount=greatest(0,spent_amount-coalesce(x.entry_cost,0)),updated_at=now()
    where academy_id=x.academy_id and season_number=x.season_number;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      x.academy_id,x.season_number,public.get_current_game_date_date(),
      'race_refund','Youth race field adjustment refund',coalesce(x.entry_cost,0),
      jsonb_build_object('race_id',x.race_id,'reason','field_trimmed_to_new_target')
    );
  end loop;
end;
$block$;

select public.process_youth_team_allocations_v2(public.get_current_game_date_date());
