-- Keep date-only rider deadlines open for the full listed game day.
-- A date such as 19 Mar expires at 00:00 on 20 Mar, not at 00:00 on 19 Mar.

create or replace function public.normalize_rider_submission_deadline_game_at_v1()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_deadline_date date;
begin
  if new.rider_submission_deadline_game_at is null then
    v_deadline_date := coalesce(
      new.rider_submission_deadline::date,
      case
        when new.rider_submission_deadline_season_number is not null
         and new.rider_submission_deadline_month_number is not null
         and new.rider_submission_deadline_day_number is not null
        then make_date(
          1999 + new.rider_submission_deadline_season_number::integer,
          new.rider_submission_deadline_month_number::integer,
          new.rider_submission_deadline_day_number::integer
        )
        else null
      end
    );

    if v_deadline_date is not null then
      new.rider_submission_deadline_game_at := (v_deadline_date + 1)::timestamp;
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_normalize_rider_submission_deadline_game_at_v1
  on public.race_entry_rules;

create trigger trg_normalize_rider_submission_deadline_game_at_v1
before insert or update of
  rider_submission_deadline,
  rider_submission_deadline_game_at,
  rider_submission_deadline_season_number,
  rider_submission_deadline_month_number,
  rider_submission_deadline_day_number
on public.race_entry_rules
for each row
execute function public.normalize_rider_submission_deadline_game_at_v1();

update public.race_entry_rules rer
set rider_submission_deadline_game_at = (
  coalesce(
    rer.rider_submission_deadline::date,
    case
      when rer.rider_submission_deadline_season_number is not null
       and rer.rider_submission_deadline_month_number is not null
       and rer.rider_submission_deadline_day_number is not null
      then make_date(
        1999 + rer.rider_submission_deadline_season_number::integer,
        rer.rider_submission_deadline_month_number::integer,
        rer.rider_submission_deadline_day_number::integer
      )
      else null
    end
  ) + 1
)::timestamp
from public.races r
where r.id = rer.race_id
  and rer.rider_submission_deadline_game_at is null
  and r.status = 'scheduled'
  and r.start_date::date >= public.get_current_game_date_date()
  and coalesce(
    rer.rider_submission_deadline::date,
    case
      when rer.rider_submission_deadline_season_number is not null
       and rer.rider_submission_deadline_month_number is not null
       and rer.rider_submission_deadline_day_number is not null
      then make_date(
        1999 + rer.rider_submission_deadline_season_number::integer,
        rer.rider_submission_deadline_month_number::integer,
        rer.rider_submission_deadline_day_number::integer
      )
      else null
    end
  ) is not null;

-- Correct the prematurely closed E3 Saxxo Classic Race Plan for the current user team.
do $block$
declare
  v_race_id uuid := '9ae52e2e-6e12-4a1e-80c6-140a02dc8d47';
  v_club_id uuid := '3eb1ca2e-0b65-41c9-9793-ce3d2539410e';
  v_entry_id uuid := 'f666af99-4b73-4955-98f9-3497acf5ef1f';
  v_prep_id uuid := '791d519d-f372-4cbc-8d50-237e0318f180';
  v_event_id uuid := 'c813f3c9-5702-4384-a4ab-9dd0046e10a8';
  v_source_tx uuid := 'dbcfaaa7-e37e-4c93-8d39-35ee36a30697';
  v_correction_tx uuid;
  v_source_created_by uuid;
begin
  -- Reopen rider selection / Race Plan.
  update public.race_team_entries
  set missed_startlist_at = null,
      decision_reason = 'Accepted. Rider selection reopened because the date-only rider deadline remains valid through the listed game day.',
      updated_at = now()
  where id = v_entry_id
    and race_id = v_race_id
    and club_id = v_club_id;

  update public.race_preparations
  set status = 'draft',
      startlist_status = 'draft',
      submitted_at = null,
      locked_at = null,
      metadata = (
        coalesce(metadata, '{}'::jsonb)
        - 'missed_startlist'
        - 'display_status'
        - 'reason'
        - 'locked_reason'
        - 'processed_at'
        - 'commitment_score_event_id'
        - 'finance_result'
        - 'score_before'
        - 'score_delta'
        - 'score_after'
        - 'cash_penalty'
      ) || jsonb_build_object(
        'deadline_reopened', true,
        'deadline_reopened_reason', 'same_day_date_only_deadline_bug',
        'deadline_reopened_at', now()
      ),
      updated_at = now()
  where id = v_prep_id
    and race_id = v_race_id
    and club_id = v_club_id;

  -- Reverse the commitment-score penalty exactly once while retaining an audit trail.
  if exists (
    select 1
    from public.race_commitment_score_events e
    where e.id = v_event_id
      and e.event_type = 'missed_startlist'
  ) then
    update public.club_race_commitment_scores
    set score = least(100, score + 10),
        missed_startlist_count = greatest(0, missed_startlist_count - 1),
        updated_at = now()
    where club_id = v_club_id;

    update public.race_commitment_score_events
    set event_type = 'missed_startlist_reversed_deadline_bug',
        reason = 'REVERSED: premature same-day date-only deadline processing. Original reason: ' || coalesce(reason, '')
    where id = v_event_id;

    -- Reverse the finance fine with a balanced correction transaction and void link.
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
          'reason', 'Premature same-day date-only rider deadline processing reversed.',
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
        'Premature same-day date-only rider deadline processing reversed.',
        jsonb_build_object(
          'race_id', v_race_id,
          'club_id', v_club_id,
          'commitment_score_event_id', v_event_id
        )
      );
    end if;
  end if;

  -- Hide any erroneous missed-startlist notification for this race/team.
  update public.notifications
  set expires_at = least(coalesce(expires_at, now()), now()),
      payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
        'deadline_reopened', true,
        'correction_reason', 'same_day_date_only_deadline_bug'
      )
  where payload_json->>'race_id' = v_race_id::text
    and payload_json->>'club_id' = v_club_id::text
    and payload_json->>'event_type' = 'missed_startlist';

  perform public.finance_recompute_weekly_summaries(v_club_id);
end;
$block$;
