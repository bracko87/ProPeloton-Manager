import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/proposed_safe_step_admission_cap_20261024.sql",import.meta.url),"utf8");

test("admission guard runs before the existing pending-stage selection",()=>{
  const guard=sql.indexOf("FROM public.race_stage_safe_calculation_v1\n  WHERE status='running'");
  const candidate=sql.indexOf("v_def := replace(v_def,v_query,v_control||v_query)");
  assert.ok(guard>0 && candidate>guard);
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended/);
  assert.match(sql,/lease_expires_at > clock_timestamp\(\)/);
});
test("capacity refuses to mutate existing stage and supplies retry hint",()=>{
  assert.match(sql,/'status','capacity_deferred'/);
  assert.match(sql,/'retry_after_seconds',15/);
  assert.match(sql,/'maximum_active_leases',v_max_active_safe_steps/);
  assert.match(sql,/v_max_active_safe_steps integer := 3/);
});
test("migration rejects source mismatch and duplicate application",()=>{
  assert.match(sql,/previously patched; abort/);
  assert.match(sql,/position\('safe_step_worker_capacity' IN v_def\)>0/);
});
