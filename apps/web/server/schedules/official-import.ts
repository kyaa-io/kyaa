import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { httpsUrl, officialScheduleImportSchema } from "../../features/schedules/domain/participation";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const eventType = (value: unknown) => value === "Event" || Array.isArray(value) && value.includes("Event");

function privateAddress(address: string) {
  if (address === "::" || address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe8") || address.startsWith("fe9") || address.startsWith("fea") || address.startsWith("feb")) return true;
  const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const value = mapped ?? address;
  if (isIP(value) !== 4) return false;
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168;
}

async function safeUrl(value: string) {
  const url = new URL(httpsUrl.parse(value));
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("FAN_WEB_OFFICIAL_IMPORT_INVALID_SOURCE");
  const direct = isIP(host);
  const addresses = direct ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(item => privateAddress(item.address))) throw new Error("FAN_WEB_OFFICIAL_IMPORT_INVALID_SOURCE");
  return url;
}

async function publicHtml(sourceUrl: string, fetcher: typeof fetch) {
  let url = await safeUrl(sourceUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "ByUs-Schedule-Importer/1.0" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) throw new Error("FAN_WEB_OFFICIAL_IMPORT_FAILED");
      url = await safeUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("FAN_WEB_OFFICIAL_IMPORT_FAILED");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("FAN_WEB_OFFICIAL_IMPORT_FAILED");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("FAN_WEB_OFFICIAL_IMPORT_TOO_LARGE"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("FAN_WEB_OFFICIAL_IMPORT_FAILED");
}

function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...objects(record["@graph"])];
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function locationName(value: unknown) {
  if (typeof value === "string") return text(value, 300);
  if (!value || typeof value !== "object") return undefined;
  const location = value as Record<string, unknown>;
  const name = text(location.name, 300);
  const address = typeof location.address === "string" ? text(location.address, 300)
    : location.address && typeof location.address === "object" ? text((location.address as Record<string, unknown>).streetAddress, 300) : undefined;
  return name ?? address;
}

function eventFromHtml(html: string) {
  const scripts = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const event = objects(JSON.parse(match[1])).find(item => eventType(item["@type"]));
      if (event) return event;
    } catch { /* Ignore unrelated malformed metadata. */ }
  }
  return null;
}

export async function importOfficialSchedule(sourceUrl: string, fetcher: typeof fetch = fetch) {
  const html = await publicHtml(sourceUrl, fetcher);
  const event = eventFromHtml(html);
  if (!event) throw new Error("FAN_WEB_OFFICIAL_IMPORT_NOT_FOUND");
  const start = text(event.startDate, 80), end = text(event.endDate, 80);
  const draft = {
    kind: "event" as const,
    title: text(event.name, 160),
    startsAt: start && Number.isFinite(Date.parse(start)) ? new Date(start).toISOString() : undefined,
    endsAt: end && Number.isFinite(Date.parse(end)) ? new Date(end).toISOString() : undefined,
    timeZone: "UTC",
    location: locationName(event.location),
    participationInstructions: undefined,
    description: text(event.description, 4000),
    officialSourceUrl: sourceUrl,
  };
  if (!draft.title && !draft.startsAt && !draft.location) throw new Error("FAN_WEB_OFFICIAL_IMPORT_NOT_FOUND");
  return officialScheduleImportSchema.partial().parse(draft);
}
