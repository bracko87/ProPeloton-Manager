
create or replace function public.decline_my_youth_race_invitation_v1(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry_decider text;
  v_game_date date:=public.get_current_game_date_date();
  v_race public.youth_races%rowtype;
  v_entry public.youth_race_entries%rowtype;
  v_refund bigint:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,coalesce(s.race_entry_decider,'u16_head_coach')
  into v_academy_id,v_entry_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;
  if v_entry_decider<>'manager' then
    raise exception 'Race participation is delegated to the U16 Head Coach';
  end if;

  select * into v_race from public.youth_races where id=p_race_id for update;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'This Youth race can no longer be withdrawn';
  end if;

  select * into v_entry
  from public.youth_race_entries
  where race_id=p_race_id and academy_id=v_academy_id
    and status='entered'
  for update;

  if v_entry.id is not null then
    v_refund:=case when v_entry.total_participation_cost>0
      then v_entry.total_participation_cost else v_entry.entry_cost end;

    delete from public.youth_race_lineups where entry_id=v_entry.id;

    update public.youth_race_entries
    set status='withdrawn',updated_at=now()
    where id=v_entry.id;

    if v_refund>0 and not exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=v_academy_id
        and l.category='race_withdrawal_refund'
        and l.metadata->>'race_id'=p_race_id::text
    ) then
      update public.youth_academy_season_budgets
      set spent_amount=greatest(0,spent_amount-v_refund),updated_at=now()
      where academy_id=v_academy_id and season_number=v_race.season_number;

      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      ) values(
        v_academy_id,v_race.season_number,v_game_date,
        'race_withdrawal_refund',
        'Youth race withdrawal refund: '||v_race.race_name,
        v_refund,
        jsonb_build_object('race_id',p_race_id,'reason','manager_withdrawal')
      );
    end if;
  end if;

  update public.youth_race_invitations
  set status='declined',responded_on=v_game_date,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'withdrawn_by_manager',true,'withdrawn_on',v_game_date
      ),
      updated_at=now()
  where race_id=p_race_id and academy_id=v_academy_id
    and status in ('pending','accepted','waitlist');

  if v_entry.id is null and not found then
    raise exception 'No pending application or entered Youth race found';
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

create or replace function private.deduplicate_future_youth_host_cities_v1(
  p_season integer default null,
  p_from_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  x record;
  e record;
  cancelled integer:=0;
  refunded bigint:=0;
begin
  for x in
    with candidates as (
      select
        r.id,r.host_country_code,r.host_city,r.race_date,r.competition_class,
        row_number() over(
          partition by upper(coalesce(r.host_country_code,'')),lower(coalesce(r.host_city,''))
          order by
            case when exists(
              select 1
              from public.youth_race_entries ue
              join public.youth_academies ua on ua.id=ue.academy_id
              where ue.race_id=r.id and ue.status='entered' and not ua.is_ai
            ) then 0 else 1 end,
            case r.competition_class when 'world' then 1 when 'continental' then 2 else 3 end,
            r.race_date,r.id
        ) rn
      from public.youth_races r
      where r.season_number=s
        and r.status='scheduled'
        and (p_from_date is null or r.race_date>p_from_date)
        and r.host_city is not null
    )
    select * from candidates where rn>1
  loop
    for e in
      select re.id entry_id,re.academy_id,re.entry_cost,re.total_participation_cost
      from public.youth_race_entries re
      where re.race_id=x.id and re.status='entered'
    loop
      update public.youth_race_entries set status='withdrawn',updated_at=now() where id=e.entry_id;
      delete from public.youth_race_lineups where entry_id=e.entry_id;

      if greatest(coalesce(e.total_participation_cost,0),coalesce(e.entry_cost,0))>0 then
        update public.youth_academy_season_budgets
        set spent_amount=greatest(
          0,
          spent_amount-greatest(coalesce(e.total_participation_cost,0),coalesce(e.entry_cost,0))
        ),updated_at=now()
        where academy_id=e.academy_id and season_number=s;

        insert into public.youth_academy_ledger(
          academy_id,season_number,game_date,category,description,amount,metadata
        )
        values(
          e.academy_id,s,coalesce(p_from_date,public.get_current_game_date_date()),
          'race_refund','Youth race host-city deduplication refund',
          greatest(coalesce(e.total_participation_cost,0),coalesce(e.entry_cost,0)),
          jsonb_build_object('race_id',x.id,'reason','duplicate_host_city')
        );
        refunded:=refunded+greatest(coalesce(e.total_participation_cost,0),coalesce(e.entry_cost,0));
      end if;
    end loop;

    update public.youth_race_invitations
    set status='declined',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'decline_reason','duplicate_host_city'
        ),
        updated_at=now()
    where race_id=x.id and status in ('pending','accepted','waitlist');

    update public.youth_races
    set status='cancelled',
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'hidden_from_calendar',true,
          'duplicate_host_city_removed',true
        ),
        updated_at=now()
    where id=x.id and status='scheduled';

    if found then cancelled:=cancelled+1; end if;
  end loop;

  return jsonb_build_object(
    'season_number',s,
    'cancelled_duplicate_host_races',cancelled,
    'refunded_total',refunded
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_youth_team_allocations_v2(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  gd date:=coalesce(p_game_date,public.get_current_game_date_date());
  x record;
  n integer:=0;
  f integer:=0;
  auto_entries integer:=0;
begin
  perform private.trim_youth_calendar_density_v1(public.get_current_season_number(),gd);
  perform private.deduplicate_future_youth_host_cities_v1(public.get_current_season_number(),gd);
  perform public.sync_youth_scheduled_race_invitations_v2(public.get_current_season_number());
  auto_entries:=private.auto_enter_youth_races_v1(gd);
  perform private.fill_due_youth_lineups_v1(gd);

  for x in
    select id,race_date
    from public.youth_races
    where status='scheduled' and race_date>gd and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    perform private.fill_youth_race_field_v2(x.id,gd,x.race_date<=gd+7);
    n:=n+1;
    if x.race_date<=gd+7 then f:=f+1; end if;
  end loop;

  return jsonb_build_object(
    'game_date',gd,
    'allocation_window_days',14,
    'final_fill_days',7,
    'minimum_teams_per_race',6,
    'auto_staff_entries',auto_entries,
    'races_processed',n,
    'final_fill_races',f
  );
end;
$function$;

select private.deduplicate_future_youth_host_cities_v1(
  public.get_current_season_number(),
  public.get_current_game_date_date()
);

