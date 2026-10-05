
alter table public.youth_races
  add column if not exists prize_fund_cash bigint;

do $block$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.youth_races'::regclass
      and conname='youth_races_prize_fund_cash_check'
  ) then
    alter table public.youth_races
      add constraint youth_races_prize_fund_cash_check
      check(prize_fund_cash is null or prize_fund_cash between 0 and 73000);
  end if;
end;
$block$;

create or replace function private.youth_race_prize_fund_cash_v1(
  p_competition_class text,
  p_seed text
)
returns bigint
language sql
immutable
set search_path=pg_temp
as $function$
  select case lower(coalesce(p_competition_class,'regional'))
    when 'world' then 35000 + 2000 * mod(abs(hashtext(coalesce(p_seed,'world'))),20)
    when 'continental' then 12000 + 1000 * mod(abs(hashtext(coalesce(p_seed,'continental'))),14)
    else 6000 + 500 * mod(abs(hashtext(coalesce(p_seed,'regional'))),13)
  end::bigint;
$function$;

revoke all on function private.youth_race_prize_fund_cash_v1(text,text)
from public,anon,authenticated;

create or replace function private.set_youth_race_prize_fund_v1()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
begin
  if new.prize_fund_cash is null or new.prize_fund_cash<=0 then
    new.prize_fund_cash:=private.youth_race_prize_fund_cash_v1(
      new.competition_class,
      concat_ws(':',new.season_number,new.id,new.race_name,new.race_date)
    );
  end if;
  return new;
end;
$function$;

revoke all on function private.set_youth_race_prize_fund_v1()
from public,anon,authenticated;

drop trigger if exists youth_race_prize_fund_v1_trg on public.youth_races;
create trigger youth_race_prize_fund_v1_trg
before insert or update of competition_class,race_name,race_date on public.youth_races
for each row execute function private.set_youth_race_prize_fund_v1();

update public.youth_races r
set prize_fund_cash=private.youth_race_prize_fund_cash_v1(
  r.competition_class,
  concat_ws(':',r.season_number,r.id,r.race_name,r.race_date)
)
where r.prize_fund_cash is null or r.prize_fund_cash<=0;

