import { useState } from "react";
import { createRoot } from "react-dom/client";
import { APP_LOCALES } from "../../i18n/locales";
import { PostComposer } from "../../features/fan-posts/ui/post-composer";
import "../../app/globals.css";
function App() {
  const locale = APP_LOCALES.find(value => value === new URLSearchParams(location.search).get("locale")) ?? "ko";
  const [saved, setSaved] = useState(false);
  return <main style={{ maxWidth: 640, margin: "32px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}><h1>커뮤니티</h1>{saved ? <p role="status">게시 완료</p> : <PostComposer slug="elina" locale={locale} onSaved={() => setSaved(true)} />}</main>;
}
createRoot(document.getElementById("root")!).render(<App />);
