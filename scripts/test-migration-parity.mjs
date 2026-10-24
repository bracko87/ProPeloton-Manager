import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {compareMigrationHistory} from "../scripts/lib/migrationParityV1.mjs";

test("matching migration history permits replay",()=>{
 const r=compareMigrationHistory(["20261001000000_a.sql","20261002000000_b.sql"],["20261001000000","20261002000000"]);
 assert.equal(r.canReplayCompleteHistory,true);
 assert.equal(r.matching,2);
});
test("detects both directions of production/repository divergence",()=>{
 const r=compareMigrationHistory(["20261001000000_a.sql","20261002000000_b.sql"],["20261001000000","20261003000000"]);
 assert.equal(r.canReplayCompleteHistory,false);
 assert.equal(r.productionVersionsWithoutFile,1);
 assert.equal(r.repositoryVersionsNotApplied,1);
});
test("rejects duplicate version filenames even if suffix differs",()=>{
 assert.throws(()=>compareMigrationHistory(["20261001000000_a.sql","20261001000000_b.sql"],["20261001000000"]),/Duplicate local/);
});
test("current snapshot explicitly records broken preview replay, not success",()=>{
 const snapshot=JSON.parse(readFileSync(new URL("../docs/engineering/prod_applied_migration_versions_20261024.json",import.meta.url),"utf8"));
 const list=readdirSync(new URL("../supabase/migrations/",import.meta.url));
 const parity=compareMigrationHistory(list,snapshot.productionAppliedVersions);
 assert.ok(parity.productionVersionsWithoutFile>0);
 assert.ok(parity.repositoryVersionsNotApplied>0);
 assert.equal(parity.canReplayCompleteHistory,false);
 const child=spawnSync(process.execPath,["scripts/check-migration-parity.mjs","--strict"],{encoding:"utf8"});
 assert.equal(child.status,1);
 assert.match(child.stdout,/MIGRATION DRIFT/);
});