create table if not exists public.youth_race_team_prizes (
  race_id uuid not null references public.youth_races(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  team_position integer not null check(team_position>=1),
  prize_cash bigint not null default 0 check(prize_cash>=0),
  paid_on date not null,
  created_at timestamptz not null default now(),
  primary key(race_id,academy_id),
  unique(race_id,team_position)
);

alter table public.youth_race_team_prizes enable row level security;
revoke all on public.youth_race_team_prizes from public,anon,authenticated;

create or replace function private.youth_team_prize_share_pct_v1(
  p_position integer,
  p_team_count integer
)
returns numeric
language sql
immutable
set search_path=pg_temp
as $function$
  select case
    when p_team_count<=0 or p_position<=0 then 0
    when p_team_count=1 then case when p_position=1 then 100 else 0 end
    when p_team_count=2 then case p_position when 1 then 65 when 2 then 35 else 0 end
    when p_team_count=3 then case p_position when 1 then 50 when 2 then 30 when 3 then 20 else 0 end
    when p_team_count=4 then case p_position when 1 then 45 when 2 then 27 when 3 then 17 when 4 then 11 else 0 end
    else case p_position
      when 1 then 40 when 2 then 25 when 3 then 15 when 4 then 12 when 5 then 8 else 0
    end
  end::numeric;
$function$;

revoke all on function private.youth_team_prize_share_pct_v1(integer,integer)
from public,anon,authenticated;

create or replace function private.pay_youth_race_team_prizes_v1(p_race_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_count integer:=0;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if v_race.status<>'completed' then return 0; end if;

  if exists(select 1 from public.youth_race_team_prizes where race_id=p_race_id) then
    return 0;
  end if;

  create temporary table if not exists pg_temp.youth_team_prize_rank_v1(
    academy_id uuid,
    team_position integer,
    prize_cash bigint
  ) on commit drop;
  truncate pg_temp.youth_team_prize_rank_v1;

  insert into pg_temp.youth_team_prize_rank_v1(academy_id,team_position,prize_cash)
  with team_scores as (
    select
      e.academy_id,
      coalesce(s.best_three_sum,0)
        + greatest(0,3-coalesce(s.finished_count,0))*1000 as team_score
    from public.youth_race_entries e
    left join lateral (
      select
        count(*)::integer finished_count,
        coalesce(sum(z.finish_position),0)::integer best_three_sum
      from (
        select rr.finish_position
        from public.youth_race_results rr
        where rr.race_id=p_race_id
          and rr.academy_id=e.academy_id
          and rr.result_status='finished'
          and rr.finish_position is not null
        order by rr.finish_position
        limit 3
      ) z
    ) s on true
    where e.race_id=p_race_id and e.status='completed'
  ),
  ranked as (
    select
      academy_id,
      row_number() over(order by team_score,academy_id)::integer team_position,
      count(*) over()::integer team_count
    from team_scores
  )
  select
    academy_id,
    team_position,
    round(
      coalesce(v_race.prize_fund_cash,0)
      * private.youth_team_prize_share_pct_v1(team_position,team_count)
      / 100.0
    )::bigint
  from ranked;

  insert into public.youth_race_team_prizes(
    race_id,academy_id,team_position,prize_cash,paid_on
  )
  select
    p_race_id,academy_id,team_position,prize_cash,
    coalesce(v_game_date,v_race.race_end_date,v_race.race_date)
  from pg_temp.youth_team_prize_rank_v1;

  update public.youth_academy_season_budgets b
  set season_budget=b.season_budget+x.prize_cash,
      updated_at=now()
  from (
    select academy_id,sum(prize_cash)::bigint prize_cash
    from pg_temp.youth_team_prize_rank_v1
    where prize_cash>0
    group by academy_id
  ) x
  where b.academy_id=x.academy_id
    and b.season_number=v_race.season_number;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  select
    p.academy_id,
    v_race.season_number,
    coalesce(v_game_date,v_race.race_end_date,v_race.race_date),
    'race_prize',
    'Youth race prize: '||v_race.race_name||' · Team #'||p.team_position,
    p.prize_cash,
    jsonb_build_object(
      'race_id',p_race_id,
      'team_position',p.team_position,
      'prize_fund_cash',v_race.prize_fund_cash
    )
  from pg_temp.youth_team_prize_rank_v1 p
  where p.prize_cash>0;

  select count(*) into v_count
  from pg_temp.youth_team_prize_rank_v1
  where prize_cash>0;

  return v_count;
end;
$function$;

revoke all on function private.pay_youth_race_team_prizes_v1(uuid)
from public,anon,authenticated;

create temporary table youth_equipment_decommission_refunds_v1 on commit drop as
select
  l.academy_id,
  l.season_number,
  greatest(0,-sum(l.amount))::bigint refund_cash
from public.youth_academy_ledger l
where l.season_number=coalesce(public.get_current_season_number(),1)
  and l.category in ('equipment','equipment_asset','race_supplies','equipment_correction')
group by l.academy_id,l.season_number
having greatest(0,-sum(l.amount))>0;

update public.youth_academy_season_budgets b
set spent_amount=greatest(0,b.spent_amount-r.refund_cash),
    updated_at=now()
from youth_equipment_decommission_refunds_v1 r
where b.academy_id=r.academy_id
  and b.season_number=r.season_number;

insert into public.youth_academy_ledger(
  academy_id,season_number,game_date,category,description,amount,metadata
)
select
  r.academy_id,
  r.season_number,
  public.get_current_game_date_date(),
  'equipment_decommission_refund',
  'Youth Equipment & Assets removed · current-season system refund',
  r.refund_cash,
  jsonb_build_object('reason','youth_equipment_assets_decommissioned')
from youth_equipment_decommission_refunds_v1 r;

delete from public.youth_academy_race_equipment_setups;
delete from public.youth_academy_race_supplies;
delete from public.youth_academy_assets;
delete from public.youth_academy_equipment_inventory;

update public.youth_academy_settings
set equipment_decider='manager',updated_at=now()
where equipment_decider is distinct from 'manager';

update public.youth_temporary_responsibility_covers
set cleared_on=coalesce(cleared_on,public.get_current_game_date_date()),
    updated_at=now()
where responsibility='equipment' and cleared_on is null;

create or replace function private.force_youth_equipment_decommissioned_v1()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
begin
  new.equipment_decider:='manager';
  return new;
end;
$function$;

revoke all on function private.force_youth_equipment_decommissioned_v1()
from public,anon,authenticated;

drop trigger if exists youth_equipment_decommissioned_v1_trg
on public.youth_academy_settings;

create trigger youth_equipment_decommissioned_v1_trg
before insert or update on public.youth_academy_settings
for each row execute function private.force_youth_equipment_decommissioned_v1();

create or replace function public.purchase_my_youth_academy_equipment_v1(p_catalog_item_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp
as $function$ begin raise exception 'Youth Academy Equipment & Assets has been removed.'; end; $function$;

create or replace function public.purchase_my_youth_academy_asset_v1(p_asset_key text,p_asset_level smallint)
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp
as $function$ begin raise exception 'Youth Academy Equipment & Assets has been removed.'; end; $function$;

create or replace function public.purchase_my_youth_academy_race_supply_v1(p_catalog_item_id uuid,p_quantity integer default 1)
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp
as $function$ begin raise exception 'Youth Academy Equipment & Assets has been removed.'; end; $function$;

create or replace function public.configure_my_youth_equipment_setups_v1()
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp
as $function$ begin raise exception 'Youth Academy Equipment & Assets has been removed.'; end; $function$;

create or replace function public.run_my_youth_academy_equipment_director_v1()
returns jsonb language plpgsql security definer
set search_path=public,private,auth,pg_temp
as $function$ begin raise exception 'Youth Academy Equipment & Assets has been removed.'; end; $function$;

CREATE OR REPLACE FUNCTION private.run_youth_staff_decisions_v1(p_academy_id uuid, p_game_date date, p_only text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
 a public.youth_academies%rowtype;
 s public.youth_academy_settings%rowtype;
 s_saved public.youth_academy_settings%rowtype;
 b public.youth_academy_season_budgets%rowtype;
 v_role text; v_saved_role text; v_staff public.club_staff%rowtype; v_key text;
 v_resp text; v_report public.youth_scouting_reports%rowtype;
 v_race record; v_id uuid; v_count integer:=0; v_summary text; v_meta jsonb;
 v_score integer; v_available bigint; v_slots integer; v_stipend integer;
 v_comp bigint; v_focus text; v_avg_fatigue numeric;
 v_cover record; v_penalty integer:=0; v_is_cover boolean:=false;
 v_equipment jsonb; v_actions integer:=0; v_actor text;
begin
 select * into a
 from public.youth_academies
 where id=p_academy_id and is_active and not is_ai
 for update;
 if a.id is null or not exists(
   select 1 from public.clubs c
   where c.id=a.club_id and c.deleted_at is null
     and public.user_has_premium_access_v1(c.owner_user_id)
 ) then return 0; end if;

 select * into s from private.youth_effective_settings_v1 where academy_id=a.id;
 select * into s_saved from public.youth_academy_settings where academy_id=a.id;

 foreach v_key in array array[
   'recruitment_decider','recruitment_negotiation_decider',
   'race_entry_decider','race_squad_decider',
   'camp_decider','training_decider'
 ] loop
   if p_only is not null and p_only<>v_key then continue; end if;

   v_resp:=replace(v_key,'_decider','');
   v_role:=to_jsonb(s)->>v_key;
   v_saved_role:=to_jsonb(s_saved)->>v_key;
   v_is_cover:=false;
   v_penalty:=0;
   v_staff:=null;

   if coalesce(v_role,'manager')='manager'
      and coalesce(v_saved_role,'manager')<>'manager' then
     select * into v_cover
     from private.youth_active_temporary_cover_v1(a.id,v_resp)
     limit 1;
     if v_cover.staff_id is not null then
       select * into v_staff from public.club_staff where id=v_cover.staff_id;
       v_penalty:=v_cover.quality_penalty_percent;
       v_is_cover:=true;
     else
       continue;
     end if;
   elsif coalesce(v_role,'manager')='manager' then
     continue;
   else
     select * into v_staff
     from public.club_staff
     where id=private.youth_available_role_v1(a.id,v_role);
   end if;

   if v_staff.id is null then continue; end if;
   if exists(
     select 1 from public.youth_staff_decisions
     where academy_id=a.id and game_date=p_game_date and responsibility=v_key
   ) then continue; end if;

   v_score:=private.youth_staff_quality_score_v1(
     v_staff.role_type,v_staff.expertise,v_staff.experience,v_staff.potential,
     v_staff.leadership,v_staff.efficiency,v_staff.loyalty
   );
   v_score:=greatest(1,round(v_score*(100-v_penalty)/100.0)::integer);
   v_actor:=case when v_is_cover then 'temporary_staff' else v_role end;
   v_summary:=null;
   v_meta:=jsonb_build_object(
     'staff_score_used',v_score,
     'temporary_cover',v_is_cover,
     'quality_penalty_percent',v_penalty
   );

   select * into b
   from public.youth_academy_season_budgets
   where academy_id=a.id and season_number=public.get_current_season_number();
   v_available:=greatest(0,b.season_budget-b.spent_amount-b.committed_amount);
   select 16-count(*) into v_slots
   from public.youth_riders
   where academy_id=a.id and status in ('academy','graduating');

   begin
     if v_key='recruitment_decider' then
       select * into v_report
       from public.youth_scouting_reports r
       where r.academy_id=a.id and r.status='new'
         and r.discovered_on>=date_trunc('week',p_game_date)::date
         and r.expires_on>=p_game_date
         and private.youth_band_rank_v1(r.assessment_band)>=
             private.youth_band_rank_v1(s.auto_recruit_min_band)
       order by
         private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+
         r.confidence*v_score/100.0+
         private.youth_deterministic_fraction_v1(r.id::text||':director')*
           (100-v_score) desc,r.id
       limit 1;
       if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
         update public.youth_scouting_reports
         set status='shortlisted',updated_at=now() where id=v_report.id;
         v_summary:=format(
           '%s shortlisted %s %s for recruitment.',
           v_staff.staff_name,v_report.first_name,v_report.last_name
         );
         v_meta:=v_meta||jsonb_build_object('report_id',v_report.id);
       end if;

     elsif v_key='recruitment_negotiation_decider' then
       select * into v_report
       from public.youth_scouting_reports r
       where r.academy_id=a.id and r.status='shortlisted'
         and r.discovered_on>=date_trunc('week',p_game_date)::date
         and r.expires_on>=p_game_date
         and r.expected_stipend_weekly<=s.auto_recruit_max_stipend_weekly
         and r.suggested_compensation<=s.auto_recruit_max_compensation
         and not exists(
           select 1 from public.youth_recruitment_offers o where o.report_id=r.id
         )
       order by private.youth_band_rank_v1(r.assessment_band)*v_score/20.0+
                r.confidence desc,r.id
       limit 1;
       if v_report.id is not null and v_slots>s.auto_recruit_min_free_slots then
         v_stipend:=least(
           s.auto_recruit_max_stipend_weekly,
           greatest(50,round(
             v_report.expected_stipend_weekly*(1+(100-v_score)/500.0)
           )::integer)
         );
         v_comp:=case when v_report.target_kind='unattached' then 0 else
           least(
             s.auto_recruit_max_compensation,
             round(v_report.suggested_compensation*(1+(100-v_score)/400.0))::bigint
           )
         end;
         v_id:=private.process_youth_recruitment_offer_v1(
           a.id,v_report.id,v_stipend,v_report.suggested_accommodation_weekly,
           v_comp,v_actor
         );
         v_summary:=format(
           '%s negotiated with %s %s: %s per week in support, %s one-time compensation. Decision: %s.',
           v_staff.staff_name,v_report.first_name,v_report.last_name,
           v_stipend+v_report.suggested_accommodation_weekly,v_comp,
           (select status from public.youth_recruitment_offers where id=v_id)
         );
         v_meta:=v_meta||jsonb_build_object('offer_id',v_id);
       end if;

     elsif v_key='race_entry_decider' then
       for v_race in
         select r.*
         from public.youth_races r
         join public.youth_race_invitations i on i.race_id=r.id
         where i.academy_id=a.id and i.status='pending'
           and r.status='scheduled' and r.race_date>p_game_date
           and r.race_date<=p_game_date+21
           and (
             r.invitation_response_deadline is null
             or r.invitation_response_deadline>=p_game_date
             or i.invitation_type<>'world_class'
           )
           and private.youth_race_academy_qualified_v1(a.id,r.id)
           and not exists(
             select 1 from public.youth_race_entries e
             where e.race_id=r.id and e.academy_id=a.id
           )
         order by r.invitation_response_deadline nulls last,
           r.entry_cost*v_score/100.0+
           private.youth_deterministic_fraction_v1(
             r.id::text||a.id::text
           )*(100-v_score)*30,
           r.race_date
         limit 20
       loop
         perform private.ensure_youth_monthly_race_plan_v1(
           a.id,v_race.season_number,
           extract(month from v_race.race_date)::integer
         );
         update public.youth_monthly_race_plans
         set approved=true,approved_at=coalesce(approved_at,now())
         where academy_id=a.id
           and season_number=v_race.season_number
           and month_number=extract(month from v_race.race_date)::integer
           and not approved;
         begin
           v_id:=private.enter_youth_race_v1(
             a.id,v_race.id,v_actor,
             case
               when v_score>=70 then 'balanced'
               when v_score<40 then 'conservative'
               else 'balanced'
             end
           );
           v_summary:=format(
             '%s entered %s on %s within the approved race and budget limits.',
             v_staff.staff_name,v_race.race_name,
             public.format_youth_game_date_v1(v_race.race_date)
           );
           v_meta:=v_meta||jsonb_build_object(
             'race_id',v_race.id,'entry_id',v_id
           );
           exit;
         exception when raise_exception then
           continue;
         end;
       end loop;

     elsif v_key='race_squad_decider' then
       select e.id,r.race_name,r.race_date
       into v_race
       from public.youth_race_entries e
       join public.youth_races r on r.id=e.race_id
       where e.academy_id=a.id and e.status='entered'
         and r.status='scheduled' and r.race_date>p_game_date
         and not exists(
           select 1 from public.youth_staff_decisions d
           where d.academy_id=a.id
             and d.responsibility=v_key
             and d.metadata->>'entry_id'=e.id::text
         )
       order by r.race_date,e.id
       limit 1;
       if v_race.id is not null then
         perform private.select_youth_race_lineup_v1(v_race.id,v_actor);
         v_summary:=format(
           '%s selected the Youth squad for %s.',
           v_staff.staff_name,v_race.race_name
         );
         v_meta:=v_meta||jsonb_build_object('entry_id',v_race.id);
       end if;

     elsif v_key='camp_decider' then
       if not exists(
         select 1 from public.youth_training_camps
         where academy_id=a.id and status<>'cancelled'
           and starts_on>=p_game_date-28
       ) and v_available>=2000 then
         select avg(fatigue) into v_avg_fatigue
         from public.youth_riders
         where academy_id=a.id and status='academy';
         v_focus:=case
           when v_avg_fatigue>35 and v_score>=50 then 'freshness'
           when v_score>=65 then 'balanced'
           else 'development'
         end;
         v_id:=private.book_youth_camp_v1(a.id,v_focus,v_actor);
         v_summary:=format(
           '%s booked a three-day %s camp starting %s.',
           v_staff.staff_name,v_focus,
           public.format_youth_game_date_v1(p_game_date+3)
         );
         v_meta:=v_meta||jsonb_build_object('camp_id',v_id);
       end if;

     elsif v_key='training_decider' then
       if not exists(
         select 1 from public.youth_staff_decisions
         where academy_id=a.id and responsibility=v_key
           and game_date>p_game_date-7
       ) then
         select avg(fatigue) into v_avg_fatigue
         from public.youth_riders
         where academy_id=a.id and status='academy';
         v_focus:=case
           when v_avg_fatigue>case when v_score>=60 then 30 else 55 end
             then 'freshness'
           when v_avg_fatigue<20 then 'development'
           else 'balanced'
         end;
         update public.youth_academy_settings
         set training_philosophy=v_focus,updated_at=now()
         where academy_id=a.id;
         update public.youth_riders
         set development_focus=case
           when v_score>=60 then private.youth_focus_for_role_v1(role,'balanced')
           else 'balanced'
         end
         where academy_id=a.id and status='academy';
         v_summary:=format(
           '%s set the Youth training plan to %s after reviewing rider fatigue.',
           v_staff.staff_name,v_focus
         );
       end if;
     end if;

     if v_summary is not null then
       insert into public.youth_staff_decisions(
         academy_id,staff_id,game_date,responsibility,summary,metadata
       )
       values(a.id,v_staff.id,p_game_date,v_key,v_summary,v_meta);

       perform private.notify_youth_staff_v1(
         a.id,'YOUTH_STAFF_DECISION','Youth Academy staff decision',v_summary,
         'youth-decision:'||a.id||':'||p_game_date||':'||v_key,
         v_meta||jsonb_build_object(
           'staff_id',v_staff.id,'responsibility',v_key
         )
       );
       v_count:=v_count+1;
     end if;
   exception when raise_exception then
     null;
   end;
 end loop;
 return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION private.simulate_youth_race_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  v_race public.youth_races%rowtype;
  v_row record;
  v_position integer:=0;
  v_finished integer:=0;
  v_dnf integer:=0;
  v_dns integer:=0;
  v_points integer;
  v_regional integer;
  v_world integer;
  v_gap integer;
  v_time integer;
  v_fatigue integer;
  v_dev integer;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  if v_race.id is null then raise exception 'Youth race not found'; end if;
  if exists(select 1 from public.youth_race_processing_log where race_id=p_race_id) then
    return (select result from public.youth_race_processing_log where race_id=p_race_id);
  end if;

  create temporary table if not exists pg_temp.youth_race_scores(
    entry_id uuid,academy_id uuid,youth_rider_id uuid,
    result_status text,score numeric
  ) on commit drop;
  truncate pg_temp.youth_race_scores;

  insert into pg_temp.youth_race_scores(
    entry_id,academy_id,youth_rider_id,result_status,score
  )
  select
    e.id,e.academy_id,l.youth_rider_id,
    case
      when r.id is null or r.status<>'academy' then 'dns'
      when not private.youth_race_rider_eligible_v1(r.id,v_race.race_date) then 'dns'
      when private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'incident'
      )<0.025 then 'dnf'
      else 'finished'
    end,
    case when r.id is null then 0 else
      private.youth_race_capability_v1(r,v_race.terrain_type)
      +r.readiness*0.10-r.fatigue*0.14
      +case e.strategy when 'aggressive' then 1.4 when 'conservative' then -0.4 else 0 end
      +coalesce((
        select max(cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25)*0.04
        from public.youth_academies a
        left join public.club_staff cs
          on cs.club_id=a.club_id and cs.role_type='u16_head_coach' and cs.is_active=true and private.youth_staff_available_v1(cs.id)
        where a.id=e.academy_id
      ),2)
      +(private.youth_deterministic_fraction_v1(
        p_race_id::text||r.id::text||'form'
      )-0.5)*8.0
    end
  from public.youth_race_entries e
  join public.youth_race_lineups l on l.entry_id=e.id
  left join public.youth_riders r on r.id=l.youth_rider_id
  where e.race_id=p_race_id and e.status='entered';

  if v_race.race_days>1 and exists(select 1 from public.youth_race_stage_results where race_id=p_race_id) then
    truncate pg_temp.youth_race_scores;
    insert into pg_temp.youth_race_scores(entry_id,academy_id,youth_rider_id,result_status,score)
    select entry_id,academy_id,youth_rider_id,
      case when bool_or(result_status='dns') then 'dns' when count(*)<v_race.race_days or bool_or(result_status='dnf') then 'dnf' else 'finished' end,
      100.0-sum(time_seconds)::numeric/10000.0
    from public.youth_race_stage_results where race_id=p_race_id group by entry_id,academy_id,youth_rider_id;
  end if;

  for v_row in
    select * from pg_temp.youth_race_scores
    order by
      case result_status when 'finished' then 0 when 'dnf' then 1 else 2 end,
      score desc,youth_rider_id
  loop
    if v_row.result_status='finished' then
      v_position:=v_position+1;
      v_finished:=v_finished+1;
      v_points:=private.youth_race_base_points_v1(v_position);
      if v_race.race_level='regional' then
        v_regional:=v_points;
        v_world:=round(v_points*0.35)::integer;
      elsif v_race.race_level='world_series' then
        v_regional:=0;
        v_world:=round(v_points*1.5)::integer;
      else
        v_regional:=0;
        v_world:=v_points*2;
      end if;
      v_gap:=greatest(0,round((100-v_row.score)*2.2)::integer+v_position*2);
      if v_position=1 then v_gap:=0; end if;
      v_time:=round(v_race.distance_km*85+greatest(0,70-v_row.score)*3)::integer;
      if v_race.race_days>1 and exists(select 1 from public.youth_race_stage_results where race_id=p_race_id) then
        select sum(time_seconds)::integer into v_time from public.youth_race_stage_results where race_id=p_race_id and youth_rider_id=v_row.youth_rider_id;
        select v_time-min(total_time)::integer into v_gap from (
          select sum(time_seconds) total_time from public.youth_race_stage_results where race_id=p_race_id
          group by youth_rider_id having count(*)=v_race.race_days and bool_and(result_status='finished')
        ) totals;
      end if;
      v_fatigue:=case
        when v_race.distance_km>=85 then 15
        when v_race.distance_km>=70 then 12 else 9 end;
      v_dev:=case when private.youth_deterministic_fraction_v1(
        p_race_id::text||v_row.youth_rider_id::text||'development'
      )<case when v_position<=5 then 0.18 else 0.10 end then 1 else 0 end;
    elsif v_row.result_status='dnf' then
      v_dnf:=v_dnf+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=11;v_dev:=0;
    else
      v_dns:=v_dns+1;
      v_regional:=0;v_world:=0;v_gap:=null;v_time:=null;v_fatigue:=0;v_dev:=0;
    end if;

    insert into public.youth_race_results(
      race_id,entry_id,academy_id,youth_rider_id,result_status,finish_position,
      time_seconds,gap_seconds,performance_score,regional_points,world_points,
      fatigue_delta,development_bonus,incident_code
    )
    values(
      p_race_id,v_row.entry_id,v_row.academy_id,v_row.youth_rider_id,
      v_row.result_status,
      case when v_row.result_status='finished' then v_position else null end,
      v_time,v_gap,v_row.score,v_regional,v_world,v_fatigue,v_dev,
      case when v_row.result_status='dnf' then 'race_incident' else null end
    );

    if v_fatigue>0 then
      update public.youth_riders
      set fatigue=least(100,fatigue+v_fatigue),
          readiness=greatest(0,readiness-round(v_fatigue*0.65)::integer),
          updated_at=now()
      where id=v_row.youth_rider_id;
    end if;

    if v_dev>0 then
      perform private.apply_youth_attribute_delta_v1(
        v_row.youth_rider_id,
        case v_race.terrain_type
          when 'flat' then 'flat' when 'hilly' then 'endurance'
          when 'mountain' then 'climbing' when 'time_trial' then 'time_trial'
          else 'race_iq' end,
        1
      );
    end if;
  end loop;

  update public.youth_race_entries
  set status='completed',updated_at=now()
  where race_id=p_race_id and status='entered';

  update public.youth_races
  set status='completed',results_published_at=now(),updated_at=now()
  where id=p_race_id;

  perform private.pay_youth_race_team_prizes_v1(p_race_id);

  insert into public.youth_race_processing_log(
    race_id,processed_game_date,entry_count,rider_count,result
  )
  values(
    p_race_id,v_race.race_date,
    (select count(*) from public.youth_race_entries where race_id=p_race_id and status='completed'),
    v_finished+v_dnf+v_dns,
    jsonb_build_object(
      'race_id',p_race_id,'finished',v_finished,'dnf',v_dnf,'dns',v_dns,
      'results_only',true,'replay_available',false
    )
  );

  return (select result from public.youth_race_processing_log where race_id=p_race_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_race_calendar_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_broad_region text;
  v_regional_division text;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_month integer:=extract(month from public.get_current_game_date_date())::integer;
  v_entry_decider text;
  v_squad_decider text;
  v_membership public.youth_academy_competition_memberships%rowtype;
  v_plan public.youth_monthly_race_plans%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select
    a.id,
    private.youth_region_for_country_v1(c.country_code),
    coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER'),
    s.race_entry_decider,s.race_squad_decider
  into
    v_academy_id,v_broad_region,v_regional_division,
    v_entry_decider,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false,'races','[]'::jsonb);
  end if;

  perform public.ensure_youth_competition_memberships_v1(v_season);
  perform private.ensure_youth_monthly_race_plan_v1(v_academy_id,v_season,v_month);

  select * into v_membership
  from public.youth_academy_competition_memberships
  where season_number=v_season and academy_id=v_academy_id;

  select * into v_plan
  from public.youth_monthly_race_plans
  where academy_id=v_academy_id and season_number=v_season and month_number=v_month;

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'game_date',v_game_date,
    'current_month',v_month,
    'academy_region',v_broad_region,
    'regional_division',v_regional_division,
    'race_entry_decider',coalesce(v_entry_decider,'u16_head_coach'),
    'race_squad_decider',coalesce(v_squad_decider,'u16_head_coach'),
    'competition_membership',jsonb_build_object(
      'competition_class',v_membership.competition_class,
      'division_code',v_membership.division_code,
      'seed_rank',v_membership.seed_rank
    ),
    'monthly_plan',jsonb_build_object(
      'month_number',v_plan.month_number,
      'world_race_limit',v_plan.world_race_limit,
      'continental_race_limit',v_plan.continental_race_limit,
      'regional_race_limit',v_plan.regional_race_limit,
      'max_monthly_cost',v_plan.max_monthly_cost,
      'approved',v_plan.approved,
      'available_world',(
        select count(*) from public.youth_races r
        left join public.youth_race_invitations i
          on i.race_id=r.id and i.academy_id=v_academy_id
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
          and r.competition_class='world'
          and r.status='scheduled'
          and (i.status in ('pending','accepted') or i.status is null)
      ),
      'available_continental',(
        select count(*) from public.youth_races r
        left join public.youth_race_invitations i
          on i.race_id=r.id and i.academy_id=v_academy_id
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
          and r.competition_class='continental'
          and r.status='scheduled'
          and (i.status in ('pending','accepted') or i.status is null)
      ),
      'available_regional',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
          and r.competition_class='regional'
          and r.division_code=v_regional_division
          and r.status='scheduled'
      ),
      'entered_cost',(
        select coalesce(sum(e.entry_cost),0)
        from public.youth_race_entries e
        join public.youth_races r on r.id=e.race_id
        where e.academy_id=v_academy_id
          and r.season_number=v_season
          and extract(month from r.race_date)::integer=v_month
      )
    ),
    'races',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'race_date',r.race_date,
        'race_end_date',coalesce(r.race_end_date,r.race_date),
        'race_days',r.race_days,
        'race_name',r.race_name,
        'race_level',r.race_level,
        'competition_class',r.competition_class,
        'division_code',r.division_code,
        'region_code',r.region_code,
        'host_city',r.host_city,
        'host_country_code',r.host_country_code,
        'terrain_type',r.terrain_type,
        'distance_km',r.distance_km,
        'entry_cost',r.entry_cost,
        'prize_fund_cash',r.prize_fund_cash,
        'lineup_size',r.lineup_size,
        'team_limit',r.team_limit,
        'entries_count',(
          select count(*) from public.youth_race_entries xe
          where xe.race_id=r.id and xe.status in ('entered','completed')
        ),
        'status',r.status,
        'qualified',private.youth_race_academy_qualified_v1(v_academy_id,r.id),
        'invitation_status',i.status,
        'invitation_type',i.invitation_type,
        'invitation_response_deadline',i.response_deadline,
        'entry_id',e.id,
        'entry_status',e.status,
        'strategy',e.strategy,
        'entered_by',e.entered_by,
        'eligible_rider_ids',coalesce((
          select jsonb_agg(yr.id order by yr.display_name)
          from public.youth_riders yr
          where yr.academy_id=v_academy_id
            and private.youth_rider_available_for_race_v1(yr.id,r.id)
        ),'[]'::jsonb),
        'lineup',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,'age',
            extract(year from age(r.race_date,yr.birth_date))::integer,
            'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
            'eligible',private.youth_rider_available_for_race_v1(yr.id,r.id)
          ) order by l.slot_no)
          from public.youth_race_lineups l
          join public.youth_riders yr on yr.id=l.youth_rider_id
          where l.entry_id=e.id
        ),'[]'::jsonb),
        'my_results',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,
            'status',rr.result_status,'position',rr.finish_position,
            'gap_seconds',rr.gap_seconds,'regional_points',rr.regional_points,
            'world_points',rr.world_points
          ) order by rr.finish_position nulls last,yr.display_name)
          from public.youth_race_results rr
          join public.youth_riders yr on yr.id=rr.youth_rider_id
          where rr.race_id=r.id and rr.academy_id=v_academy_id
        ),'[]'::jsonb),
        'top_results',case when r.status='completed' then coalesce((
          select jsonb_agg(x.item order by x.position)
          from (
            select rr.finish_position position,jsonb_build_object(
              'position',rr.finish_position,'rider_name',yr.display_name,
              'country_code',yr.country_code,'academy_name',c.name,
              'gap_seconds',rr.gap_seconds
            ) item
            from public.youth_race_results rr
            join public.youth_riders yr on yr.id=rr.youth_rider_id
            join public.youth_academies a on a.id=rr.academy_id
            join public.clubs c on c.id=a.club_id
            where rr.race_id=r.id and rr.result_status='finished'
            order by rr.finish_position
            limit 10
          ) x
        ),'[]'::jsonb) else '[]'::jsonb end
      ) order by r.race_date,r.race_name),'[]'::jsonb)
      from public.youth_races r
      left join public.youth_race_invitations i
        on i.race_id=r.id and i.academy_id=v_academy_id
      left join public.youth_race_entries e
        on e.race_id=r.id and e.academy_id=v_academy_id
      where r.season_number=v_season
        and r.status<>'cancelled'
        and (
          r.competition_class in ('world','continental')
          or (
            r.competition_class='regional'
            and r.division_code=v_regional_division
          )
        )
    ),
    'riders',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',yr.id,'name',yr.display_name,'age',
        extract(year from age(v_game_date,yr.birth_date))::integer,
        'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue
      ) order by yr.display_name),'[]'::jsonb)
      from public.youth_riders yr
      where yr.academy_id=v_academy_id and yr.status='academy'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_race_month_v1(p_month_number integer, p_competition_class text DEFAULT 'all'::text, p_scope text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_regional_division text;
  v_class text:=lower(coalesce(trim(p_competition_class),'all'));
  v_scope text:=lower(coalesce(trim(p_scope),'all'));
  v_plan public.youth_monthly_race_plans%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_month_number not between 1 and 12 then raise exception 'Invalid Youth race month'; end if;
  if v_class not in ('all','world','continental','regional') then
    raise exception 'Invalid Youth race competition filter';
  end if;
  if v_scope not in ('all','my_opportunities') then
    raise exception 'Invalid Youth race scope';
  end if;

  select a.id,coalesce(public.get_amateur_division_for_country(c.country_code),'OTHER')
  into v_academy_id,v_regional_division
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  order by c.created_at
  limit 1;

  if v_academy_id is null then
    return jsonb_build_object('activated',false,'races','[]'::jsonb);
  end if;

  perform public.ensure_youth_competition_memberships_v1(v_season);
  perform private.ensure_youth_monthly_race_plan_v1(
    v_academy_id,v_season,p_month_number
  );

  select * into v_plan
  from public.youth_monthly_race_plans p
  where p.academy_id=v_academy_id
    and p.season_number=v_season
    and p.month_number=p_month_number;

  return jsonb_build_object(
    'activated',true,
    'season_number',v_season,
    'month_number',p_month_number,
    'competition_filter',v_class,
    'scope',v_scope,
    'regional_division',v_regional_division,
    'monthly_plan',jsonb_build_object(
      'month_number',v_plan.month_number,
      'world_race_limit',v_plan.world_race_limit,
      'continental_race_limit',v_plan.continental_race_limit,
      'regional_race_limit',v_plan.regional_race_limit,
      'max_monthly_cost',v_plan.max_monthly_cost,
      'approved',v_plan.approved,
      'available_world',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='world'
      ),
      'available_continental',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='continental'
      ),
      'available_regional',(
        select count(*) from public.youth_races r
        where r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
          and r.competition_class='regional'
          and r.division_code=v_regional_division
      ),
      'entered_cost',(
        select coalesce(sum(e.entry_cost),0)
        from public.youth_race_entries e
        join public.youth_races r on r.id=e.race_id
        where e.academy_id=v_academy_id
          and r.season_number=v_season
          and extract(month from r.race_date)::integer=p_month_number
      )
    ),
    'class_counts',jsonb_build_object(
      'world',(select count(*) from public.youth_races r where r.season_number=v_season and extract(month from r.race_date)::integer=p_month_number and r.competition_class='world'),
      'continental',(select count(*) from public.youth_races r where r.season_number=v_season and extract(month from r.race_date)::integer=p_month_number and r.competition_class='continental'),
      'regional',(select count(*) from public.youth_races r where r.season_number=v_season and extract(month from r.race_date)::integer=p_month_number and r.competition_class='regional')
    ),
    'races',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'race_date',r.race_date,
        'race_end_date',coalesce(r.race_end_date,r.race_date),
        'race_days',r.race_days,
        'race_name',r.race_name,
        'race_level',r.race_level,
        'competition_class',r.competition_class,
        'division_code',r.division_code,
        'region_code',r.region_code,
        'host_city',r.host_city,
        'host_country_code',r.host_country_code,
        'terrain_type',r.terrain_type,
        'distance_km',r.distance_km,
        'entry_cost',r.entry_cost,
        'prize_fund_cash',r.prize_fund_cash,
        'lineup_size',r.lineup_size,
        'team_limit',r.team_limit,
        'entries_count',(
          select count(*) from public.youth_race_entries xe
          where xe.race_id=r.id and xe.status in ('entered','completed')
        ),
        'status',r.status,
        'prelaunch_past',coalesce((r.metadata->>'prelaunch_cancelled')::boolean,false),
        'is_home_regional',r.competition_class='regional' and r.division_code=v_regional_division,
        'qualified',case when r.status='scheduled'
          then private.youth_race_academy_qualified_v1(v_academy_id,r.id)
          else false end,
        'invitation_status',i.status,
        'invitation_type',i.invitation_type,
        'invitation_response_deadline',i.response_deadline,
        'entry_id',e.id,
        'entry_status',e.status,
        'strategy',e.strategy,
        'entered_by',e.entered_by,
        'eligible_rider_ids',case when r.status='scheduled' then coalesce((
          select jsonb_agg(yr.id order by yr.display_name)
          from public.youth_riders yr
          where yr.academy_id=v_academy_id
            and private.youth_rider_available_for_race_v1(yr.id,r.id)
        ),'[]'::jsonb) else '[]'::jsonb end,
        'lineup',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,
            'age',extract(year from age(r.race_date,yr.birth_date))::integer,
            'role',yr.role,'readiness',yr.readiness,'fatigue',yr.fatigue,
            'eligible',case when r.status='scheduled'
              then private.youth_rider_available_for_race_v1(yr.id,r.id)
              else false end
          ) order by l.slot_no)
          from public.youth_race_lineups l
          join public.youth_riders yr on yr.id=l.youth_rider_id
          where l.entry_id=e.id
        ),'[]'::jsonb),
        'my_results',coalesce((
          select jsonb_agg(jsonb_build_object(
            'rider_id',yr.id,'name',yr.display_name,
            'status',rr.result_status,'position',rr.finish_position,
            'gap_seconds',rr.gap_seconds,'regional_points',rr.regional_points,
            'world_points',rr.world_points
          ) order by rr.finish_position nulls last,yr.display_name)
          from public.youth_race_results rr
          join public.youth_riders yr on yr.id=rr.youth_rider_id
          where rr.race_id=r.id and rr.academy_id=v_academy_id
        ),'[]'::jsonb),
        'top_results',case when r.status='completed' then coalesce((
          select jsonb_agg(x.item order by x.position)
          from (
            select rr.finish_position position,jsonb_build_object(
              'position',rr.finish_position,'rider_name',yr.display_name,
              'country_code',yr.country_code,'academy_name',c.name,
              'gap_seconds',rr.gap_seconds
            ) item
            from public.youth_race_results rr
            join public.youth_riders yr on yr.id=rr.youth_rider_id
            join public.youth_academies a on a.id=rr.academy_id
            join public.clubs c on c.id=a.club_id
            where rr.race_id=r.id and rr.result_status='finished'
            order by rr.finish_position
            limit 10
          ) x
        ),'[]'::jsonb) else '[]'::jsonb end
      ) order by r.race_date,r.competition_class,r.race_name),'[]'::jsonb)
      from public.youth_races r
      left join public.youth_race_invitations i
        on i.race_id=r.id and i.academy_id=v_academy_id
      left join public.youth_race_entries e
        on e.race_id=r.id and e.academy_id=v_academy_id
      where r.season_number=v_season
        and extract(month from r.race_date)::integer=p_month_number
        and (v_class='all' or r.competition_class=v_class)
        and (
          v_scope='all'
          or i.race_id is not null
          or (r.competition_class='regional' and r.division_code=v_regional_division)
        )
    )
  );
