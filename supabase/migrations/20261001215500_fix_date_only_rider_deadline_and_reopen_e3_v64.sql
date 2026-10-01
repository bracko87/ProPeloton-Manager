create or replace function public.trg_race_entry_rules_exact_early_january_deadline_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_exact timestamp without time zone;
  v_deadline_date date;
begin
  v_exact := public.get_exact_rider_submission_deadline_game_at_v1(new.race_id);

  if v_exact is not null then
    new.rider_submission_deadline_game_at := v_exact;
    new.rider_submission_deadline := v_exact::date;
    new.rider_submission_deadline_season_number := extract(year from v_exact)::int - 1999;
    new.rider_submission_deadline_month_number := extract(month from v_exact)::int;
    new.rider_submission_deadline_day_number := extract(day from v_exact)::int;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'rider_deadline_time_policy', 'january_1_15_stage1_minus_3_hours',
      'rider_submission_deadline_game_at', v_exact
    );
  else
    v_deadline_date := coalesce(
      public.make_game_rule_date_v1(
        new.rider_submission_deadline_season_number,
        new.rider_submission_deadline_month_number,
        new.rider_submission_deadline_day_number
      ),
      new.rider_submission_deadline
    );

    if v_deadline_date is null then
      select r.start_date::date - 3
      into v_deadline_date
      from public.races r
      where r.id = new.race_id;
    end if;

    new.rider_submission_deadline := v_deadline_date;
    new.rider_submission_deadline_game_at :=
      case when v_deadline_date is null then null else (v_deadline_date + 1)::timestamp end;

    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'rider_deadline_time_policy', 'date_only_end_of_day',
      'rider_submission_deadline_game_at', new.rider_submission_deadline_game_at
    );
  end if;

  return new;
end;
$function$;

update public.race_entry_rules rer
set rider_submission_deadline = rer.rider_submission_deadline
from public.races r
where r.id = rer.race_id
  and r.status = 'scheduled'
  and r.start_date::date >= public.get_current_game_date_date();

update public.race_team_entries
set missed_startlist_at = null,
    decision_reason = 'Accepted. Rider selection is open through the full listed rider-deadline day.',
    updated_at = now()
where id = 'f666af99-4b73-4955-98f9-3497acf5ef1f'
  and race_id = '9ae52e2e-6e12-4a1e-80c6-140a02dc8d47'
  and club_id = '3eb1ca2e-0b65-41c9-9793-ce3d2539410e';

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
      'deadline_reopened_reason', 'date_only_deadline_valid_through_end_of_day',
      'deadline_reopened_at', now()
    ),
    updated_at = now()
where id = '791d519d-f372-4cbc-8d50-237e0318f180'
  and race_id = '9ae52e2e-6e12-4a1e-80c6-140a02dc8d47'
  and club_id = '3eb1ca2e-0b65-41c9-9793-ce3d2539410e';

update public.club_race_commitment_scores
set score = least(100, score + 10),
    missed_startlist_count = greatest(0, missed_startlist_count - 1),
    updated_at = now()
where club_id = '3eb1ca2e-0b65-41c9-9793-ce3d2539410e'
  and exists (
    select 1
    from public.race_commitment_score_events e
    where e.id = 'c2e1d481-525e-4232-9d9d-b5219547ee9a'
      and e.event_type = 'missed_startlist'
  );

update public.race_commitment_score_events
set event_type = 'missed_startlist_reversed_deadline_bug',
    reason = 'REVERSED: date-only rider deadline is valid through the end of the listed game day. Original reason: ' || coalesce(reason, '')
where id = 'c2e1d481-525e-4232-9d9d-b5219547ee9a'
  and event_type = 'missed_startlist';

update public.notifications
set expires_at = least(coalesce(expires_at, now()), now()),
    payload_json = coalesce(payload_json, '{}'::jsonb) || jsonb_build_object(
      'deadline_reopened', true,
      'correction_reason', 'date_only_deadline_valid_through_end_of_day'
    )
where payload_json->>'race_id' = '9ae52e2e-6e12-4a1e-80c6-140a02dc8d47'
  and payload_json->>'club_id' = '3eb1ca2e-0b65-41c9-9793-ce3d2539410e'
  and payload_json->>'event_type' = 'missed_startlist';
