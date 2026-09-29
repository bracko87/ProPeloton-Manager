do $$
begin
  if to_regprocedure('public.finance_issue_emergency_loan_non_ai_core_v1(uuid,text,text,text)') is null then
    alter function public.finance_issue_emergency_loan(uuid,text,text,text)
      rename to finance_issue_emergency_loan_non_ai_core_v1;
  end if;

  if to_regprocedure('public.finance_ensure_mandatory_funds_non_ai_core_v1(uuid,bigint,text,text,text)') is null then
    alter function public.finance_ensure_mandatory_funds(uuid,bigint,text,text,text)
      rename to finance_ensure_mandatory_funds_non_ai_core_v1;
  end if;

  if to_regprocedure('public.finance_liquidate_club_for_insolvency_non_ai_core_v1(uuid,text,text)') is null then
    alter function public.finance_liquidate_club_for_insolvency(uuid,text,text)
      rename to finance_liquidate_club_for_insolvency_non_ai_core_v1;
  end if;

  if to_regprocedure('public.finance_spend_from_club_non_ai_core_v1(uuid,bigint,text,text,text,jsonb)') is null then
    alter function public.finance_spend_from_club(uuid,bigint,text,text,text,jsonb)
      rename to finance_spend_from_club_non_ai_core_v1;
  end if;
end
$$;

create or replace function public.finance_issue_emergency_loan(
  p_club_id uuid,
  p_reason text,
  p_ref_id text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'loan_issued',false,
      'reason','AI clubs do not use insolvency or emergency loans.'
    );
  end if;

  return public.finance_issue_emergency_loan_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id,p_idempotency_key
  );
end;
$$;

create or replace function public.finance_ensure_mandatory_funds(
  p_club_id uuid,
  p_required_amount bigint,
  p_reason text,
  p_ref_id text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  if p_required_amount is null or p_required_amount <= 0 then
    return jsonb_build_object(
      'ok',true,
      'status','not_required',
      'required_amount',coalesce(p_required_amount,0)
    );
  end if;

  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'required_amount',p_required_amount,
      'loans_issued',0,
      'financial_block',false
    );
  end if;

  return public.finance_ensure_mandatory_funds_non_ai_core_v1(
    p_club_id,p_required_amount,p_reason,p_ref_id,p_idempotency_key
  );
end;
$$;

create or replace function public.finance_liquidate_club_for_insolvency(
  p_club_id uuid,
  p_reason text,
  p_ref_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds_no_liquidation',
      'club_id',v_finance_club_id,
      'liquidated',false,
      'reason','AI clubs are exempt from insolvency liquidation.'
    );
  end if;

  return public.finance_liquidate_club_for_insolvency_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id
  );
end;
$$;

