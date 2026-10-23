import "server-only";
import { isAwsHosting } from "../config/hosting";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";

export async function readExternalVideoThumbnail(href: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const instagram = isRecordedReplayUrl("instagram", href);
  if (!instagram && !isRecordedReplayUrl("tiktok", href)) return null;
  const url = new URL(href);
  if (url.search) return null;
  const endpoint = instagram ? `https://www.instagram.com${url.pathname.replace(/\/$/, "")}/embed/` : `https://www.tiktok.com/oembed?url=${encodeURIComponent(href)}`;
  try {
    const response = await fetcher(endpoint, { redirect: "error", signal: AbortSignal.timeout(4000), ...(isAwsHosting() ? { cache: "no-store" as const } : { cache: "force-cache" as const, next: { revalidate: 3600 } }) });
    if (!response.ok || Number(response.headers.get("content-length")) > 512_000 || !response.body) return null;
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let html = "", bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512_000) return null;
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    // shortcut: Instagram's public embed markup is provider-owned; update this parser if that markup changes.
    const tag = html.match(/<img\b[^>]*\bclass=["'][^"']*\bEmbeddedMediaImage\b[^"']*["'][^>]*>/i)?.[0];
    const src = instagram ? tag?.match(/\bsrc=["']([^"']+)["']/i)?.[1].replaceAll("&amp;", "&") : JSON.parse(html)?.thumbnail_url;
    if (typeof src !== "string" || !src) return null;
    const image = new URL(src);
    const hosts = instagram ? [".cdninstagram.com", ".fbcdn.net"] : [".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com", ".tiktok.com", ".ibytedtos.com", ".byteoversea.com"];
    return image.protocol === "https:" && !image.username && !image.password && !image.port &&
      hosts.some(host => image.hostname.endsWith(host)) ? image.href : null;
  } catch { return null; }
}
