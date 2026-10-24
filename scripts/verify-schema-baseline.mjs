#!/usr/bin/env node
// Schema-only checkpoint; never accepts migration bodies, credentials or row data.
// Usage: node scripts/verify-schema-baseline.mjs reference.json candidate.json
import { readFileSync } from "node:fs";

const REQUIRED = ["tables", "columns", "routines"];
function load(path) {
  const obj = JSON.parse(readFileSync(path, "utf8"));
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw Error("Invalid snapshot JSON");
  if (Object.keys(obj).some(k => !REQUIRED.includes(k))) throw Error("Unexpected field: refuse possibly sensitive input");
  for (const key of REQUIRED) {
    if (!Number.isSafeInteger(obj[key]) || obj[key] < 0) throw Error("Invalid count: " + key);
  }
  return obj;
}
if (process.argv.length !== 4) {
  console.error("Usage: node scripts/verify-schema-baseline.mjs reference.json candidate.json");
  process.exit(2);
}
const [reference, candidate] = process.argv.slice(2).map(load);
const mismatches = REQUIRED.filter(key => reference[key] !== candidate[key]);
for (const key of REQUIRED) console.log(`${key}: reference=${reference[key]} candidate=${candidate[key]} ${mismatches.includes(key) ? "MISMATCH" : "OK"}`);
if (mismatches.length) {
  console.error("SCHEMA COUNT GATE FAILED. Counts alone never establish schema parity.");
  process.exit(1);
}
console.log("Schema counts match; detailed structural and behavioral equivalence is NOT verified.");
