-- Staff Advisory Support — Inbox integration
-- Reuses the existing backend-only Inbox primitive:
--   public.inbox_send_admin_message_to_user(p_user_id uuid, p_subject text, p_body text)
-- which returns the reusable admin conversation UUID.

create or replace function public.staff_advisory_deliver_inbox_v1(
  p_user_id uuid,
  p_staff_id uuid,
  p_role_type text,
  p_report_id uuid,
  p_title text,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_subject text;
  v_body text;
begin
  if p_user_id is null or p_staff_id is null or p_report_id is null then
    raise exception 'invalid_advisory_delivery_target';
  end if;

  v_subject := left(
    coalesce(nullif(trim(p_title), ''), 'Staff Advisory Report'),
    180
  );

  -- Keep the report self-identifying inside the shared admin thread while
  -- avoiding duplication of essential notifications.
  v_body := concat(
    coalesce(nullif(trim(p_body), ''), 'Your staff advisory report is ready.'),
    E'\n\n',
    'Advisory report reference: ', p_report_id::text
  );

  v_conversation_id := public.inbox_send_admin_message_to_user(
    p_user_id,
    v_subject,
    v_body
  );

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'message_id', null,
    'report_id', p_report_id,
    'role_type', p_role_type
  );
end;
$$;

revoke all on function public.staff_advisory_deliver_inbox_v1(uuid, uuid, text, uuid, text, text) from public;