create or replace function public.finance_spend_from_club(
  p_club_id uuid,
  p_amount bigint,
  p_type text default 'expense',
  p_sink_code text default 'SINK',
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_is_ai boolean := false;
  v_club_acct uuid;
  v_existing uuid;
begin
  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=p_club_id;

  if not v_is_ai then
    return public.finance_spend_from_club_non_ai_core_v1(
      p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
    );
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if p_idempotency_key is not null then
    select t.id
      into v_existing
    from finance.transactions t
    where t.idempotency_key=p_idempotency_key
    order by t.created_at desc
    limit 1;

    if v_existing is not null then
      return public.finance_spend_from_club_non_ai_core_v1(
        p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
      );
    end if;
  end if;

  perform public.finance_get_or_create_club_account(p_club_id,'CASH','main');

  select a.id
    into v_club_acct
  from finance.accounts a
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
  limit 1;

  insert into finance.account_balances(account_id,balance)
  values (v_club_acct,0)
  on conflict (account_id) do nothing;

  update finance.account_balances
  set balance=greatest(balance,p_amount)
  where account_id=v_club_acct;

  return public.finance_spend_from_club_non_ai_core_v1(
    p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
  );
end;
$$;

create or replace function finance._sync_club_balances_from_entry_ai_safe_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public','finance','pg_temp'
as $$
declare
  v_club_id uuid;
  v_balance bigint;
  v_is_ai boolean := false;
  v_mirror_balance numeric;
begin
  perform set_config('finance.internal','1',true);

  select a.club_id,coalesce(c.is_ai,false)
    into v_club_id,v_is_ai
  from finance.accounts a
  join public.clubs c on c.id=a.club_id
  where a.id=new.account_id
    and a.club_id is not null
    and a.currency='CASH'
    and a.kind='main';

  if v_club_id is null then
    return new;
  end if;

  select b.balance
    into v_balance
  from finance.account_balances b
  where b.account_id=new.account_id;

  v_mirror_balance := case
    when v_is_ai then greatest(coalesce(v_balance,0),0)::numeric
    else coalesce(v_balance,0)::numeric
  end;

  update public.club_finance_summary
  set current_balance=v_mirror_balance,
      updated_at=now()
  where club_id=v_club_id;

  update public.clubs
  set cash_balance=v_mirror_balance,
      updated_at=now()
  where id=v_club_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_club_balances on finance.entries;
create trigger trg_sync_club_balances
after insert on finance.entries
for each row execute function finance._sync_club_balances_from_entry_ai_safe_v1();

-- Correct any currently active AI emergency loans. The immutable original
-- disbursement remains in the ledger; a balanced compensating transaction
-- reverses it, then the erroneous loan/state rows are removed.
do $$
declare
  r record;
  v_source_tx uuid;
  v_reversal_tx uuid;
  v_club_account uuid;
  v_lender_account uuid;
  v_key text;
begin
  for r in
    select el.*
    from finance.emergency_loans el
    join public.clubs c on c.id=el.club_id
    where coalesce(c.is_ai,false)=true
      and el.status='active'
  loop
    if exists (
      select 1 from finance.emergency_loan_repayment_runs rr
      where rr.loan_id=r.id
    ) then
      raise exception 'AI emergency loan % has repayment history; automatic void aborted.',r.id;
    end if;

    v_source_tx := nullif(r.metadata->>'transaction_id','')::uuid;
    if v_source_tx is null then
      raise exception 'AI emergency loan % has no source transaction.',r.id;
    end if;

    select a.id into v_club_account
    from finance.accounts a
    where a.club_id=r.club_id and a.currency='CASH' and a.kind='main'
    limit 1;

    select a.id into v_lender_account
    from finance.accounts a
    where a.system_code='LENDER_OF_LAST_RESORT'
      and a.currency='CASH' and a.kind='main'
    limit 1;

    if v_club_account is null or v_lender_account is null then
      raise exception 'Could not resolve accounts for AI emergency loan %.',r.id;
    end if;

    v_key := 'void_ai_loan_policy:'||v_source_tx::text;

    select t.id into v_reversal_tx
    from finance.transactions t
    where t.idempotency_key=v_key
    limit 1;

    if v_reversal_tx is null then
      insert into finance.transactions(type,idempotency_key,metadata)
      values (
        'emergency_loan_reset_reversal',
        v_key,
        jsonb_build_object(
          'reason','void_ai_emergency_loan_unlimited_funds_policy',
          'audit_only',true,
          'club_id',r.club_id,
          'loan_id',r.id,
          'source_transaction_id',v_source_tx,
          'principal_amount',r.principal_amount,
          'policy','AI teams are unlimited-funds teams and cannot enter insolvency.'
        )
      )
      returning id into v_reversal_tx;

      insert into finance.entries(transaction_id,account_id,amount,memo)
      values
        (v_reversal_tx,v_club_account,-r.principal_amount,'AI emergency loan policy reversal'),
        (v_reversal_tx,v_lender_account,r.principal_amount,'AI emergency loan policy reversal');
    end if;

    delete from finance.emergency_loans where id=r.id;
  end loop;

  delete from finance.club_insolvency_state cis
  using public.clubs c
  where c.id=cis.club_id
    and coalesce(c.is_ai,false)=true;
end;
$$;