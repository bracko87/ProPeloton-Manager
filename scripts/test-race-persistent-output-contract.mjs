import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
const sql=readFileSync(new URL("../docs/engineering/persistent_race_output_v2_proposal_20261024.sql",import.meta.url),"utf8");
const worker=readFileSync(new URL("../supabase/functions/universal-race-stage-safe-resume/index.ts",import.meta.url),"utf8");

test("same simulation + chunk index persists across different leases",()=>{
  assert.match(sql,/PRIMARY KEY\(stage_id,simulation_run_id,chunk_index\)/);
  assert.doesNotMatch(sql,/PRIMARY KEY\(stage_id,simulation_run_id,lease_token,chunk_index\)/);
  assert.match(sql,/ON CONFLICT DO NOTHING/);
  assert.match(sql,/v_existing IS DISTINCT FROM p_chunk_text/);
  assert.match(sql,/refuse to mix distinct outputs/);
});
test("writing and publishing require a current live step-10 lease",()=>{
  const leaseConditions=sql.match(/lease_token=p_lease_token AND status='running' AND step=10/g)||[];
  assert.equal(leaseConditions.length,2);
  const expirations=sql.match(/lease_expires_at>clock_timestamp\(\)/g)||[];
  assert.equal(expirations.length,2);
  assert.match(sql,/FOR UPDATE/);
});
test("only the worker service role may execute the v2 data API",()=>{
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL ON TABLE[\s\S]+?FROM PUBLIC,anon,authenticated/);
  assert.equal((sql.match(/GRANT EXECUTE ON FUNCTION/g)||[]).length,2);
  assert.equal((sql.match(/TO service_role/g)||[]).length,2);
});
test("missing or mixed chunks cannot publish and SQL rollback preserves chunks",()=>{
  assert.match(sql,/v_count<>p_chunk_count OR v_min<>0 OR v_max<>p_chunk_count-1/);
  assert.match(sql,/v_result:=public.universal_race_stage_submit_calculation_v1/);
  assert.match(sql,/Stage is already authoritative under another simulation/);
  assert.match(sql,/Incomplete or divergent persistent output/);
});
test("new worker path is opt-in and old compatible RPCs remain the default",()=>{
  assert.match(worker,/Deno\.env\.get\("PPM_PERSISTENT_RACE_OUTPUT_V2"\)==="enabled"/);
  assert.match(worker,/\? "universal_race_stage_write_persistent_output_chunk_v2"\s*: "universal_race_stage_write_checkpoint_chunk_v1"/);
  assert.match(worker,/\? "universal_race_stage_submit_persistent_output_v2"\s*: "universal_race_stage_submit_chunked_calculation_v1"/);
});
