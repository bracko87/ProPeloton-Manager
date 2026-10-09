-- Zero-prize individual races must not create synthetic team cash awards.
-- NCQ and similar rider-based events intentionally have prize_fund_cash = 0,
-- while their stage result team_id is the rider participant unit. Suppress only
-- those zero-value rows before the clubs FK is checked. Positive prizes and all
-- ordinary team-race awards remain unchanged.

create or replace function public.race_prize_awards_skip_zero_individual_award_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_individual_only boolean := false;
begin
  if coalesce(new.amount_cash,0) <> 0
     or new.rider_id is null
     or new.team_id is null
     or new.team_id is distinct from new.rider_id
  then
    return new;
  end if;

  select lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes')
  into v_individual_only
  from public.races r
  where r.id=new.race_id;

  if coalesce(v_individual_only,false)
     and exists (
       select 1
       from public.race_participant_riders participant
       where participant.race_id=new.race_id
         and participant.rider_id=new.rider_id
         and participant.team_id=new.team_id
     )
  then
    return null;
  end if;

  return new;
end;
$function$;

drop trigger if exists race_prize_awards_skip_zero_individual_award_v1
  on public.race_prize_awards;

create trigger race_prize_awards_skip_zero_individual_award_v1
before insert
on public.race_prize_awards
for each row
execute function public.race_prize_awards_skip_zero_individual_award_v1();

comment on function public.race_prize_awards_skip_zero_individual_award_v1()
is 'Suppresses zero-cash prize rows whose team_id is an individual participant unit; never suppresses positive prizes or ordinary team awards.';
