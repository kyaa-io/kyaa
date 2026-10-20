import { z } from "zod";

// Source: KYAA_WAVE_미션북_1page.pdf, with the organizer’s 2026-10-21 photo-mission revision.
export const WAVE_MISSIONS = [
  { key: "checkin", name: "체크인 완료", description: "체크인하면 KYAA Passport에 도장 1개!" },
  { key: "event-photo", name: "오늘의 한 컷", description: "사진·영상 탭에 사진을 올려요." },
  { key: "fanpage-like", name: "WAVE 팬페이지 좋아요", description: "KYAA WAVE 팬페이지에 좋아요를 눌러요." },
  { key: "introduction", name: "게시판 자기소개", description: "KYAA 게시판에 나를 소개하는 글을 남겨요." },
  { key: "friendship", name: "서로 친구 추가", description: "KYAA에서 서로 친구를 추가해요." },
  { key: "dm-greeting", name: "DM으로 인사하기", description: "KYAA에서 DM을 보내면 도장 1개!" },
  { key: "live-cheer", name: "WAVE LIVE 응원", description: "KYAA WAVE LIVE 중 응원 댓글을 남겨요." },
  { key: "insight-review", name: "나영석 PD님 감사평", description: "나영석 PD님 전용 세션 게시판에 감사평을 남겨요." },
  { key: "quiz-correct", name: "퀴즈 정답 보너스", description: "정답을 맞히면 도장 + 회사·소속 아티스트 PR 1분!" },
  { key: "website-cheer", name: "WAVE 홈 응원", description: "WAVE 팬페이지 홈에서 응원 댓글을 남겨요." },
] as const;

export type WaveMissionKey = (typeof WAVE_MISSIONS)[number]["key"];
export type WaveMissionProgress = { key: WaveMissionKey; status: "completed" | "pending" | "unverified" };

export const waveMissionProgressSchema = z.object({
  progress: z.array(z.object({
    key: z.enum(WAVE_MISSIONS.map(mission => mission.key)),
    status: z.enum(["completed", "pending", "unverified"]),
  }).strict()).length(WAVE_MISSIONS.length),
}).strict().refine(value => new Set(value.progress.map(mission => mission.key)).size === WAVE_MISSIONS.length);
