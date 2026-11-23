-- Project Saturn / SAT-11: privacy-safe breakdown for real recent Auth presence.
-- Count unique Supabase user identities, not historical logins or email addresses.
-- Uses the same three-minute heartbeat table/window as the public homepage.
-- No user UUID, email, IP, session token, or individual last-seen timestamp
-- is returned. Keeps the normal unconverted-guest classification when a
-- Google/email identity has linked but conversion has NOT been finalized.
-- Only admin can execute; no game, player, cron, wallet or trial data is changed.

CREATE OR REPLACE FUNCTION public.get_admin_online_presence_breakdown_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $saturn$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_total integer := 0;
  v_guest integer := 0;
  v_registered integer := 0;
  v_converted integer := 0;
  v_last_seen timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_app_admin_v1() THEN
    RAISE EXCEPTION 'Administrator access required' USING errcode='42501';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE u.is_anonymous IS TRUE
        OR EXISTS (
          SELECT 1 FROM public.saturn_test_accounts_v1 s
          WHERE s.user_id = u.id AND s.converted_at IS NULL
        )
    )::integer,
    count(*) FILTER (
      WHERE u.is_anonymous IS NOT TRUE
        AND NOT EXISTS (
          SELECT 1 FROM public.saturn_test_accounts_v1 s
          WHERE s.user_id = u.id AND s.converted_at IS NULL
        )
    )::integer,
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM public.saturn_test_accounts_v1 s
        WHERE s.user_id = u.id AND s.converted_at IS NOT NULL
      )
    )::integer
  INTO v_total,v_guest,v_registered,v_converted
  FROM private.site_online_players_v1 p
  JOIN auth.users u ON u.id=p.user_id AND u.deleted_at IS NULL
  WHERE p.last_seen_at >= v_now - interval '3 minutes';

  SELECT max(p.last_seen_at) INTO v_last_seen
  FROM private.site_online_players_v1 p
  JOIN auth.users u ON u.id=p.user_id AND u.deleted_at IS NULL
  WHERE p.last_seen_at >= v_now - interval '3 minutes';

  RETURN jsonb_build_object(
    'generated_at',v_now,
    'window_seconds',180,
    'online_total',v_total,
    'online_guest',v_guest,
    'online_registered',v_registered,
    'online_converted_guest',v_converted,
    'last_presence_at',v_last_seen
  );
END;
$saturn$;

REVOKE ALL ON FUNCTION public.get_admin_online_presence_breakdown_v1()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_online_presence_breakdown_v1()
  TO authenticated,service_role;
