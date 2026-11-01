import "server-only";
import { isAwsHosting } from "../config/hosting";
import { logHomeQuery, type HomeQueryMetric } from "./performance-logger";

export async function measureHomeQuery<T>(label: HomeQueryMetric["name"], query: () => Promise<T>): Promise<T> {
  if (!isAwsHosting()) return query();
  const started = performance.now();
  let outcome: HomeQueryMetric["outcome"] = "error";
  try {
    const result = await query();
    outcome = "success";
    return result;
  } finally {
    try { logHomeQuery({ name: label, durationMs: performance.now() - started, outcome }); }
    catch { /* A broken logger must not change query success or failure. */ }
  }
}
