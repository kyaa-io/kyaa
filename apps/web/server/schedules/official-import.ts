import "server-only";

import { ImportError, safeRemote } from "../group-collection-import/safe-fetch";
import { officialScheduleImportSchema } from "../../features/schedules/domain/participation";

const MAX_BYTES = 512 * 1024;
const eventType = (value: unknown) => value === "Event" || Array.isArray(value) && value.includes("Event");

async function publicHtml(sourceUrl: string, deps: Parameters<typeof safeRemote>[2]) {
  try {
    const response = await safeRemote(sourceUrl, MAX_BYTES, { ...deps, signal: AbortSignal.timeout(5_000) });
    if (response.headers["content-type"]?.split(";", 1)[0].trim().toLowerCase() !== "text/html") throw new ImportError("INVALID_CONTENT");
    return response.bytes.toString("utf8");
  } catch (error) {
    const suffix = error instanceof ImportError && error.code === "INVALID_URL" ? "INVALID_SOURCE"
      : error instanceof ImportError && error.code === "TOO_LARGE" ? "TOO_LARGE" : "FAILED";
    throw new Error(`FAN_WEB_OFFICIAL_IMPORT_${suffix}`);
  }
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

export async function importOfficialSchedule(sourceUrl: string, deps: Parameters<typeof safeRemote>[2] = {}) {
  const html = await publicHtml(sourceUrl, deps);
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
