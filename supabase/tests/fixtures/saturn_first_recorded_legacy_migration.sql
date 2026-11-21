-- Exact first-recorded production migration, captured read-only 2026-11-21.
-- Test fixture ONLY, never put in supabase/migrations or execute on production.
-- Expected to fail on an empty PostgreSQL database (missing earlier base schema).
do $migration$
declare
  v_def text;
  v_old text;
  v_new text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'generate_race_prize_awards_v1'
  order by p.oid
  limit 1;

  v_def := replace(v_def, E'\r\n', E'\n');

  v_old := $old$
  if p_is_final then
    delete from public.race_prize_awards
    where race_id = p_race_id;
  else
    delete from public.race_prize_awards
    where race_id = p_race_id
      and stage_id = v_stage_id
      and bucket_key in ('stage_finish', 'oneday_finish');
  end if;
$old$;

  v_new := $new$
  -- Never delete already-paid awards. Current-stage pending rows may be
  -- refreshed before payment; final-stage generation upserts the final
  -- classifications and all stage rows while preserving paid history.
  if not p_is_final then
    delete from public.race_prize_awards
    where race_id = p_race_id
      and stage_id = v_stage_id
      and bucket_key in ('stage_finish', 'oneday_finish')
      and status = 'pending';
  end if;
$new$;

  if position(v_old in v_def) = 0 then
    raise exception 'Expected generate_race_prize_awards_v1 reward cleanup block was not found.';
  end if;

  execute replace(v_def, v_old, v_new);

  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'universal_race_stage_finalize_v1'
  order by p.oid
  limit 1;

  v_def := replace(v_def, E'\r\n', E'\n');

  v_old := $old$
  if v_is_final_stage then
    perform public.generate_race_ranking_point_awards_v1(v_run.race_id, v_run.stage_id, true);
    perform public.generate_race_prize_awards_v1(v_run.race_id, v_run.stage_id, true);
    v_prize_payment_result := public.race_engine_pay_prize_awards_v1(v_run.race_id, v_run.stage_id);
  end if;
$old$;

  v_new := $new$
  -- Every published stage receives its sporting points and stage prize.
  -- The existing helpers add final classifications automatically on the
  -- final stage, and payment is scoped to this stage so earlier paid rows
  -- cannot be paid twice.
  perform public.race_engine_apply_international_points_after_stage_v1(v_run.stage_id);
  perform public.generate_race_prize_awards_v1(v_run.race_id, v_run.stage_id, v_is_final_stage);
  v_prize_payment_result := public.race_engine_pay_prize_awards_v1(v_run.race_id, v_run.stage_id);
$new$;

  if position(v_old in v_def) = 0 then
    raise exception 'Expected universal_race_stage_finalize_v1 reward block was not found.';
  end if;

  execute replace(v_def, v_old, v_new);
end
$migration$;