end;
$function$;

create or replace function public.get_my_youth_race_detail_v1(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_entry public.youth_race_entries%rowtype;
  v_race public.youth_races%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_squad_decider text;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id,coalesce(s.race_squad_decider,'u16_head_coach')
  into v_academy_id,v_squad_decider
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  left join private.youth_effective_settings_v1 s on s.academy_id=a.id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  select * into v_entry
  from public.youth_race_entries e
  where e.race_id=p_race_id
    and e.academy_id=v_academy_id
    and e.status in ('entered','completed')
  limit 1;

  if v_entry.id is null then
    raise exception 'This Youth race page is available only for races your Academy participates in.';
  end if;

  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then raise exception 'Youth race not found'; end if;

  return jsonb_build_object(
    'game_date',v_game_date,
    'race',jsonb_build_object(
      'id',v_race.id,
      'season_number',v_race.season_number,
      'race_name',v_race.race_name,
      'race_date',v_race.race_date,
      'race_end_date',coalesce(v_race.race_end_date,v_race.race_date),
      'race_days',v_race.race_days,
      'competition_class',v_race.competition_class,
      'division_code',v_race.division_code,
      'host_city',v_race.host_city,
      'host_country_code',v_race.host_country_code,
      'terrain_type',v_race.terrain_type,
      'distance_km',v_race.distance_km,
      'entry_cost',v_race.entry_cost,
      'prize_fund_cash',v_race.prize_fund_cash,
      'lineup_size',v_race.lineup_size,
      'team_limit',v_race.team_limit,
      'entries_count',(
        select count(*) from public.youth_race_entries e
        where e.race_id=v_race.id and e.status in ('entered','completed')
      ),
      'status',v_race.status,
      'results_published_at',v_race.results_published_at
    ),
    'my_entry',jsonb_build_object(
      'id',v_entry.id,
      'status',v_entry.status,
      'entered_on',v_entry.entered_on,
      'entered_by',v_entry.entered_by,
      'strategy',v_entry.strategy,
      'race_squad_decider',v_squad_decider
    ),
    'teams',coalesce((
      select jsonb_agg(x.item order by x.team_position nulls last,x.club_name)
      from (
        select
          p.team_position,
          c.name club_name,
          jsonb_build_object(
            'academy_id',e.academy_id,
            'club_name',c.name,
            'country_code',c.country_code,
            'is_ai',coalesce(c.is_ai,false),
            'entry_status',e.status,
            'lineup_count',(select count(*) from public.youth_race_lineups l where l.entry_id=e.id),
            'is_mine',e.academy_id=v_academy_id,
            'team_position',p.team_position,
            'prize_cash',coalesce(p.prize_cash,0)
          ) item
        from public.youth_race_entries e
        join public.youth_academies a on a.id=e.academy_id
        join public.clubs c on c.id=a.club_id
        left join public.youth_race_team_prizes p
          on p.race_id=e.race_id and p.academy_id=e.academy_id
        where e.race_id=v_race.id and e.status in ('entered','completed')
      ) x
    ),'[]'::jsonb),
    'my_lineup',coalesce((
      select jsonb_agg(jsonb_build_object(
        'rider_id',yr.id,
        'name',yr.display_name,
        'country_code',yr.country_code,
        'role',yr.role,
        'readiness',yr.readiness,
        'fatigue',yr.fatigue
      ) order by l.slot_no)
      from public.youth_race_lineups l
      join public.youth_riders yr on yr.id=l.youth_rider_id
      where l.entry_id=v_entry.id
    ),'[]'::jsonb),
    'eligible_riders',case
      when v_entry.status='entered' and v_race.status='scheduled' then coalesce((
        select jsonb_agg(jsonb_build_object(
          'rider_id',yr.id,
          'name',yr.display_name,
          'country_code',yr.country_code,
          'role',yr.role,
          'readiness',yr.readiness,
          'fatigue',yr.fatigue,
          'eligible',private.youth_rider_available_for_race_v1(yr.id,v_race.id)
        ) order by yr.display_name)
        from public.youth_riders yr
        where yr.academy_id=v_academy_id and yr.status='academy'
      ),'[]'::jsonb)
      else '[]'::jsonb
    end,
    'rider_results',case
      when v_race.status='completed' then coalesce((
        select jsonb_agg(x.item order by x.finish_position nulls last,x.rider_name)
        from (
          select
            rr.finish_position,
            yr.display_name rider_name,
            jsonb_build_object(
              'position',rr.finish_position,
              'rider_id',yr.id,
              'rider_name',yr.display_name,
              'country_code',yr.country_code,
              'academy_id',rr.academy_id,
              'academy_name',c.name,
              'result_status',rr.result_status,
              'gap_seconds',rr.gap_seconds
            ) item
          from public.youth_race_results rr
          join public.youth_riders yr on yr.id=rr.youth_rider_id
          join public.youth_academies a on a.id=rr.academy_id
          join public.clubs c on c.id=a.club_id
          where rr.race_id=v_race.id
        ) x
      ),'[]'::jsonb)
      else '[]'::jsonb
    end,
    'team_results',case
      when v_race.status='completed' then coalesce((
        select jsonb_agg(x.item order by x.team_position)
        from (
          select
            p.team_position,
            jsonb_build_object(
              'team_position',p.team_position,
              'academy_id',p.academy_id,
              'academy_name',c.name,
              'country_code',c.country_code,
              'prize_cash',p.prize_cash,
              'is_mine',p.academy_id=v_academy_id
            ) item
          from public.youth_race_team_prizes p
          join public.youth_academies a on a.id=p.academy_id
          join public.clubs c on c.id=a.club_id
          where p.race_id=v_race.id
        ) x
      ),'[]'::jsonb)
      else '[]'::jsonb
    end
  );
end;
$function$;

revoke all on function public.get_my_youth_race_detail_v1(uuid)
from public,anon;
grant execute on function public.get_my_youth_race_detail_v1(uuid)
to authenticated;

do $block$
declare r record;
begin
  for r in
    select yr.id
    from public.youth_races yr
    where yr.status='completed'
      and exists(select 1 from public.youth_race_entries e where e.race_id=yr.id and e.status='completed')
      and not exists(select 1 from public.youth_race_team_prizes p where p.race_id=yr.id)
  loop
    perform private.pay_youth_race_team_prizes_v1(r.id);
  end loop;
end;
$block$;
