import { createRoot } from "react-dom/client";
import { GroupManagementMembers } from "@/features/groups/ui/group-management-members";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";
// 합성 fixture: 서비스 컴포넌트를 실제로 렌더하고 회원 API 응답만 playwright가 대신한다. 운영 증거 아님.
const detail: any = { page: { id: "e9900000-0000-4000-8000-000000000001", kind: "fan", name: "합성 페이지" }, membership: { role: new URLSearchParams(location.search).get("role") ?? "owner", joinedAt: "2026-11-01" } };
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}><GroupManagementMembers detail={detail} locale={(new URLSearchParams(location.search).get("locale") ?? "ko") as any} refresh={() => {}} /></main>);
