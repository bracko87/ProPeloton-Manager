import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { compareMigrationHistory } from "./lib/migrationParityV1.mjs";
const root = resolve(fileURLToPath(new URL("..",import.meta.url)));
const args=new Set(process.argv.slice(2));
const manifest=JSON.parse(readFileSync(join(root,"docs/engineering/prod_applied_migration_versions_20261024.json"),"utf8"));
const entries=readdirSync(join(root,"supabase/migrations"));
const parity=compareMigrationHistory(entries,manifest.productionAppliedVersions);
if(args.has("--json")) console.log(JSON.stringify(parity,null,2));
else {
 console.log(`PROPEL0TON migration parity snapshot ${manifest.snapshotDate}`);
 console.log(`Applied production: ${parity.productionApplied}, repository SQL files: ${parity.repositoryFiles}`);
 console.log(`Version matches: ${parity.matching}; applied without local file: ${parity.productionVersionsWithoutFile}; repository-only: ${parity.repositoryVersionsNotApplied}`);
 console.log(parity.canReplayCompleteHistory?"PARITY OK":"MIGRATION DRIFT — preview branch/full schema replay not release-ready");
 console.log("Historical migrations must be reconciled before creating another paid preview branch.");
}
if(args.has("--strict") && !parity.canReplayCompleteHistory) process.exitCode=1;
