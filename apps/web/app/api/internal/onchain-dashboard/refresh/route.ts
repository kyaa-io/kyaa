import { cronOwnerResponse } from "@/server/cron/owner";
import { timingSafeEqual } from "node:crypto";
import { refreshDashboardSnapshot } from "@/server/onchain/dashboard-snapshot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 570;
const headers = { "cache-control": "no-store, no-transform" } as const;

export async function GET(request: Request) {
  const ownership = cronOwnerResponse(request);
  if (ownership) return ownership;
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401, headers });
  }
  // Old cron clients stop at HTTP headers; require a client that waits for the final JSON.
  if (request.headers.get("x-byus-onchain-stream") !== "1") {
    return Response.json({ error: { code: "ONCHAIN_STREAM_CLIENT_REQUIRED" } }, { status: 409, headers });
  }
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal]);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(stream) {
      stream.enqueue(encoder.encode(" "));
      heartbeat = setInterval(() => { if (!signal.aborted) stream.enqueue(encoder.encode("\n")); }, 10_000);
      void (async () => {
        try {
          const result = await refreshDashboardSnapshot(undefined, signal);
          if (!signal.aborted) stream.enqueue(encoder.encode(JSON.stringify(result)));
        } catch {
          if (!signal.aborted) stream.enqueue(encoder.encode(JSON.stringify({ error: { code: "ONCHAIN_DASHBOARD_UNAVAILABLE" } })));
        } finally {
          clearInterval(heartbeat);
          if (!cancelled) stream.close();
          controller.abort();
        }
      })();
    },
    cancel() { cancelled = true; clearInterval(heartbeat); controller.abort(); },
  });
  return new Response(body, { headers: { ...headers, "content-type": "application/json", "content-encoding": "identity" } });
}
