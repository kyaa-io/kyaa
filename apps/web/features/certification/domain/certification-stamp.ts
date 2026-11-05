import type { CertificationListItem } from "./certification";

/** Existing ink-v1 stamp assets reused per verification kind; no new artwork. */
export function certificationStampSrc(item: Pick<CertificationListItem, "kind" | "membershipPlatform">): string {
  const name = item.kind === "quiz" ? "knowledge"
    : item.kind === "live_mission" ? "attendance"
    : item.membershipPlatform ? "membership"
    : "support";
  return `/images/stamps/ink-v1/${name}.webp`;
}
