import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PostComposer } from "../../features/fan-posts/ui/post-composer";
import "../../app/globals.css";
function App() {
  const [saved, setSaved] = useState(false);
  return <main style={{ maxWidth: 640, margin: "32px auto", padding: 16 }}><h1>커뮤니티</h1>{saved ? <p role="status">게시 완료</p> : <PostComposer slug="elina" locale="ko" onSaved={() => setSaved(true)} />}</main>;
}
createRoot(document.getElementById("root")!).render(<App />);
