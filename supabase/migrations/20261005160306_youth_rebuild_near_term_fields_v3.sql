do $block$
declare x record;
begin
  for x in
    select e.id entry_id,e.academy_id,e.race_id,e.entry_cost,r.season_number
    from public.youth_race_entries e
    join public.youth_races r on r.id=e.race_id
    join public.youth_academies a on a.id=e.academy_id
    where e.status='entered' and a.is_ai
      and r.status='scheduled'
      and r.race_date>public.get_current_game_date_date()
      and r.race_date<=public.get_current_game_date_date()+14
  loop
    delete from public.youth_race_lineups where entry_id=x.entry_id;
    update public.youth_race_entries set status='withdrawn',updated_at=now() where id=x.entry_id;

    update public.youth_race_invitations
    set status='pending',responded_on=null,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'rebuild_reason','geo_class_quota_v3','rebuilt_at',now()
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
      'race_refund','Youth race field rebuild refund',coalesce(x.entry_cost,0),
      jsonb_build_object('race_id',x.race_id,'reason','geo_class_quota_v3')
    );
  end loop;
end;
$block$;

select public.process_youth_team_allocations_v2(public.get_current_game_date_date());
