import { z } from "zod";

/** B8 1단계: 페이지 운영자(owner·manager) 전용 회원 목록. 계정 실명·전화·이메일·가입 답변은 키 자체가 없다(.strict()). */
export const groupOperatorMemberSchema = z.object({
  profileId: z.uuid(),
  nickname: z.string(),
  avatarUrl: z.string().nullable(),
  role: z.enum(["owner", "manager", "member"]),
  joinedAt: z.string(),
  jjinfan: z.boolean().nullable(),
  hearts: z.number().int().nonnegative().nullable(),
  missionCount: z.number().int().nonnegative(),
  lastActiveAt: z.string().nullable(),
}).strict();
export const groupOperatorMembersSchema = z.object({
  total: z.number().int().nonnegative(),
  jjinfanTotal: z.number().int().nonnegative().nullable(),
  items: z.array(groupOperatorMemberSchema),
  nextCursor: z.uuid().nullable(),
}).strict();
export type GroupOperatorMembers = z.infer<typeof groupOperatorMembersSchema>;
export type GroupOperatorMember = z.infer<typeof groupOperatorMemberSchema>;

/** CSV 한 번 분량. 팬페이지면 찐팬·하트 열이 있고(fan=true), 모임 페이지면 없다. */
export const groupOperatorMembersExportSchema = z.object({
  fan: z.boolean(),
  rowCount: z.number().int().nonnegative(),
  items: z.array(groupOperatorMemberSchema),
}).strict();

export const groupOperatorJjinfanFilter = z.enum(["all", "yes", "no"]);
/** 닉네임 최대 길이(16) 안의 검색어, 제어문자 없음. 빈 값은 전체. */
export const groupOperatorSearch = z.string().trim().max(16).refine(value => !/[\u0000-\u001f\u007f]/.test(value));

export const groupMissionStatsSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  /** 팬페이지에만: 기간 안에 출석한 페이지 회원 수. 모임 페이지는 null. */
  attendance: z.object({ participants: z.number().int().nonnegative() }).strict().nullable(),
  items: z.array(z.object({
    missionId: z.uuid(),
    title: z.string(),
    state: z.enum(["published", "closed"]),
    submissionKind: z.enum(["text", "photo", "survey"]),
    participants: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }).strict()),
}).strict();
export type GroupMissionStats = z.infer<typeof groupMissionStatsSchema>;

/** 공지 회원 전체 알림의 오늘 남은 횟수. 발송이 꺼져 있으면 enabled=false. owner·manager에게만 응답한다. */
export const groupNoticeBroadcastStatusSchema = z.object({
  noticeBroadcastEnabled: z.boolean(),
  noticeBroadcastRemainingToday: z.union([z.literal(0), z.literal(1)]),
}).strict();
export type GroupNoticeBroadcastStatus = z.infer<typeof groupNoticeBroadcastStatusSchema>;

const KST = 9 * 60 * 60 * 1000;
const kstDate = (value: string) => new Date(new Date(value).getTime() + KST).toISOString().slice(0, 10);
/** 스프레드시트가 식으로 읽는 첫 글자(= + - @ 탭 CR)는 앞에 '를 붙이고, 쉼표·따옴표·줄바꿈은 RFC 4180으로 감싼다. */
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
/** 회원 CSV. 화면 표와 같은 열: 팬페이지 5열, 모임 페이지 4열. UTF-8 BOM, KST 날짜. */
export function groupMembersCsv(data: z.infer<typeof groupOperatorMembersExportSchema>, header: { nickname: string; joinedAt: string; hearts: string; missions: string; lastActive: string }) {
  const head = data.fan ? [header.nickname, header.joinedAt, header.hearts, header.missions, header.lastActive] : [header.nickname, header.joinedAt, header.missions, header.lastActive];
  const rows = data.items.map(item => {
    const cells = [item.nickname, kstDate(item.joinedAt)];
    if (data.fan) cells.push(String(item.hearts ?? 0));
    cells.push(String(item.missionCount), item.lastActiveAt ? kstDate(item.lastActiveAt) : "");
    return cells.map(csvCell).join(",");
  });
  return `﻿${[head.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}
