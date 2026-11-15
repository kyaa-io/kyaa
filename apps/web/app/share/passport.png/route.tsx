import { ImageResponse } from "next/og";
import { parseAppLocale } from "@/i18n/locales";
import { copyFor } from "@/features/community-stamps/ui/shared-passport-copy";
import { publicFile } from "@/server/rankings/public-file";
import { PRETENDARD_BOLD, TITLE_IMAGES, titleFontFile } from "./title-font";
import { cardDate, machineLine } from "./passport-card";
import type { AppLocale } from "@/i18n/locales";
import { levelLabel } from "@/features/passport/domain/passport-read-model";
import type { SharedPassportActivity } from "@/features/community-stamps/domain/community-stamps";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { readSharedPassportActivity } from "@/server/community-stamps/shared-passport";
import { loadSeoCreator } from "@/server/seo/public-content";
import { creatorPhotoDataUri } from "@/server/rankings/creator-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=600, s-maxage=600, stale-while-revalidate=600";

const WORDMARK = "public/images/guest-home/kyaa-wordmark-transparent.png";
const png = (bytes: ArrayBuffer) => `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

const INK = "#171717", MUTED = "#737373", LINE = "#e5e5e5", ACCENT_INK = "#ad1457", ACCENT_SOFT = "#fff0f6";

/**
 * Link preview of one shared Passport (1200×630), drawn like a passport's data page: the creator's photo on the left with the kyaa seal on its corner,
 * then "Fan Passport", the creator's name, issue date and tier, and the machine-readable line. White page, one accent. Labels are Korean for Korean
 * links and English for every other language, so Pretendard draws all of them. Satori takes inline styles only.
 */
function PassportCard({ locale, creator, activity, photo, seal, wordmark }: {
  locale: AppLocale; creator: { slug: string; name: string; position?: string }; activity: Pick<SharedPassportActivity, "issuedAt" | "tier">;
  photo: string | null; seal: string; wordmark: string;
}) {
  const ko = locale === "ko", labelLocale = ko ? "ko" : "en";
  // Hangul and other wide letters take about twice a Latin letter: the name's size follows its drawn width, and a word is never cut in the middle.
  const nameWidth = [...creator.name].reduce((sum, letter) => sum + (letter.charCodeAt(0) < 0x2e80 ? 1 : 1.8), 0);
  const nameSize = nameWidth <= 9 ? 112 : nameWidth <= 13 ? 80 : 56;
  const field = (label: string, value: string) => <div style={{ display: "flex", flexDirection: "column", marginRight: 72 }}>
    <div style={{ display: "flex", fontSize: 24, color: MUTED }}>{label}</div>
    <div style={{ display: "flex", fontSize: 40, marginTop: 6 }}>{value}</div>
  </div>;
  return <div style={{ width: "100%", height: "100%", display: "flex", padding: 56, background: "#ffffff", color: INK, fontFamily: "Pretendard", fontWeight: 600 }}>
    <div style={{ display: "flex", position: "relative", width: 420, height: 518 }}>
      {photo
        ? <img src={photo} alt="" width={420} height={518} style={{ borderRadius: 28, objectFit: "cover", objectPosition: creator.position ?? "center" }} />
        : <div style={{ display: "flex", width: 420, height: 518, borderRadius: 28, background: ACCENT_SOFT, alignItems: "center", justifyContent: "center", fontSize: 160, color: ACCENT_INK }}>{creator.name.slice(0, 1)}</div>}
      {/* The seal's own picture is transparent inside the ring: a white disc under it keeps the gold readable on any photo. */}
      <div style={{ display: "flex", position: "absolute", right: -64, bottom: -20, width: 176, height: 176, transform: "rotate(-12deg)" }}>
        <div style={{ display: "flex", position: "absolute", left: 18, top: 18, width: 140, height: 140, borderRadius: 70, background: "#ffffff" }} />
        <img src={seal} alt="" width={176} height={176} />
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 96 }}>
      <img src={wordmark} alt="kyaa" width={97} height={47} />
      <div style={{ display: "flex", fontSize: 32, color: ACCENT_INK, marginTop: 52 }}>Fan Passport</div>
      <div style={{ display: "flex", fontSize: nameSize, lineHeight: 1.1, marginTop: 8, letterSpacing: "-0.02em", wordBreak: "keep-all" }}>{creator.name}</div>
      <div style={{ display: "flex", marginTop: "auto" }}>
        {field(ko ? "발급일" : "Issued", cardDate(activity.issuedAt))}
        {field(ko ? "등급" : "Tier", levelLabel(labelLocale, activity.tier))}
      </div>
      <div style={{ display: "flex", marginTop: 28, paddingTop: 20, borderTop: `1px solid ${LINE}`, fontSize: 20, letterSpacing: "0.12em", color: MUTED }}>{machineLine(creator.slug)}</div>
    </div>
  </div>;
}

/** The card of one shared Passport (`?token=`): what the share landing itself shows to anyone with the link. An unknown or revoked link: null. */
async function passportCard(token: string, locale: AppLocale) {
  const activity = await readSharedPassportActivity(token, createFanpageDependencies());
  const creator = activity && await loadSeoCreator(activity.creator, locale);
  if (!activity || !creator) return null;
  const [regular, wordmark, seal, photo] = await Promise.all([
    publicFile("public/fonts/pencil/PretendardUI650.ttf"), publicFile(WORDMARK),
    publicFile("public/images/passport/kyaa-seal.png"), creatorPhotoDataUri(creator.image.url),
  ]);
  return new ImageResponse(
    <PassportCard locale={locale} activity={activity} photo={photo} seal={png(seal)} wordmark={png(wordmark)}
      creator={{ slug: creator.slug, name: creator.name, position: creator.image.position }} />,
    { width: 1200, height: 630, fonts: [{ name: "Pretendard", data: regular, weight: 600 }], headers: { "cache-control": CACHE } },
  );
}

/** Link preview of a shared Passport. With the link's `?token=`: that Passport's card (creator photo, name, issue date, tier). Without one, or for a
 * link that no longer resolves: wordmark and the landing's headline in the link's own language (`?locale=`). If the headline's font cannot be
 * read, the picture is the wordmark alone and is not cached, so the next request tries again. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const locale = parseAppLocale(query.get("locale") ?? undefined), token = query.get("token");
  try {
    const card = token ? await passportCard(token, locale) : null;
    if (card) return card;
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
