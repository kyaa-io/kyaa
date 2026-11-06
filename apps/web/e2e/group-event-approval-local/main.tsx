import { createRoot } from "react-dom/client";
import { GroupEventApprovals } from "@/components/admin/group-event-approvals";
import { GroupEventScreen } from "@/features/groups/ui/group-event-screen";
import { GroupManagement } from "@/features/groups/ui/group-management";
import { NotificationCenter } from "@/features/notification/ui/notification-center";
import type { AppLocale } from "@/i18n/locales";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";
// 합성 화면: 실제 컴포넌트를 렌더하고 API 응답만 playwright가 대신한다. 운영 증거가 아니다.
const query = new URLSearchParams(location.search);
const locale = (query.get("locale") ?? "ko") as AppLocale;
const page = "e9910000-0000-4000-8000-000000000001", event = "e9910000-0000-4000-8000-000000000002";
createRoot(document.getElementById("root")!).render(query.get("view") === "admin"
 ? <GroupEventApprovals locale={locale === "en" ? "en" : "ko"}/>
 : query.get("view") === "notifications" ? <NotificationCenter/>
 : query.get("view") === "manage" ? <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}><GroupManagement detail={{ page: { id: page, kind: "hobby", celebrityId: null, slug: null, name: "[합성] 한강 러닝 모임", description: "", imageUrl: null, question: null, anonymous: false, memberCount: 3 }, membership: { role: "owner", joinedAt: "2026-11-01T00:00:00Z" }, bookmarked: false } as never} locale={locale} refresh={() => {}} section={query.get("section") ?? "events"}/></main>
 : <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}><GroupEventScreen pageId={page} eventId={event} locale={locale}/></main>);
