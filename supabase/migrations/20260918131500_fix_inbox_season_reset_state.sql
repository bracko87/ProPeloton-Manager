-- Keep season-start inbox broadcasts aligned with the active game timeline.
--
-- Fixes two issues:
-- 1) Season-start admin messages were not tagged with their game season.
-- 2) A full world reset to Season 1 cleared notifications but left old
--    season-start inbox broadcasts and inbox_season_start_guard rows behind.
--
-- Private user-to-user conversations are intentionally preserved.

alter table public.inbox_messages
  add column if not exists game_season_number integer;

create index if not exists inbox_messages_game_season_number_idx
  on public.inbox_messages (game_season_number)
  where game_season_number is not null;

create or replace function public.inbox_send_admin_season_message_to_user_v1(
  p_user_id uuid,
  p_season_number integer,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conversation_id uuid;
begin
  if p_season_number is null or p_season_number < 1 then
    raise exception 'Valid season number is required';
  end if;

  if coalesce(length(trim(p_subject)), 0) = 0 then
    raise exception 'Subject is required';
  end if;

  if coalesce(length(trim(p_body)), 0) = 0 then
    raise exception 'Message body is required';
  end if;

  v_conversation_id := public.inbox_get_or_create_admin_conversation(p_user_id);

  update public.inbox_conversations
  set subject = trim(p_subject)
  where id = v_conversation_id;

  insert into public.inbox_messages (
    conversation_id,
    sender_user_id,
    sender_kind,
    sender_label,
    body,
    game_season_number
  )
  values (
    v_conversation_id,
    null,
    'admin',
    'Admin',
    trim(p_body),
    p_season_number
  );

  return v_conversation_id;
end;
$function$;

revoke all on function public.inbox_send_admin_season_message_to_user_v1(uuid, integer, text, text) from public;
revoke all on function public.inbox_send_admin_season_message_to_user_v1(uuid, integer, text, text) from anon;
revoke all on function public.inbox_send_admin_season_message_to_user_v1(uuid, integer, text, text) from authenticated;
grant execute on function public.inbox_send_admin_season_message_to_user_v1(uuid, integer, text, text) to service_role;

create or replace function public.inbox_send_season_start_if_due(
  p_subject text default null::text,
  p_body text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_season_number integer;
  v_month_number smallint;
  v_day_number smallint;
  v_source_season integer;
  v_timeline_id uuid;
  v_transition_completed boolean;
  v_subject text;
  v_body text;
  v_inserted integer;
  v_sent_count integer := 0;
  r record;
begin
  select g.season_number, g.month_number, g.day_number
  into v_season_number, v_month_number, v_day_number
  from public.get_current_game_date() g;

  if v_season_number is null then
    raise exception 'Unable to determine current game date from game_state.';
  end if;

  if v_month_number <> 1 or v_day_number not in (1, 2) then
    return jsonb_build_object(
      'ok', true,
      'sent', false,
      'reason', 'not_due',
      'season_number', v_season_number
    );
  end if;

  v_source_season := v_season_number - 1;

  select c.timeline_id
  into v_timeline_id
  from public.season_transition_control_v1 c
  where c.id = true;

  select exists (
    select 1
    from public.season_transition_runs_v1 r2
    where r2.timeline_id = v_timeline_id
      and r2.source_season = v_source_season
      and r2.target_season = v_season_number
      and r2.status = 'completed'
  )
  into v_transition_completed;

  if not coalesce(v_transition_completed, false) then
    return jsonb_build_object(
      'ok', true,
      'sent', false,
      'reason', 'season_transition_not_completed',
      'season_number', v_season_number
    );
  end if;

  v_subject := coalesce(
    nullif(trim(p_subject), ''),
    format('Season %s has started', v_season_number)
  );

  v_body := coalesce(
    nullif(trim(p_body), ''),
    format(
      'A new season has started. Seasonal standings and progression have been refreshed for Season %s. Open the game to review your club status, new objectives, and current competition.',
      v_season_number
    )
  );

  insert into public.inbox_season_start_guard (
    season_number,
    sent_subject,
    sent_body
  )
  values (
    v_season_number,
    v_subject,
    v_body
  )
  on conflict (season_number) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object(
      'ok', true,
      'sent', false,
      'reason', 'already_sent',
      'season_number', v_season_number
    );
  end if;

  for r in
    select id
    from public.profiles
  loop
    perform public.inbox_send_admin_season_message_to_user_v1(
      r.id,
      v_season_number,
      v_subject,
      v_body
    );
    v_sent_count := v_sent_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sent', true,
    'season_number', v_season_number,
    'recipients', v_sent_count
  );
end;
$function$;

create or replace function public.inbox_clear_future_season_system_state_v1(
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_affected_conversations uuid[] := array[]::uuid[];
  v_deleted_messages integer := 0;
  v_deleted_guard_rows integer := 0;
  v_deleted_empty_conversations integer := 0;
begin
  if p_target_season is null or p_target_season < 1 then
    raise exception 'Valid target season is required';
  end if;

  select coalesce(array_agg(distinct m.conversation_id), array[]::uuid[])
  into v_affected_conversations
  from public.inbox_messages m
  join public.inbox_conversations c
    on c.id = m.conversation_id
  where c.conversation_type = 'admin_direct'
    and m.sender_kind = 'admin'
    and (
      coalesce(m.game_season_number, 0) > p_target_season
      or coalesce(
        nullif(
          substring(
            m.body
            from 'refreshed for Season ([0-9]+)\.'
          ),
          ''
        )::integer,
        0
      ) > p_target_season
      or (
        p_target_season = 1
        and m.body =
          'Welcome to the new season. Seasonal standings have been refreshed. Open the game to review your club status, new objectives, and current competition.'
      )
    );

  delete from public.inbox_messages m
  using public.inbox_conversations c
  where c.id = m.conversation_id
    and c.conversation_type = 'admin_direct'
    and m.sender_kind = 'admin'
    and (
      coalesce(m.game_season_number, 0) > p_target_season
      or coalesce(
        nullif(
          substring(
            m.body
            from 'refreshed for Season ([0-9]+)\.'
          ),
          ''
        )::integer,
        0
      ) > p_target_season
      or (
        p_target_season = 1
        and m.body =
          'Welcome to the new season. Seasonal standings have been refreshed. Open the game to review your club status, new objectives, and current competition.'
      )
    );

  get diagnostics v_deleted_messages = row_count;

  delete from public.inbox_season_start_guard
  where season_number > p_target_season;

  get diagnostics v_deleted_guard_rows = row_count;

  if cardinality(v_affected_conversations) > 0 then
    update public.inbox_conversations c
    set
      subject = 'Admin',
      last_message_at = (
        select max(m.created_at)
        from public.inbox_messages m
        where m.conversation_id = c.id
      ),
      updated_at = clock_timestamp()
    where c.id = any(v_affected_conversations)
      and exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = c.id
      );

    delete from public.inbox_conversation_participants cp
    where cp.conversation_id = any(v_affected_conversations)
      and not exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = cp.conversation_id
      );

    delete from public.inbox_conversations c
    where c.id = any(v_affected_conversations)
      and not exists (
        select 1
        from public.inbox_messages m
        where m.conversation_id = c.id
      );

    get diagnostics v_deleted_empty_conversations = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'target_season', p_target_season,
    'deleted_messages', v_deleted_messages,
    'deleted_guard_rows', v_deleted_guard_rows,
    'deleted_empty_admin_conversations', v_deleted_empty_conversations
  );
