import { createRoot } from "react-dom/client";
import { FanPostDetail } from "@/features/fan-posts/ui/fan-post-detail";
import { NoticeDetail } from "@/components/notice/notice-detail";
import { DukjilProvider } from "@/features/dukjil/ui/dukjil-provider";
import "@/app/globals.css";
import "pretendard/dist/web/static/pretendard.css";
// Synthetic fixture: the real post detail and notice (아티스트 소식) detail render here; only sign-in and API answers are stand-ins (run.mjs). Not production evidence.
const query = new URLSearchParams(location.search), screen = query.get("screen"), locale = query.get("locale") === "ko" ? "ko" : "en";
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
  {screen === "notice"
    ? <NoticeDetail slug="elina" noticeSlug="walk" locale={locale} />
    : <DukjilProvider slug="elina" locale={locale}><FanPostDetail postId="10000000-0000-4000-8000-000000000001" locale={locale} presentation="board" /></DukjilProvider>}
</main>);
