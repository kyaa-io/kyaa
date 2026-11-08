import { ImageResponse } from "next/og";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { loadSeoCreator } from "@/server/seo/public-content";
import { readSharedJjinfanChallenge } from "@/server/rankings/jjinfan-share";
import { publicFile } from "@/server/rankings/public-file";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { rankingsText } from "@/features/rankings/ui/rankings-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WORDMARK = "public/images/guest-home/kyaa-wordmark-transparent.png";
/** The creator photo as a data URI for Satori (PNG and JPEG only). A stored path is read from public/ like the fonts; a stored absolute URL is the
 * public asset host. The request's Host is never used. Anything else, or a failed read: null, and the card draws the initial instead. */
async function photo(src: string | undefined) {
  if (!src) return null;
  try {
    if (src.startsWith("/") && !src.startsWith("//")) {
      const type = /\.png$/i.test(src) ? "image/png" : /\.jpe?g$/i.test(src) ? "image/jpeg" : null;
      if (!type || src.includes("..")) return null;
      return `data:${type};base64,${base64(await publicFile(`public${src}` as `public/${string}`))}`;
    }
    const res = await fetch(src, { signal: AbortSignal.timeout(3000) });
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!res.ok || !["image/png", "image/jpeg"].includes(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch { return null; }
}

const base64 = (bytes: ArrayBuffer) => Buffer.from(bytes).toString("base64");

/**
 * Link preview for a shared 찐팬 100 gauge (feedback C7, design 5.4): wordmark, the creator's photo, "찐팬 100 챌린지", the name, the live count and bar.
 * White, no characters or decoration. Off, ended or unknown: 404. Satori takes inline styles only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const locale = parseAppLocale(url.searchParams.get("locale") ?? undefined);
  try {
    const challenge = await readSharedJjinfanChallenge(slug);
    if (!challenge) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=60" } });
    const creator = await loadSeoCreator(slug, toContentLocale(locale));
    const name = creator?.name ?? slug;
    const [regular, bold, wordmark, picture] = await Promise.all([
      publicFile("public/fonts/pencil/PretendardUI650.ttf"), publicFile("public/fonts/pencil/PretendardUI850.ttf"),
      publicFile(WORDMARK), photo(creator?.image.url),
    ]);
    const shown = Math.min(challenge.count, challenge.target), percent = Math.round((shown / challenge.target) * 100);
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 80px 48px", background: "#ffffff", color: "#171717", fontFamily: "Pretendard" }}>
        <img src={`data:image/png;base64,${base64(wordmark)}`} alt="kyaa" width={97} height={40} />
        <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
          {picture
            ? <img src={picture} alt="" width={240} height={240} style={{ borderRadius: 120, objectFit: "cover" }} />
            : <div style={{ display: "flex", width: 240, height: 240, borderRadius: 120, background: "#f2f2f2", alignItems: "center", justifyContent: "center", fontSize: 96, fontWeight: 800, color: "#5d5d5d" }}>{name.slice(0, 1)}</div>}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 48, flex: 1 }}>
            <div style={{ display: "flex", fontSize: 36, color: "#737373" }}>{rankingsText(locale, "jjTitle")}</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 800, marginTop: 8, lineHeight: 1.15 }}>{name}</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, marginTop: 16, justifyContent: "flex-end" }}>{dukjilText(locale, "gaugeCount", [shown.toLocaleString(locale), challenge.target.toLocaleString(locale)])}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
        <div style={{ display: "flex", width: "100%", height: 32, borderRadius: 16, background: "#ededed" }}>
          <div style={{ display: "flex", width: `${Math.max(percent, 3)}%`, height: 32, borderRadius: 16, background: "#d11b62" }} />
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#737373", marginTop: 20 }}>{`kyaa.io/${slug}`}</div>
        </div>
      </div>,
      { width: 1200, height: 630, fonts: [{ name: "Pretendard", data: regular, weight: 600 }, { name: "Pretendard", data: bold, weight: 800 }],
        headers: { "cache-control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600" } },
    );
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
