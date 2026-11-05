import { createRoot } from "react-dom/client";
import { APP_LOCALES } from "../../i18n/locales";
import { PostComposer } from "../../features/fan-posts/ui/post-composer";
import "../../app/globals.css";
const locale = APP_LOCALES.find(value => value === new URLSearchParams(location.search).get("locale")) ?? "ko";
createRoot(document.getElementById("root")!).render(<main style={{ maxWidth: 960, margin: "32px auto", padding: "0 16px" }}><PostComposer board slug="elina" locale={locale} onSaved={() => {}} onCancel={() => {}} /></main>);
