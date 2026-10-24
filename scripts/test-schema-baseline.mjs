import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(reference, candidate) {
  const dir = mkdtempSync(join(tmpdir(), "ppm-schema-check-"));
  try {
    const left = join(dir, "reference.json");
    const right = join(dir, "candidate.json");
    writeFileSync(left, JSON.stringify(reference));
    writeFileSync(right, JSON.stringify(candidate));
    return spawnSync(process.execPath, ["scripts/verify-schema-baseline.mjs", left, right], { encoding:"utf8" });
  } finally { rmSync(dir, {recursive:true,force:true}); }
}
const ref = {tables:629,columns:10834,routines:2375};
test("matching counts pass with explicit limitations", () => {
  const result=run(ref,{...ref});
  assert.equal(result.status,0);
  assert.match(result.stdout,/NOT verified/);
});
test("missing objects fail", () => {
  const result=run(ref,{...ref,tables:628});
  assert.equal(result.status,1);
  assert.match(result.stderr,/FAILED/);
});
test("unexpected fields are rejected", () => {
  const result=run(ref,{...ref,sql:"not permitted"});
  assert.notEqual(result.status,0);
});
