import { createRoot } from "react-dom/client";
import Page from "../../app/live/[slug]/suggestions/page";
import { APP_LOCALES } from "../../i18n/locales";
import { songSelectionSchema } from "../../features/live-submissions/domain/song";
import { OutboundLinkTracker } from "../../features/analytics/client/outbound-link-tracker";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

const params = new URLSearchParams(location.search), locale = APP_LOCALES.find(value => value === params.get("locale")) ?? "ko";
document.documentElement.lang = locale;
// Artwork is the public image used in Spotify's Search API documentation; metadata below is synthetic.
const song = songSelectionSchema.parse({ provider: "spotify", trackId: "0123456789ABCDEFGHIJKL", title: "예시 신청곡", artist: "예시 가수", album: "예시 앨범",
  artworkUrl: "https://i.scdn.co/image/ab67616d00001e02ff9ca10b55ce82ae553c8228", sourceUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL" });
const initial = [
  { id: "10000000-0000-4000-8000-000000000001", kind: "song", body: song.title, song, nickname: "별빛모음", status: "submitted" },
  { id: "10000000-0000-4000-8000-000000000002", kind: "question", body: "요즘 가장 즐겨 듣는 노래가 궁금해요.", song: null, nickname: "오늘도응원", status: "selected" },
  { id: "10000000-0000-4000-8000-000000000003", kind: "cheer", body: "오늘도 함께할 수 있어 기뻐요!", song: null, nickname: "초록별", status: "submitted" },
].map(item => ({ ...item, publicVisible: true, revision: 1, createdAt: "2026-10-19T01:00:00Z", selectedAt: item.status === "selected" ? "2026-10-19T01:01:00Z" : null, avatarUrl: "/images/avatars/star-pink.webp", isOwner: false }));
type Owned = { id: string; kind: string; body: string; song: typeof song | null; publicVisible: boolean; status: string; revision: number; createdAt: string; selectedAt: null; deletedAt: null };
let mine: Owned[] = JSON.parse(sessionStorage.getItem("song-fixture-mine") ?? "[]");
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  if (url.pathname === "/api/music/search") {
    const query = url.searchParams.get("q");
    return query === "error" ? Response.json({ error: { code: "SONG_SEARCH_UNAVAILABLE" } }, { status: 503 }) : Response.json({ items: query === "empty" ? [] : [song] });
  }
  if (url.pathname === "/api/live-events/sample-live/submissions") {
    if (init?.method === "POST") {
      const payload = JSON.parse(String(init.body)), { idempotencyKey: _key, ...fields } = payload;
      const item = { ...fields, id: crypto.randomUUID(), status: "submitted", revision: 1, createdAt: new Date().toISOString(), selectedAt: null, deletedAt: null };
      mine.push(item); sessionStorage.setItem("song-fixture-mine", JSON.stringify(mine));
      return Response.json({ item, replayed: false });
    }
    if (params.get("state") === "error") return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
    const items = params.get("state") === "empty" || params.get("state") === "members" ? [] : [...mine.map(item => ({ ...item, deletedAt: undefined, nickname: "나의 예시", avatarUrl: "/images/avatars/star-pink.webp", isOwner: true })), ...initial];
    return Response.json({ settings: { accepting: params.get("state") !== "closed", closesAt: "2099-01-01T00:00:00Z", visibility: params.get("state") === "members" ? "members" : "public", revision: 1 }, access: params.get("state") === "members" ? "members_required" : "public", mine, items, nextCursor: null });
  }
  if (url.pathname.startsWith("/api/live-submissions/") && init?.method === "DELETE") {
    const id = url.pathname.split("/").at(-1); mine = mine.filter(item => item.id !== id);
    sessionStorage.setItem("song-fixture-mine", JSON.stringify(mine)); return Response.json({ id, deleted: true, replayed: false });
  }
  if (url.pathname === "/api/events") return Response.json({ ok: true });
  return Response.json({ error: { code: "FIXTURE_ONLY" } }, { status: 404 });
};
void Page({ params: Promise.resolve({ slug: "sample-live" }), searchParams: Promise.resolve({ locale }) }).then(view => {
  createRoot(document.getElementById("root")!).render(<><p style={{ margin: 0, padding: "8px 16px", background: "#f6f6f5", fontSize: 12 }}>로컬 예시 데이터 · 실제 신청·Spotify 검색 결과가 아닙니다.</p><OutboundLinkTracker />{view}</>);
});
