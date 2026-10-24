import { createRoot } from "react-dom/client";
import { PostCard } from "@/features/fan-posts/ui/post-card";
import type { FanPost } from "@/features/fan-posts/domain/content";
import { parseAppLocale } from "@/i18n/locales";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";

const locale = parseAppLocale(new URLSearchParams(location.search).get("locale"));
document.documentElement.lang = locale;
const bodies = ["오늘 공연의 순간을 오래 기억하고 싶어요.", "We are so excited to see everyone at the concert tonight!", "함께해서 더 즐거웠던 하루", "🎉❤️ 123!!"];
const base: FanPost = { id: "10000000-0000-4000-8000-000000000001", celebritySlug: "elina", body: "", visibility: "public", revision: 1,
  author: { nickname: "music.fan", avatarUrl: "/images/avatars/star-cream.webp" }, assets: [], createdAt: "2026-10-03T04:21:00Z", updatedAt: "2026-10-03T04:21:00Z",
  isOwner: true, likeCount: 12, liked: false, commentCount: 3 };
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 700, margin: "0 auto", padding: "24px 20px", fontFamily: "Pretendard, sans-serif" }}>
  <h1 style={{ fontSize: 24 }}>{locale === "ko" ? "팬게시판" : "Fan posts"}</h1>
  {bodies.map((body, index) => <PostCard key={index} post={{ ...base, body, id: `10000000-0000-4000-8000-00000000000${index + 1}`,
    author: { ...base.author, nickname: index === 1 ? "긴이름도빠짐없이보여주는MusicFanWithALongName" : base.author.nickname }, visibility: index === 1 ? "members" : "public", isOwner: index !== 1 && new URLSearchParams(location.search).get("auth") !== "off", assets: index < 3 ? [{ id: `20000000-0000-4000-8000-00000000000${index + 1}`, width: [3826, 5304, 1080][index], height: [2435, 7952, 1080][index] }] : [] }} locale={locale} onChanged={() => {}} />)}
</main>);
