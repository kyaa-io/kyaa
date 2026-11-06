import { createRoot } from "react-dom/client";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import { PassportMissionBook } from "../../features/passport/ui/passport-mission-book";
import { ProofsScreen } from "../../features/passport-proofs/ui/proofs-screen";
import { PassportPreview } from "../community-stamps-local/passport-preview";
import { APP_LOCALES } from "../../i18n/locales";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "mission";
const locale = APP_LOCALES.find(value => value === params.get("locale")) ?? "ko";
document.documentElement.lang = locale;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACTIONS = ["quiz", "checkin", "post", "comment", "share", "invite", "subscription", "steady_checkin", "proof"];
const first = (filled: number) => ACTIONS.map((kind, i) => ({ slotNo: i + 1, kind, state: i < filled ? "filled" : "empty", stampId: i < filled ? id(10 + i) : null, clearedAt: null }));
const later = (filled: number) => ACTIONS.map((_, i) => ({ slotNo: i + 1, kind: null, state: i < filled ? "filled" : "empty", stampId: i < filled ? id(30 + i) : null, clearedAt: null }));
const SCENARIOS: Record<string, unknown[]> = {
  // before the title: page 1 waits for the proof slot, page 2 has stacked stamps and is locked
  locked: [
    { pageNo: 1, slots: first(8), filled: 8, claimable: false, claimed: false, locked: false, lockedReason: null },
    { pageNo: 2, slots: later(4), filled: 4, claimable: false, claimed: false, locked: true, lockedReason: "jjinfan_required" },
  ],
  // before the title with many stacked stamps: a full page 2 stays locked and page 3 keeps filling
  stacking: [
    { pageNo: 1, slots: first(6), filled: 6, claimable: false, claimed: false, locked: false, lockedReason: null },
    { pageNo: 2, slots: later(9), filled: 9, claimable: false, claimed: false, locked: true, lockedReason: "jjinfan_required" },
    { pageNo: 3, slots: later(3), filled: 3, claimable: false, claimed: false, locked: true, lockedReason: "jjinfan_required" },
  ],
  // after the title: claimed, claimable and in-progress pages together
  open: [
    { pageNo: 1, slots: first(9), filled: 9, claimable: false, claimed: true, locked: false, lockedReason: null },
    { pageNo: 2, slots: later(9), filled: 9, claimable: true, claimed: false, locked: false, lockedReason: null },
    { pageNo: 3, slots: later(2), filled: 2, claimable: false, claimed: false, locked: false, lockedReason: null },
  ],
};
const scenario = params.get("scenario") ?? "locked";
const proofItems = [
  { submissionId: id(50), proofType: "receipt", status: "rejected", revision: 2, reason: "0원 결제 내역은 대상이 아닙니다", publishConsent: false, amountVisible: false, submittedAt: "2026-11-01T00:00:00.000Z", reviewedAt: "2026-11-02T00:00:00.000Z" },
  { submissionId: id(51), proofType: "membership", status: "changes_requested", revision: 2, reason: "금액이 보이게 다시 올려 주세요", publishConsent: true, amountVisible: true, submittedAt: "2026-11-03T00:00:00.000Z", reviewedAt: "2026-11-04T00:00:00.000Z" },
  { submissionId: id(52), proofType: "ticket", status: "approved", revision: 2, reason: null, publishConsent: false, amountVisible: false, submittedAt: "2026-11-04T00:00:00.000Z", reviewedAt: "2026-11-05T00:00:00.000Z" },
];
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.pathname.endsWith("/roadmap")) return Promise.resolve(Response.json({ passportId: id(1), celebrityId: id(2), hearts: scenario === "open" ? 1 : 0, jjinfan: scenario === "open", pages: SCENARIOS[scenario] }));
  if (url.pathname === "/api/me/proofs/missions") return Promise.resolve(Response.json({ items: [{ missionId: id(60), proofType: "receipt", platform: null, submittable: true, unavailableReason: null, closesAt: "2026-12-01T00:00:00.000Z" }] }));
  if (url.pathname === "/api/me/proofs") return Promise.resolve(Response.json({ items: proofItems }));
  if (url.pathname.includes("/posts")) return Promise.resolve(Response.json({ items: [{ postId: id(70), body: "응원합니다", createdAt: "2026-11-05T00:00:00.000Z", proofType: "receipt", amountVisible: false, imageUrl: null, jjinfanRank: 12 }], nextBefore: null }));
  if (url.pathname.startsWith("/api/") && view !== "passports") return Promise.resolve(Response.json({}));
  return realFetch(input, init);
};
createRoot(document.getElementById("root")!).render(<main id="fixture" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px", fontFamily: '"Pretendard Variable", Pretendard, system-ui, sans-serif' }}>
  {view === "passports" ? <PassportPreview /> : view === "proofs" ? <ProofsScreen locale={locale} slug="fixture" /> : <PassportMissionBook passportId={id(1)} creatorSlug="fixture" locale={locale} />}
</main>);
