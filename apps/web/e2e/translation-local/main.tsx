import { createRoot } from "react-dom/client";
import { PostCard } from "@/features/fan-posts/ui/post-card";
import type { FanPost } from "@/features/fan-posts/domain/content";
import { FanLanguageSwitch } from "@/components/fan-shell/fan-language-switch";
import { NoticeBody } from "@/components/notice/notice-body";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { parseAppLocale } from "@/i18n/locales";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";

const locale = parseAppLocale(new URLSearchParams(location.search).get("locale"));
document.documentElement.lang = locale;
const bodies = ["엘리나 유튜브 재개!!", "We are so excited to see everyone at the concert tonight!", "🎉❤️ 123!!"];
const base: FanPost = { id: "10000000-0000-4000-8000-000000000001", celebritySlug: "elina", body: "", visibility: "public", revision: 1,
  author: { nickname: "ElinaFan", avatarUrl: "/images/avatars/star-cream.webp" }, assets: [], createdAt: "2026-10-03T04:21:00Z", updatedAt: "2026-10-03T04:21:00Z",
  isOwner: false, likeCount: 12, liked: false, commentCount: 3 };
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 700, margin: "0 auto", padding: "24px 20px", fontFamily: "Pretendard, sans-serif" }}>
  <FanLanguageSwitch locale={locale} href="/" />
  <h1 style={{ fontSize: 24 }}>{contentCopy(locale).community}</h1>
  {bodies.map((body, index) => <PostCard key={index} post={{ ...base, body, id: `10000000-0000-4000-8000-00000000000${index + 1}`,
    assets: index < 2 ? [{ id: `20000000-0000-4000-8000-00000000000${index + 1}`, width: 800, height: 600 }] : [] }} locale={locale} onChanged={() => {}} />)}
  <section id="external" style={{ marginTop: 32 }}><h2>Instagram</h2><TranslatedText text="공연 소식을 여러분과 나눕니다." locale={locale} as="div" /></section>
  <section id="rich" style={{ marginTop: 32 }}><h2>{contentCopy(locale).notice}</h2><NoticeBody locale={locale} document={{ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "공연 소식을 여러분과 나눕니다.", marks: [{ type: "bold" }] }] },
    { type: "paragraph", content: [{ type: "text", text: "공식 안내를 확인하세요.", marks: [{ type: "link", attrs: { href: "https://example.com/news" } }] }] },
    { type: "image", attrs: { src: "/images/guest-home/elina-card.jpg", alt: "Elina" } },
  ] }} /></section>
</main>);
