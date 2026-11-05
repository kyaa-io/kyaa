import { createRoot } from "react-dom/client";
import { CreatorMediaPanel } from "../../features/media/ui/creator-media-panel";
import "../../app/globals.css";
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 1360, margin: "0 auto", padding: "24px 16px" }}><CreatorMediaPanel slug={new URLSearchParams(location.search).get("slug") ?? "elina"} locale="ko" /></main>);
