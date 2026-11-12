import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

// 5xx 응답마다 JSON 한 줄을 남겨 ALB 5xx 경보 때 어느 경로가 실패했는지 CloudWatch Logs Insights로 찾게 한다.
// 라우트 621개에 래퍼를 달지 않고, 서버 한 곳(instrumentation.ts)에서 두 경로를 함께 잡는다.
//  - 명시 5xx 응답: http.Server의 'request' 처리에 응답 완료(finish) 훅을 건다.
//  - 던져진 오류: Next의 onRequestError가 같은 요청 맥락(AsyncLocalStorage)에 오류 이름·코드를 적어 두고, 위 훅이 한 줄로 합친다.
// 회원 식별자·쿼리·본문·토큰이 섞이지 않도록 실제 경로 대신 라우트 템플릿(/api/x/[id])만 쓰고, 오류 메시지는 남기지 않는다.

export const API_5XX_EVENT = "http_5xx";
export const API_SLOW_EVENT = "http_slow";
export const UNMATCHED_ROUTE = "(unmatched)";
/** 이 시간(ms) 이상 걸린 5xx 아닌 응답을 `http_slow` 한 줄로 남긴다. 평소 p95 0.74초의 느린 요청이 어느 경로인지 찾는 용도. */
export const SLOW_REQUEST_MS = 500;

type RouteMatcher = { page: string; regex: RegExp };
type RequestErrorInfo = { name: string; code: string | null; digest: string | null; routePath: string | null };
type RequestState = { error?: RequestErrorInfo };

export type Http5xxLogLine = {
  event: typeof API_5XX_EVENT;
  route: string;
  method: string;
  status: number;
  source: "thrown" | "response";
  errorName: string | null;
  errorCode: string | null;
  digest: string | null;
  requestId: string | null;
};

export type HttpSlowLogLine = {
  event: typeof API_SLOW_EVENT;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  /** RSC(화면 이동·prefetch) 요청인지. 값은 `_rsc` 쿼리나 `rsc` 헤더의 존재만 보고, 내용은 남기지 않는다. */
  rsc: boolean;
  requestId: string | null;
};

const requestState = new AsyncLocalStorage<RequestState>();
const INSTALLED = Symbol.for("kyaa.http5xxLog.installed");
const SAFE_TOKEN = /^[A-Za-z0-9_.$-]{1,64}$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9=;:._-]{1,200}$/;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

