import { createRoot } from "react-dom/client";
import { GroupBoard } from "@/features/groups/ui/group-board";
import { GroupMembers } from "@/features/groups/ui/group-members";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";
// 합성 fixture: 서비스 컴포넌트를 실제로 렌더하고 API 응답만 playwright가 대신한다. 운영 증거 아님.
const q = new URLSearchParams(location.search), view = q.get("view") ?? "board";
const detail: any = { page: { id: "e9900000-0000-4000-8000-000000000001", kind: "fan" }, membership: { role: "member" } };
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
  {view === "board" && <GroupBoard detail={detail} locale="ko" initialPostId={q.get("post") ?? undefined} />}
  {view === "members" && <GroupMembers pageId={detail.page.id} locale="ko" member />}
</main>);
