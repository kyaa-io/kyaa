import { createRoot } from "react-dom/client";
import { FanPostDetail } from "@/features/fan-posts/ui/fan-post-detail";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";
// 합성 fixture: 서비스 컴포넌트를 실제로 렌더하고 API 응답만 playwright가 대신한다. 운영 증거 아님.
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}><FanPostDetail postId="10000000-0000-4000-8000-000000000001" locale="ko" presentation="board" /></main>);
