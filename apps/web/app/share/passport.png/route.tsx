import { ImageResponse } from "next/og";
import { parseAppLocale } from "@/i18n/locales";
import { copyFor } from "@/features/community-stamps/ui/shared-passport-copy";
import { publicFile } from "@/server/rankings/public-file";
import { PRETENDARD_BOLD, TITLE_IMAGES, titleFontFile } from "./title-font";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=600, s-maxage=600, stale-while-revalidate=600";

/** Link preview of a shared Passport: wordmark and the landing's headline in the link's own language (`?locale=`). If the headline's font cannot be
 * read, the picture is the wordmark alone and is not cached, so the next request tries again. */
export async function GET(request: Request) {
  const locale = parseAppLocale(new URL(request.url).searchParams.get("locale") ?? undefined);
  try {
    const titleFile = titleFontFile(locale), titleImage = TITLE_IMAGES[locale];
    const [bold, wordmark, title, picture] = await Promise.all([
      publicFile(PRETENDARD_BOLD), publicFile("public/images/guest-home/kyaa-wordmark-transparent.png"),
      titleImage || titleFile === PRETENDARD_BOLD ? null : publicFile(titleFile).catch(() => null),
      titleImage ? publicFile(titleImage.file).catch(() => null) : null,
    ]);
    const headline = titleImage ? picture && titleImage.text : titleFile === PRETENDARD_BOLD || title ? copyFor(locale).title : null;
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "#ffffff", color: "#171717", fontFamily: "Pretendard" }}>
        <img src={`data:image/png;base64,${Buffer.from(wordmark).toString("base64")}`} alt="kyaa" width={440} height={181} />
        {titleImage && picture && <img src={`data:image/png;base64,${Buffer.from(picture).toString("base64")}`} alt="" width={titleImage.width} height={titleImage.height} style={{ marginTop: 28 }} />}
        {headline && !titleImage && <div style={{ display: "flex", fontSize: 48, fontWeight: 800, marginTop: 28, lineHeight: 1.25, fontFamily: title ? "Headline" : "Pretendard" }}>{headline}</div>}
        <div style={{ display: "flex", fontSize: 26, marginTop: 64, color: "#737373" }}>kyaa.io</div>
      </div>,
      { width: 1200, height: 630, fonts: [{ name: "Pretendard", data: bold, weight: 800 }, ...(title ? [{ name: "Headline", data: title, weight: 800 as const }] : [])],
        headers: { "cache-control": headline ? CACHE : "no-store" } },
    );
  } catch {
    return new Response(null, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
