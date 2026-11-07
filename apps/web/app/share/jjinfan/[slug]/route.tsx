import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { loadSeoCreator } from "@/server/seo/public-content";
import { readSharedJjinfanChallenge } from "@/server/rankings/jjinfan-share";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One copy per process. The file sits in public/ for the web fonts; where a build leaves public/ out of the server bundle, the same file is read over HTTP.
const fonts = new Map<string, Promise<ArrayBuffer>>();
function font(name: string, origin: string) {
  let hit = fonts.get(name);
  if (!hit) {
    hit = readFile(join(process.cwd(), "public/fonts/pencil", name)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
      .catch(async () => {
        const res = await fetch(new URL(`/fonts/pencil/${name}`, origin));
        if (!res.ok) throw new Error("FONT_UNAVAILABLE");
        return res.arrayBuffer();
      });
    hit.catch(() => fonts.delete(name));
    fonts.set(name, hit);
  }
  return hit;
}

/** Link preview for a shared 찐팬 100 gauge (feedback C7): creator name, the administrator's title and the live count. Off or unknown: 404. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const locale = parseAppLocale(url.searchParams.get("locale") ?? undefined);
  try {
    const challenge = await readSharedJjinfanChallenge(slug);
    if (!challenge) return new Response(null, { status: 404, headers: { "cache-control": "public, max-age=60" } });
    const creator = await loadSeoCreator(slug, toContentLocale(locale));
    const [regular, bold] = await Promise.all([font("PretendardUI650.ttf", url.origin), font("PretendardUI850.ttf", url.origin)]);
    const shown = Math.min(challenge.count, challenge.target), percent = Math.round((shown / challenge.target) * 100);
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", background: "#ffffff", color: "#171717", fontFamily: "Pretendard" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 36, color: "#737373" }}>{creator?.name ?? slug}</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, marginTop: 16, lineHeight: 1.2 }}>{challenge.campaign.title}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 32, color: "#525252" }}>{dukjilText(locale, "roomJjinfan")}</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800 }}>{dukjilText(locale, "gaugeCount", [shown.toLocaleString(locale), challenge.target.toLocaleString(locale)])}</div>
          </div>
          <div style={{ display: "flex", width: "100%", height: 28, borderRadius: 14, background: "#ededed", marginTop: 20 }}>
            <div style={{ display: "flex", width: `${Math.max(percent, 2)}%`, height: 28, borderRadius: 14, background: "#d11b62" }} />
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#737373", marginTop: 36 }}>kyaa.io</div>
        </div>
      </div>,
      { width: 1200, height: 630, fonts: [{ name: "Pretendard", data: regular, weight: 600 }, { name: "Pretendard", data: bold, weight: 800 }],
        headers: { "cache-control": "public, max-age=300, stale-while-revalidate=600" } },
    );
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
