
drop trigger if exists trg_credit_youth_race_prizes_v1 on public.youth_races;

create or replace function private.credit_youth_race_prizes_v1(p_race_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
begin
  return private.pay_youth_race_team_prizes_v1(p_race_id);
end;
$function$;

revoke all on function private.credit_youth_race_prizes_v1(uuid)
from public,anon,authenticated;
