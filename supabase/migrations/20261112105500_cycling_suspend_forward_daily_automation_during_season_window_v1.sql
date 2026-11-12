-- Suppress ordinary forward daily automation during the protected 24h
-- migration and 24h preparation phases. Avoid concurrent rider/contract
-- writes and deadlocks. The active cron remains configured and automatically
-- resumes its original behavior when the season window phase becomes 'off'.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.process_forward_daily_automation_safe_v2()'::regprocedure) INTO v_src;
 IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'begin
  select * into v_activation from public.automation_forward_activation_v1 where id=true;','')))/length('begin
  select * into v_activation from public.automation_forward_activation_v1 where id=true;')<>1 THEN
   RAISE EXCEPTION 'Forward automation baseline changed; refusing guard';
 END IF;
 EXECUTE replace(v_src,'begin
  select * into v_activation from public.automation_forward_activation_v1 where id=true;','begin
  -- The clock and Season 2 calendar remain frozen during protected rollover;
  -- daily automation must not race migration updates on riders and contracts.
  if exists (
    select 1 from public.cycling_season_window_v1 w
    where w.id=true and w.phase in (''migration'',''delayed'',''preparation'')
  ) then
    return jsonb_build_object(''status'',''deferred_during_protected_season_window'',''success'',true);
  end if;
  select * into v_activation from public.automation_forward_activation_v1 where id=true;');
END $guard$;