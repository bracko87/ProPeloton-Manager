import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const PROJECT_REF = "okuravitxocyevkexfgi";
const METRICS_URL = `https://${PROJECT_REF}.supabase.co/customer/v1/privileged/metrics`;
type Sample = { name: string; labels: Record<string,string>; value: number };

function parseLabels(raw = "") {
  const out: Record<string,string> = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out[m[1]] = m[2];
  return out;
}
function parsePrometheus(text: string): Sample[] {
  const rows: Sample[] = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([^\s]+)(?:\s+\d+)?$/);
    if (!m) continue;
    const value = Number(m[3]);
    if (Number.isFinite(value)) rows.push({ name: m[1], labels: parseLabels(m[2] ?? ""), value });
  }
  return rows;
}
function one(rows: Sample[], name: string, predicate?: (s: Sample) => boolean) {
  return rows.find((s) => s.name === name && (!predicate || predicate(s)));
}
function cpuBusyPercent(aRows: Sample[], bRows: Sample[]) {
  const key = (s: Sample) => `${s.labels.cpu ?? ""}|${s.labels.mode ?? ""}`;
  const a = new Map(aRows.filter((s) => s.name === "node_cpu_seconds_total" && s.labels.service_type === "db").map((s) => [key(s), s.value]));
  let total = 0, idle = 0;
  for (const s of bRows.filter((x) => x.name === "node_cpu_seconds_total" && x.labels.service_type === "db")) {
    const before = a.get(key(s));
    if (before === undefined) continue;
    const delta = Math.max(0, s.value - before);
    total += delta;
    if (s.labels.mode === "idle") idle += delta;
  }
  return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - idle / total))) : null;
}
function cpuLoadFallback(rows: Sample[]) {
  const load = one(rows, "node_load5", (s) => s.labels.service_type === "db")?.value;
  const cpus = new Set(rows.filter((s) => s.name === "node_cpu_seconds_total" && s.labels.service_type === "db").map((s) => s.labels.cpu).filter(Boolean));
  if (load === undefined || cpus.size === 0) return null;
  return Math.max(0, Math.min(100, 100 * load / cpus.size));
}
function ramPercent(rows: Sample[]) {
  const total = one(rows, "node_memory_MemTotal_bytes", (s) => s.labels.service_type === "db")?.value;
  const available = one(rows, "node_memory_MemAvailable_bytes", (s) => s.labels.service_type === "db")?.value;
  return total && available !== undefined ? Math.max(0, Math.min(100, 100 * (total - available) / total)) : null;
}
function diskStats(rows: Sample[]) {
  const sizes = rows.filter((s) => s.name === "node_filesystem_size_bytes" && s.labels.service_type === "db");
  const target = sizes.find((s) => s.labels.mountpoint === "/data") ?? [...sizes].sort((a,b) => b.value - a.value)[0];
  if (!target?.value) return { percent: null, total: null, used: null };
  const avail = rows.find((s) => s.name === "node_filesystem_avail_bytes" && s.labels.service_type === "db" && s.labels.mountpoint === target.labels.mountpoint && s.labels.device === target.labels.device)?.value;
  if (avail === undefined) return { percent: null, total: target.value, used: null };
  const used = Math.max(0, target.value - avail);
  return {
    percent: Math.max(0, Math.min(100, 100 * used / target.value)),
    total: target.value,
    used,
  };
}
function computeSize(rows: Sample[]) {
  const max = one(rows, "max_connections_connection_count")?.value ?? null;
  if (max === null) return { label: "Unknown", max };
  if (max <= 60) return { label: "Micro", max };
  if (max <= 90) return { label: "Small", max };
  if (max <= 120) return { label: "Medium", max };
  if (max <= 160) return { label: "Large", max };
  if (max <= 240) return { label: "XL", max };
  if (max <= 380) return { label: "2XL", max };
  if (max <= 480) return { label: "4XL", max };
  if (max <= 490) return { label: "8XL", max };
  return { label: "12XL / 16XL", max };
}
async function scrape(secret: string) {
  const auth = btoa(`service_role:${secret}`);
  const response = await fetch(METRICS_URL, { headers: { authorization: `Basic ${auth}`, accept: "text/plain" } });
  if (!response.ok) throw new Error(`Metrics API returned ${response.status}`);
  return parsePrometheus(await response.text());
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("x-control-collector") ?? "";
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("Runtime configuration missing", { status: 500 });

  const client = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: verified, error: verifyError } = await client.rpc("verify_control_center_platform_collector", { p_token: token });
  if (verifyError || verified !== true) return new Response("Unauthorized", { status: 401 });

  try {
    const first = await scrape(serviceKey);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const second = await scrape(serviceKey);
    const cpuBusy = cpuBusyPercent(first, second);
    const compute = computeSize(second);
    const disk = diskStats(second);
    const row = {
      id: 1,
      cpu_percent: cpuBusy ?? cpuLoadFallback(second),
      ram_percent: ramPercent(second),
      disk_percent: disk.percent,
      disk_total_bytes: disk.total,
      disk_used_bytes: disk.used,
      compute_size: compute.label,
      max_connections: compute.max,
      database_status: "healthy",
      backup_policy: "daily",
      refreshed_at: new Date().toISOString(),
    };
    const { error } = await client.from("control_center_platform_metrics_cache").upsert(row);
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, ...row }), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
});
