-- Companion registry for immutable finance ledger corrections.
-- Source ledger transactions remain untouched; a compensating transaction is
-- posted and the source is registered here so player/gameplay reporting omits
-- it while admin/audit views can still inspect the original record.

create table if not exists finance.transaction_voids (
  source_transaction_id uuid primary key references finance.transactions(id),
  correction_transaction_id uuid references finance.transactions(id),
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_finance_transaction_voids_correction_v1
  on finance.transaction_voids(correction_transaction_id);

comment on table finance.transaction_voids is
  'Immutable-ledger companion registry: source transactions remain untouched, but registered rows are excluded from player/gameplay reporting after a compensating ledger transaction is posted.';

create or replace function public.finance_get_club_statement(
  p_club_id uuid,p_limit integer default 200,p_before timestamptz default null
)
returns table(created_at timestamptz,transaction_id uuid,type text,net_amount bigint,metadata jsonb)
language sql
security definer
set search_path to ''
as $$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h where h.club_id=p_club_id
  )
  select t.created_at,t.id,t.type,sum(e.amount),t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH' and a.kind='main'
    and finance.is_club_member_or_owner(p_club_id,auth.uid())
    and coalesce(tt.is_user_visible,true)=true
    and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
    and (p_before is null or t.created_at<p_before)
    and t.created_at>coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
$$;

create or replace function public.finance_get_club_statement_v2(
  p_club_id uuid,p_limit integer default 200,p_before timestamptz default null
)
returns table(created_at timestamptz,transaction_id uuid,type text,type_name text,category text,net_amount bigint,metadata jsonb)
language sql
security definer
set search_path to ''
as $$
  with restart_boundary as (
    select max(h.created_at) as restarted_at
    from public.club_restart_history h where h.club_id=p_club_id
  )
  select t.created_at,t.id,t.type,coalesce(tt.name,t.type),coalesce(tt.category,'unknown'),sum(e.amount),t.metadata
  from finance.transactions t
  join finance.entries e on e.transaction_id=t.id
  join finance.accounts a on a.id=e.account_id
  left join finance.transaction_types tt on tt.code=t.type
  cross join restart_boundary rb
  where a.club_id=p_club_id
    and a.currency='CASH' and a.kind='main'
    and finance.is_club_member_or_owner(p_club_id,auth.uid())
    and coalesce(tt.is_user_visible,true)=true
    and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
    and (p_before is null or t.created_at<p_before)
    and t.created_at>coalesce(rb.restarted_at,'-infinity'::timestamptz)
  group by t.created_at,t.id,t.type,tt.name,tt.category,t.metadata
  order by t.created_at desc
  limit greatest(p_limit,1);
$$;

create or replace function public.finance_recompute_weekly_summaries(p_club_id uuid default null)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  perform set_config('finance.internal','1',true);

  with club_wallet as (
    select a.club_id,a.id account_id
    from finance.accounts a
    where a.club_id is not null and a.currency='CASH' and a.kind='main'
      and (p_club_id is null or a.club_id=p_club_id)
  ), sums as (
    select w.club_id,
      coalesce(sum(case when e.amount>0 then e.amount else 0 end),0) income,
      coalesce(sum(case when e.amount<0 then -e.amount else 0 end),0) expenses
    from club_wallet w
    join finance.entries e on e.account_id=w.account_id
    join finance.transactions t on t.id=e.transaction_id
    left join finance.transaction_types tt on tt.code=t.type
    where t.type<>'opening_balance'
      and coalesce(tt.is_user_visible,true)=true
      and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
      and t.created_at>=now()-interval '7 days'
    group by w.club_id
  )
  update public.club_finance_summary s
  set weekly_income=coalesce(x.income,0)::numeric,
      weekly_expenses=coalesce(x.expenses,0)::numeric,
      updated_at=now()
  from sums x
  where s.club_id=x.club_id and (p_club_id is null or s.club_id=p_club_id);

  update public.club_finance_summary s
  set weekly_income=0,weekly_expenses=0,updated_at=now()
  where (p_club_id is null or s.club_id=p_club_id)
    and exists(select 1 from finance.accounts a where a.club_id=s.club_id and a.currency='CASH' and a.kind='main')
    and not exists(
      select 1
      from finance.accounts a
      join finance.entries e on e.account_id=a.id
      join finance.transactions t on t.id=e.transaction_id
      left join finance.transaction_types tt on tt.code=t.type
      where a.club_id=s.club_id and a.currency='CASH' and a.kind='main'
        and t.type<>'opening_balance'
        and coalesce(tt.is_user_visible,true)=true
        and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
        and t.created_at>=now()-interval '7 days'
    );
end;
$$;

create or replace function public.finance_get_restart_safe_overview_summary_v1(p_club_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_user_id uuid;
  v_restart_at timestamptz;
  v_cash_balance numeric:=0;
  v_weekly_income numeric:=0;
  v_weekly_expenses numeric:=0;
begin
  v_user_id:=auth.uid();
  if p_club_id is null then raise exception 'Club id is required.'; end if;
  if v_user_id is not null and not exists(
    select 1 from public.clubs c where c.id=p_club_id and c.owner_user_id=v_user_id and coalesce(c.club_type::text,'main')='main'
  ) then raise exception 'You can only view finance overview for your own main club.'; end if;

  select max(h.created_at) into v_restart_at from public.club_restart_history h where h.club_id=p_club_id;
  select coalesce(c.cash_balance,0) into v_cash_balance from public.clubs c where c.id=p_club_id;

  with club_transaction_net as (
    select t.id transaction_id,t.created_at,sum(e.amount)::numeric net_amount
    from finance.transactions t
    join finance.entries e on e.transaction_id=t.id
    join finance.accounts a on a.id=e.account_id
    left join finance.transaction_types tt on tt.code=t.type
    where a.club_id=p_club_id and a.currency='CASH' and a.kind='main'
      and coalesce(tt.is_user_visible,true)=true
      and not exists(select 1 from finance.transaction_voids tv where tv.source_transaction_id=t.id)
      and t.created_at>coalesce(v_restart_at,'-infinity'::timestamptz)
      and t.created_at>=now()-interval '7 days'
    group by t.id,t.created_at
  )
  select coalesce(sum(greatest(net_amount,0)),0),coalesce(sum(greatest(-net_amount,0)),0)
  into v_weekly_income,v_weekly_expenses
  from club_transaction_net;

  return jsonb_build_object(
    'club_id',p_club_id,'current_balance',v_cash_balance,
    'weekly_income',v_weekly_income,'weekly_expenses',v_weekly_expenses,
    'wage_total',0,'updated_at',now(),'restart_boundary',v_restart_at,
    'source','restart_safe_ledger_view'
  );
end;
$$;
