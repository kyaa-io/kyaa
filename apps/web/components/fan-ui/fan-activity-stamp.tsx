import styles from "./fan-activity-stamp.module.css";

/**
 * 덕질 행동 옆에 붙이는 작은 스탬프 그림(DESIGN.md 4절 "덕질 행동에는 작게라도 항상 스탬프 자산을 붙인다").
 * 그림은 패스포트에 찍히는 것과 같은 kyaa 잉크 스탬프(`stamps/ink-v1`)다. 행동 이름이 바로 옆 글자로 있으므로 보조 기술에서는 숨긴다.
 */
const art = { comment: "first-comment", attendance: "daily-checkin", invite: "invite", passport: "welcome", community: "membership", share: "share", post: "post", streak: "steady-checkin" } as const;
export type FanActivityStampKind = keyof typeof art;
export const fanActivityStampSrc = (kind: FanActivityStampKind) => `/images/stamps/ink-v1/${art[kind]}.webp`;

export function FanActivityStamp({ kind, size = "md", className }: Readonly<{ kind: FanActivityStampKind; /** sm 32 · md 40 · lg 48 */ size?: "sm" | "md" | "lg"; className?: string }>) {
  return <img className={[styles.stamp, styles[size], className ?? ""].filter(Boolean).join(" ")} data-art="stamp" data-fan-activity-stamp={kind} src={fanActivityStampSrc(kind)} alt="" aria-hidden="true" width="512" height="512" loading="lazy" decoding="async" />;
}
