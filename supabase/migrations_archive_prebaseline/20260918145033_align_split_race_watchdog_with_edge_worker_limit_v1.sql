do $migration$
declare
  v_def text;
  v_old text := $old$
    v_stale_after := case
      when v_phase in ('primary_engine_started','fallback_engine_started') then interval '15 minutes'
      when v_phase in ('primary_engine_finished','output_ready','submitting','scenario_reserved') then interval '5 minutes'
      when v_phase in ('claimed','payload_loading','payload_loaded') then interval '5 minutes'
      else interval '5 minutes'
    end;
$old$;
  v_new text := $new$
    v_stale_after := case
      when v_phase in ('primary_engine_started','fallback_engine_started') then interval '15 minutes'
      when v_phase in ('pass1_resume_claimed','pass1_payload_loading','pass1_started',
                       'pass2_resume_claimed','pass2_payload_loading') then interval '7 minutes'
      when v_phase in ('primary_engine_finished','fallback_engine_finished','output_ready','submitting','scenario_reserved') then interval '5 minutes'
      when v_phase in ('claimed','payload_loading','payload_loaded','pass1_pending','pass1_ready_no_scenario') then interval '5 minutes'
      else interval '5 minutes'
    end;
$new$;
begin
  select pg_get_functiondef('public.universal_race_stage_survival_recover_v1()'::regprocedure)
    into v_def;
  if position(v_old in v_def)=0 then
    raise exception 'Expected survival lease case block was not found.';
  end if;
  execute replace(v_def,v_old,v_new);
end
$migration$;

comment on function public.universal_race_stage_survival_recover_v1()
is 'Recovers stale race calculations with phase-aware leases. Split pass setup/calculation phases receive a 7-minute lease so the watchdog cannot expire a legitimate hosted Edge worker before its 400-second wall-clock ceiling.';