function safeToken(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && SAFE_TOKEN.test(value) ? value : null;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** ALB가 붙이는 X-Amzn-Trace-Id를 우선 쓴다. ALB 접근 로그의 trace_id와 바로 맞춰 볼 수 있다. */
export function requestIdFrom(headers: Record<string, string | string[] | undefined>): string | null {
  for (const name of ["x-amzn-trace-id", "x-request-id"]) {
    const value = headerValue(headers[name]);
    if (value && SAFE_REQUEST_ID.test(value)) return value;
  }
  return null;
}

/** standalone 서버는 apps/web으로 chdir하므로 .next/routes-manifest.json에 App Router 경로의 정규식이 있다. */
export function loadRouteMatchers(manifestPath = path.join(process.cwd(), ".next", "routes-manifest.json")): RouteMatcher[] {
  let manifest: { staticRoutes?: { page: string; regex: string }[]; dynamicRoutes?: { page: string; regex: string }[] };
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
  // 정적 경로를 먼저 본다. 동적 경로는 Next가 구체적인 것부터 정렬해 둔 순서를 그대로 쓴다.
  return [...(manifest.staticRoutes ?? []), ...(manifest.dynamicRoutes ?? [])].map((route) => ({
    page: route.page,
    regex: new RegExp(route.regex),
  }));
}

export function resolveRouteTemplate(url: string | undefined, matchers: readonly RouteMatcher[]): string {
  const pathname = (url ?? "").split(/[?#]/, 1)[0] || "/";
  return matchers.find((matcher) => matcher.regex.test(pathname))?.page ?? UNMATCHED_ROUTE;
}

export function describeError(error: unknown): Pick<RequestErrorInfo, "name" | "code" | "digest"> {
  if (typeof error !== "object" || error === null) return { name: "NonError", code: null, digest: null };
  const candidate = error as { name?: unknown; code?: unknown; digest?: unknown };
  return {
    name: safeToken(candidate.name) ?? "UnknownError",
    code: safeToken(candidate.code),
    digest: safeToken(candidate.digest),
  };
}

export function buildHttp5xxLogLine(input: {
  url: string | undefined;
  method: string | undefined;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  error: RequestErrorInfo | undefined;
  matchers: readonly RouteMatcher[];
}): Http5xxLogLine {
  const method = (input.method ?? "").toUpperCase();
  return {
    event: API_5XX_EVENT,
    route: input.error?.routePath ?? resolveRouteTemplate(input.url, input.matchers),
    method: METHODS.has(method) ? method : "OTHER",
    status: input.status,
    source: input.error ? "thrown" : "response",
    errorName: input.error?.name ?? null,
    errorCode: input.error?.code ?? null,
    digest: input.error?.digest ?? null,
    requestId: requestIdFrom(input.headers),
  };
}

/** 경로 템플릿·메서드·상태·소요 ms·RSC 여부·요청 ID만 담는다. 쿼리·식별자·헤더·토큰은 넣지 않는다. */
export function buildHttpSlowLogLine(input: {
  url: string | undefined;
  method: string | undefined;
  status: number;
  durationMs: number;
  headers: Record<string, string | string[] | undefined>;
  matchers: readonly RouteMatcher[];
}): HttpSlowLogLine {
  const method = (input.method ?? "").toUpperCase();
  const query = (input.url ?? "").split("#", 1)[0]!.split("?", 2)[1] ?? "";
  return {
    event: API_SLOW_EVENT,
    route: resolveRouteTemplate(input.url, input.matchers),
    method: METHODS.has(method) ? method : "OTHER",
    status: input.status,
    durationMs: Math.round(input.durationMs),
    rsc: headerValue(input.headers.rsc) === "1" || new URLSearchParams(query).has("_rsc"),
    requestId: requestIdFrom(input.headers),
  };
}

/** instrumentation.onRequestError에서 부른다. 응답 훅이 같은 요청의 5xx 줄에 오류 정보를 합친다. */
export function recordRequestError(error: unknown, context: { routePath?: string }): void {
  const state = requestState.getStore();
  if (!state) return;
  state.error = { ...describeError(error), routePath: context.routePath || null };
}

type Emit = (this: http.Server, event: string | symbol, ...args: unknown[]) => boolean;

export function installHttp5xxLog(options: {
  matchers?: readonly RouteMatcher[];
  write?: (line: string) => void;
  slowMs?: number;
} = {}): void {
  const proto = http.Server.prototype as unknown as { emit: Emit; [INSTALLED]?: boolean };
  // dev 서버는 instrumentation을 다시 읽을 수 있다. 한 번만 감싼다.
  if (proto[INSTALLED]) return;
  proto[INSTALLED] = true;

  const matchers = options.matchers ?? loadRouteMatchers();
  const write = options.write ?? ((line: string) => console.error(line));
  const slowMs = options.slowMs ?? SLOW_REQUEST_MS;
  const originalEmit = proto.emit;

  proto.emit = function emit(this: http.Server, event: string | symbol, ...args: unknown[]): boolean {
    if (event !== "request") return originalEmit.call(this, event, ...args);
    const [req, res] = args as [IncomingMessage, ServerResponse];
    const state: RequestState = {};
    const startedAt = performance.now();
    res.once("finish", () => {
      if (res.statusCode < 500) {
        const durationMs = performance.now() - startedAt;
        if (durationMs >= slowMs) {
          write(JSON.stringify(buildHttpSlowLogLine({
            url: req.url,
            method: req.method,
            status: res.statusCode,
            durationMs,
            headers: req.headers,
            matchers,
          })));
        }
        return;
      }
      write(JSON.stringify(buildHttp5xxLogLine({
        url: req.url,
        method: req.method,
        status: res.statusCode,
        headers: req.headers,
        error: state.error,
        matchers,
      })));
    });
    return requestState.run(state, () => originalEmit.call(this, event, ...args));
  };
}

/** 시험 전용: 감싼 emit을 되돌린다. */
export function uninstallHttp5xxLogForTest(originalEmit: Emit): void {
  const proto = http.Server.prototype as unknown as { emit: Emit; [INSTALLED]?: boolean };
  proto.emit = originalEmit;
  delete proto[INSTALLED];
}
