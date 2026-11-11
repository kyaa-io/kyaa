import type { Instrumentation } from "next";

// 5xx 구조화 로그(docs/operations/api-5xx-logs.md). Node 서버에서만 켠다.
// `=== "nodejs"` 조건 안에서만 import해야 Edge 번들이 node:http·node:fs를 끌어오지 않는다.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installHttp5xxLog } = await import("./server/observability/http-5xx-log");
    installHttp5xxLog();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { recordRequestError } = await import("./server/observability/http-5xx-log");
    recordRequestError(error, context);
  }
};
