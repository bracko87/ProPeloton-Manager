do $block$
declare
  v_source_tx uuid := '20c28700-701e-4ed8-9fcf-64918a75d091';
  v_event_id uuid := 'c2e1d481-525e-4232-9d9d-b5219547ee9a';
  v_race_id uuid := '9ae52e2e-6e12-4a1e-80c6-140a02dc8d47';
  v_club_id uuid := '3eb1ca2e-0b65-41c9-9793-ce3d2539410e';
  v_correction_tx uuid;
  v_source_created_by uuid;
begin
  if exists (
    select 1 from finance.transactions t where t.id = v_source_tx
  ) and not exists (
    select 1 from finance.transaction_voids tv where tv.source_transaction_id = v_source_tx
  ) then
    select t.created_by
    into v_source_created_by
    from finance.transactions t
    where t.id = v_source_tx;

    insert into finance.transactions(type, created_by, idempotency_key, metadata)
    values (
      'race_missed_startlist_fine',
      v_source_created_by,
      'reverse-race-missed-startlist-fine-' || v_event_id::text,
      jsonb_build_object(
        'correction', true,
        'reason', 'Premature date-only rider deadline processing reversed.',
        'source_transaction_id', v_source_tx,
        'race_id', v_race_id,
        'club_id', v_club_id,
        'commitment_score_event_id', v_event_id
      )
    )
    returning id into v_correction_tx;

    insert into finance.entries(transaction_id, account_id, amount, memo)
    select
      v_correction_tx,
      e.account_id,
      -e.amount,
      'Reversal of premature missed startlist fine'
    from finance.entries e
    where e.transaction_id = v_source_tx;

    -- The legacy missed-startlist fine function also changed account_balances
    -- manually after inserting entries. Mirror that legacy side effect here so
    -- the erroneous fine is fully undone.
    update finance.account_balances b
    set balance = b.balance + x.delta,
        updated_at = now()
    from (
      select e.account_id, sum(-e.amount)::bigint as delta
      from finance.entries e
      where e.transaction_id = v_source_tx
      group by e.account_id
    ) x
    where b.account_id = x.account_id;

    insert into finance.transaction_voids(
      source_transaction_id,
      correction_transaction_id,
      reason,
      metadata
    )
    values (
      v_source_tx,
      v_correction_tx,
      'Premature date-only rider deadline processing reversed.',
      jsonb_build_object(
        'race_id', v_race_id,
        'club_id', v_club_id,
        'commitment_score_event_id', v_event_id
      )
    );
  end if;

  perform public.finance_recompute_weekly_summaries(v_club_id);
end;
$block$;