end;
$function$;

revoke all on function public.inbox_clear_future_season_system_state_v1(integer) from public;
revoke all on function public.inbox_clear_future_season_system_state_v1(integer) from anon;
revoke all on function public.inbox_clear_future_season_system_state_v1(integer) from authenticated;
grant execute on function public.inbox_clear_future_season_system_state_v1(integer) to service_role;

create or replace function public.game_world_reset_execute_v1(
  p_reset_run_id uuid,
  p_confirm text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'finance', 'auth', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_inbox_cleanup jsonb := '{}'::jsonb;
  v_cleanup jsonb := '{}'::jsonb;
  v_validation jsonb;
begin
  -- Keep the already-proven world rebuild as the core operation.
  v_result := public.game_world_reset_execute_core_v1(p_reset_run_id,p_confirm);

  -- Core failures are already audited by the core function. Do not erase
  -- runtime history unless the actual world rebuild succeeded.
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;

  -- A reset to Season 1 must not retain system inbox broadcasts from a later
  -- season/timeline. Private user-to-user conversations are preserved.
  v_inbox_cleanup := public.inbox_clear_future_season_system_state_v1(1);

  -- A successful full reset must start a fresh execution timeline too.
  v_cleanup := public.game_world_reset_clear_runtime_execution_state_v1();

  -- Revalidate after cleanup/rebase. A failure here aborts the outer statement,
  -- rolling the successful core rebuild back as one atomic reset transaction.
  v_validation := public.game_world_reset_validate_v2();
  if coalesce((v_validation->>'ok')::boolean,false) is not true then
    raise exception 'Post-runtime-cleanup reset validation failed: %',v_validation;
  end if;

  update public.game_world_reset_runs
  set execution_report = coalesce(execution_report,'{}'::jsonb)
        || jsonb_build_object(
          'inbox_cleanup',v_inbox_cleanup,
          'runtime_cleanup',v_cleanup,
          'runtime_cleanup_atomic',true
        ),
      validation_report = v_validation,
      updated_at = clock_timestamp()
  where id=p_reset_run_id;

  return v_result
    || jsonb_build_object(
      'inbox_cleanup',v_inbox_cleanup,
      'runtime_cleanup',v_cleanup,
      'post_runtime_cleanup_validation',v_validation
    );
end;
$function$;

-- Repair the currently active timeline immediately. This is safe on later
-- environments too: only broadcasts newer than the current game season are
-- removed, plus the known untagged legacy season-start test message when the
-- world is currently Season 1.
select public.inbox_clear_future_season_system_state_v1(
  (select season_number from public.game_state where id = true)
);
