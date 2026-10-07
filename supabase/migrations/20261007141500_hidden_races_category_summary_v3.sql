-- Enrich the Hidden Races test view with category-based race entry rules.
-- This keeps the reserve list focused on the race-level information needed
-- before a hidden race is ever scheduled: category, teams, riders and prize fund.

create or replace function public.get_hidden_reserve_races_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pool_id', p.id,
        'race_id', r.id,
        'name', r.name,
        'short_name', r.short_name,
        'country_code', coalesce(p.country_code,r.country_code),
        'country_name', c.name,
        'host_city', r.host_city,
        'category', r.category,
        'race_type', r.race_type,
        'stage_count', r.stage_count,
        'status', r.status,
        'active', p.active,
        'is_calendar_public', p.is_calendar_public,
        'pool_key', p.pool_key,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'target_teams', er.target_teams,
        'min_teams', er.min_teams,
        'max_teams', er.max_teams,
        'min_riders_per_team', er.min_riders_per_team,
        'max_riders_per_team', er.max_riders_per_team,
        'prize_fund_cash', er.prize_fund_cash,
        'prize_fund_source', er.prize_fund_source,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      order by coalesce(c.name,coalesce(p.country_code,r.country_code)), r.name, r.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.race_reserve_pool p
  join public.races r on r.id=p.race_id
  left join public.countries c
    on c.code=coalesce(p.country_code,r.country_code)
  left join public.race_entry_rules er
    on er.race_id=r.id;

  return v_result;
end;
$$;

revoke all on function public.get_hidden_reserve_races_v1() from public;
grant execute on function public.get_hidden_reserve_races_v1() to authenticated;
