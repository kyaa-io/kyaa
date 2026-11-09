import { ImageResponse } from "next/og";
import { parseAppLocale, type AppLocale } from "@/i18n/locales";
import { copyFor } from "@/features/community-stamps/ui/shared-passport-copy";
import { publicFile } from "@/server/rankings/public-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The only bundled UI face is Pretendard: Latin (with Vietnamese), Cyrillic and Hangul. Japanese, Chinese and Thai lines would draw as boxes, so those
 * languages get the wordmark alone rather than a line in another language. */
const DRAWABLE: ReadonlySet<AppLocale> = new Set(["ko", "en", "es", "id", "vi", "pt", "fr", "ru"]);

/** Link preview of a shared Passport: wordmark and the landing's headline in the link's own language (`?locale=`). */
export async function GET(request: Request) {
  const locale = parseAppLocale(new URL(request.url).searchParams.get("locale") ?? undefined);
  try {
    const [bold, wordmark] = await Promise.all([publicFile("public/fonts/pencil/PretendardUI850.ttf"), publicFile("public/images/guest-home/kyaa-wordmark-transparent.png")]);
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "#ffffff", color: "#171717", fontFamily: "Pretendard" }}>
        <img src={`data:image/png;base64,${Buffer.from(wordmark).toString("base64")}`} alt="kyaa" width={440} height={181} />
        {DRAWABLE.has(locale) && <div style={{ display: "flex", fontSize: 48, fontWeight: 800, marginTop: 28, lineHeight: 1.25 }}>{copyFor(locale).title}</div>}
        <div style={{ display: "flex", fontSize: 26, marginTop: 64, color: "#737373" }}>kyaa.io</div>
      </div>,
      { width: 1200, height: 630, fonts: [{ name: "Pretendard", data: bold, weight: 800 }],
        headers: { "cache-control": "public, max-age=600, s-maxage=600, stale-while-revalidate=600" } },
    );
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
