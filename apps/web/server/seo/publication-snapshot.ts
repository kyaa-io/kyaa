import "server-only";
import { createHash } from "node:crypto";
import { buildSitemap } from "@/seo/sitemap";
import { loadPublicationContent, publicationContentByUrl } from "./sitemap-content";

// JSON object insertion order and database row ordering must not create updates.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function loadSearchPublicationSnapshot(): Promise<Record<string, string>> {
  const pages = await loadPublicationContent();
  const content = publicationContentByUrl(pages);
  const publicRows = [...content].sort(([a], [b]) => a.localeCompare(b));
  const publicFingerprint = createHash("sha256").update(stableJson(publicRows)).digest("hex");
  return Object.fromEntries(buildSitemap(pages).map(({ url }) => {
    // Static copy is compiled into many modules: notify once per deployment.
    // Include stable public rows so directories also change after CMS edits/deletes.
    const value = content.get(url) ?? { deployment: process.env.VERCEL_GIT_COMMIT_SHA ?? "local", publicFingerprint };
    return [url, createHash("sha256").update(stableJson(value)).digest("hex")];
  }));
}
