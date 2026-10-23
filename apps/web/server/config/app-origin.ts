import "server-only";
import { isAwsHosting } from "./hosting";

const PRODUCTION_APP_ORIGINS = new Set([
  "https://byus.kr",
  "https://www.byus.kr",
  "https://kyaa.io",
  "https://www.kyaa.io",
]);
const PRODUCTION_ORIGIN_TAGS = new Map([
  ["https://byus.kr", "b"],
  ["https://www.byus.kr", "bw"],
  ["https://kyaa.io", "k"],
  ["https://www.kyaa.io", "kw"],
]);

export function appOriginForRequest(request: Request, configuredOrigin: string): string {
  let requestOrigin = new URL(request.url).origin;
  if (isAwsHosting() && request.headers.get("x-forwarded-proto") === "https") {
    const host = request.headers.get("x-forwarded-host");
    if (host) {
      const viewer = new URL(`https://${host}`);
      if (viewer.host !== host || viewer.username || viewer.password || viewer.pathname !== "/" || viewer.search || viewer.hash) throw new Error("Untrusted forwarded app origin");
      requestOrigin = viewer.origin;
    }
  }
  const trusted = PRODUCTION_APP_ORIGINS.has(configuredOrigin)
    ? PRODUCTION_APP_ORIGINS.has(requestOrigin)
    : requestOrigin === configuredOrigin;
  if (!trusted) throw new Error("Untrusted app origin");
  return requestOrigin;
}

export function requireSameAppOrigin(request: Request, configuredOrigin: string): string {
  const requestOrigin = appOriginForRequest(request, configuredOrigin);
  if (request.headers.get("origin") !== requestOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new Error("Invalid request origin");
  }
  return requestOrigin;
}

export function bindAppOrigin(value: string, origin: string): string {
  const tag = PRODUCTION_ORIGIN_TAGS.get(origin);
  return tag ? `${tag}.${value}` : value;
}

export function readAppOriginBinding(value: string, origin: string): string {
  const separator = value.indexOf(".");
  if (separator < 0) return value; // Legacy in-flight state.
  const expected = PRODUCTION_ORIGIN_TAGS.get(origin);
  if (!expected || value.slice(0, separator) !== expected) throw new Error("App origin state mismatch");
  return value.slice(separator + 1);
}
