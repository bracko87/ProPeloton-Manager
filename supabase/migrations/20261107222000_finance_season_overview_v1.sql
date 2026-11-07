-- Full in-game season finance overview. Matches deployed RPC.
-- Uses the in-game ledger date and daily tick fallback for legacy payments.
CREATE OR REPLACE FUNCTION public.finance_get_club_season_overview_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
with clock as (
  select gs.season_number::integer as season_number,
         gs.month_number::integer as current_month
  from public.game_state gs
  where gs.id = true
),
authorized as (
  select c.id
  from public.clubs c
  where c.id = p_club_id
    and c.owner_user_id = (select auth.uid())
    and coalesce(c.club_type::text, 'main') = 'main'
),
restart as (
  select max(h.created_at) as restarted_at
  from public.club_restart_history h
  where h.club_id = p_club_id
),
ledger as (
  select t.id, t.created_at, t.type, t.metadata,
         coalesce(tt.name, t.type) as name,
         sum(e.amount)::numeric as amount
  from finance.transactions t
  join finance.entries e on e.transaction_id = t.id
  join finance.accounts a on a.id = e.account_id
  left join finance.transaction_types tt on tt.code = t.type
  cross join restart r
  where a.club_id = p_club_id
    and a.kind = 'main' and a.currency = 'CASH'
    and t.created_at > coalesce(r.restarted_at, '-infinity'::timestamptz)
    and coalesce(tt.is_user_visible, true)
    and not exists (select 1 from finance.transaction_voids v where v.source_transaction_id = t.id)
    and not exists (select 1 from finance.transaction_voids v where v.correction_transaction_id = t.id)
  group by t.id, t.created_at, t.type, t.metadata, tt.name
),
dated as (
  select l.*,
    coalesce(
      case when l.metadata #>> '{game_date,season}' ~ '^[0-9]{1,5}$'
           then (l.metadata #>> '{game_date,season}')::int end,
      tick.season_number
    ) as game_season,
    coalesce(
      case when l.metadata #>> '{game_date,month}' ~ '^(1[0-2]|[1-9])$'
           then (l.metadata #>> '{game_date,month}')::int end,
      tick.month_number::int
    ) as game_month
  from ledger l
  left join lateral (
    select g.season_number, g.month_number
    from public.game_daily_tick_log g
    where g.ran_at <= l.created_at
    order by g.ran_at desc limit 1
  ) tick on true
),
season_entries as (
  select d.*
  from dated d cross join clock c
  where d.game_season = c.season_number
    and d.game_month between 1 and c.current_month
),
classified as (
  select *,
    case when amount > 0 and type <> 'emergency_loan_disbursement'
      then amount else 0 end as operating_income,
    case when amount < 0 and type <> 'emergency_loan_principal_repayment'
      then -amount else 0 end as operating_expenses
  from season_entries
),
totals as (
  select coalesce(sum(operating_income),0) as income,
         coalesce(sum(operating_expenses),0) as expenses,
         coalesce(sum(case when type='emergency_loan_disbursement' then greatest(amount,0) else 0 end),0) as debt_cash_inflow,
         coalesce(sum(case when type='emergency_loan_principal_repayment' then greatest(-amount,0) else 0 end),0) as debt_principal_repaid,
         coalesce(sum(case when type='emergency_loan_interest' then greatest(-amount,0) else 0 end),0) as debt_interest_paid,
         coalesce(sum(case when type like 'sponsor_%' then operating_income else 0 end),0) as sponsor_income
  from classified
),
monthly as (
  select m.month as month,
         coalesce(sum(c.operating_income),0) as income,
         coalesce(sum(c.operating_expenses),0) as expenses
  from clock clk
  cross join lateral generate_series(1, clk.current_month) as m(month)
  left join classified c on c.game_month=m.month
  group by m.month
  order by m.month
),
by_type as (
  select type, min(name) as name, sum(operating_income) as income,
         sum(operating_expenses) as expenses
  from classified
  group by type
  having sum(operating_income) > 0 or sum(operating_expenses) > 0
),
result as (
  select jsonb_build_object(
    'season_number', clk.season_number,
    'current_month', clk.current_month,
    'income', tot.income,
    'expenses', tot.expenses,
    'net', tot.income - tot.expenses,
    'debt_cash_inflow', tot.debt_cash_inflow,
    'debt_principal_repaid', tot.debt_principal_repaid,
    'debt_interest_paid', tot.debt_interest_paid,
    'sponsor_income', tot.sponsor_income,
    'monthly', coalesce((select jsonb_agg(jsonb_build_object(
      'month', m.month, 'income', m.income, 'expenses', m.expenses, 'net', m.income-m.expenses) order by m.month)
      from monthly m), '[]'::jsonb),
    'breakdown', coalesce((select jsonb_agg(jsonb_build_object(
      'type', b.type, 'name', b.name, 'income', b.income, 'expenses', b.expenses) order by b.type)
      from by_type b), '[]'::jsonb)
  ) as payload
  from clock clk cross join totals tot
)
select case when (select auth.uid()) is null or not exists(select 1 from authorized)
  then null::jsonb else (select payload from result) end
$function$;

revoke all on function public.finance_get_club_season_overview_v1(uuid) from public, anon;
grant execute on function public.finance_get_club_season_overview_v1(uuid) to authenticated;
