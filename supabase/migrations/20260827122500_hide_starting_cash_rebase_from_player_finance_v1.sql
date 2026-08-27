-- Keep the one-time economy opening-balance adjustment auditable but invisible
-- in player-facing finance statements.

insert into finance.transaction_types(
  code,name,category,description,is_user_visible,affects_weekly,is_taxable,tax_rate_bps,created_at,updated_at
)
values(
  'starting_cash_balance_rebase',
  'Starting Cash Balance Rebase',
  'system',
  'Administrative opening-balance adjustment after economy rebalance; retained for audit but hidden from player finance statements.',
  false,
  false,
  false,
  0,
  now(),
  now()
)
on conflict(code) do update set
  name=excluded.name,
  category=excluded.category,
  description=excluded.description,
  is_user_visible=false,
  affects_weekly=false,
  is_taxable=false,
  tax_rate_bps=0,
  updated_at=now();

create or replace function public.finance_get_club_statement(
  p_club_id uuid,
  p_limit integer default 200,
  p_before timestamptz default null
)
returns table(
  created_at timestamptz,
  transaction_id uuid,
  type text,
  net_amount bigint,
  metadata jsonb
)
language sql
security definer
set search_path to ''
as $$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h
    where h.club_id = p_club_id
  )
  select
    t.created_at,
    t.id as transaction_id,
    t.type,
    sum(e.amount) as net_amount,
    t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
    and finance.is_club_member_or_owner(p_club_id,auth.uid())
    and coalesce(tt.is_user_visible,true)=true
    and (p_before is null or t.created_at < p_before)
    and t.created_at > coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
$$;

create or replace function public.finance_get_club_statement_v2(
  p_club_id uuid,
  p_limit integer default 200,
  p_before timestamptz default null
)
returns table(
  created_at timestamptz,
  transaction_id uuid,
  type text,
  type_name text,
  category text,
  net_amount bigint,
  metadata jsonb
)
language sql
security definer
set search_path to ''
as $$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h
    where h.club_id = p_club_id
  )
  select
    t.created_at,
    t.id as transaction_id,
    t.type,
    coalesce(tt.name,t.type) as type_name,
    coalesce(tt.category,'unknown') as category,
    sum(e.amount) as net_amount,
    t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
    and finance.is_club_member_or_owner(p_club_id,auth.uid())
    and coalesce(tt.is_user_visible,true)=true
    and (p_before is null or t.created_at < p_before)
    and t.created_at > coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,tt.name,tt.category,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
$$;
