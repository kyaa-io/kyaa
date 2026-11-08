import type { AppLocale } from "@/i18n/locales";
import styles from "./role-badge.module.css";

/** 글·댓글·팬 목록 행의 역할 배지 1종(피드백 I ⑤): 아티스트·운영자만. 흰 바탕 + 1px 테두리 텍스트 칩(H6). 공통 승격 후보. */
export type PageRole = "artist" | "operator";

const labels: Record<AppLocale, Record<PageRole, string>> = {
  ko: { artist: "아티스트", operator: "운영자" }, en: { artist: "Artist", operator: "Operator" }, ja: { artist: "アーティスト", operator: "運営" },
  "zh-Hans": { artist: "艺人", operator: "运营" }, "zh-Hant": { artist: "藝人", operator: "營運" }, es: { artist: "Artista", operator: "Equipo" },
  id: { artist: "Artis", operator: "Pengelola" }, vi: { artist: "Nghệ sĩ", operator: "Quản lý" }, th: { artist: "ศิลปิน", operator: "ผู้ดูแล" },
  pt: { artist: "Artista", operator: "Equipe" }, fr: { artist: "Artiste", operator: "Équipe" }, ru: { artist: "Артист", operator: "Команда" },
};

export function pageRoleLabel(locale: AppLocale, role: PageRole) {
  return (labels[locale] ?? labels.en)[role];
}

/** 행 데이터에서 역할을 정한다. 아티스트는 페이지 접속 정보가 아티스트로 알려 준 프로필만, 운영자는 소유자·운영진이다. */
export function pageRoleOf(input: { profileId: string; role?: "owner" | "manager" | "member" | null }, artistIds: ReadonlySet<string>): PageRole | null {
  if (artistIds.has(input.profileId)) return "artist";
  return input.role === "owner" || input.role === "manager" ? "operator" : null;
}

export function RoleBadge({ role, locale }: { role: PageRole; locale: AppLocale }) {
  return <span className={styles.badge} data-role-badge={role}>{pageRoleLabel(locale, role)}</span>;
}
