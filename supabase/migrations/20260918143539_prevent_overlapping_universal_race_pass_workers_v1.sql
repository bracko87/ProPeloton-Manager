do $migration$
declare
  v_pass1 text;
  v_pass2 text;
begin
  select pg_get_functiondef('public.universal_race_stage_claim_pass1_resume_v1()'::regprocedure)
    into v_pass1;

  if position('interval ''3 minutes''' in v_pass1) = 0 then
    raise exception 'Expected pass1 3-minute active-worker lease was not found.';
  end if;

  v_pass1 := replace(
    v_pass1,
    'interval ''3 minutes''',
    'interval ''7 minutes'''
  );
  execute v_pass1;

  select pg_get_functiondef('public.universal_race_stage_claim_pass2_resume_v1()'::regprocedure)
    into v_pass2;

  if position('interval ''5 minutes''' in v_pass2) = 0 then
    raise exception 'Expected pass2 5-minute active-worker lease was not found.';
  end if;

  v_pass2 := replace(
    v_pass2,
    'interval ''5 minutes''',
    'interval ''7 minutes'''
  );
  execute v_pass2;
end
$migration$;

comment on function public.universal_race_stage_claim_pass1_resume_v1()
is 'Claims pass-1 race calculation retries only after a 7-minute silent lease, longer than the hosted Edge Function 400-second wall-clock ceiling, preventing overlapping duplicate CPU-heavy workers.';

comment on function public.universal_race_stage_claim_pass2_resume_v1()
is 'Claims pass-2 race calculation retries only after a 7-minute silent lease, longer than the hosted Edge Function 400-second wall-clock ceiling, preventing overlapping duplicate CPU-heavy workers.';
