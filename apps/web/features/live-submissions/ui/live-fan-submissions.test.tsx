import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LiveFanSubmissions } from "./live-fan-submissions";
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "owner-a" } as { id: string } | null, getAccessToken: vi.fn(async () => "token-a"), login: vi.fn() }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "owner-a", generation: 0 }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentTranslation: ({ children }: { children: React.ReactNode }) => children, ContentActions: () => null }));
const id = "10000000-0000-4000-8000-000000000001";
const owned = { id, kind: "question", body: "질문입니다", status: "submitted", revision: 1, createdAt: "2026-09-01T00:00:00Z", selectedAt: null, deletedAt: null };
const base = { settings: { accepting: true, closesAt: "2099-01-01T00:00:00Z", visibility: "public", revision: 1 }, access: "public", mine: [], items: [], nextCursor: null };
beforeEach(() => { vi.unstubAllGlobals(); auth.authenticated = true; auth.user = { id: "owner-a" }; session.ownerId = "owner-a"; session.generation = 0; auth.getAccessToken.mockReset().mockResolvedValue("token-a"); });
it("persists a submitted question then reloads owned state, disabling duplicate writes", async () => {
  let saved = false;
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => { if (init?.method === "POST") { saved = true; return Response.json({ item: owned, replayed: false }); } return Response.json({ ...base, mine: saved ? [owned] : [] }); });
  vi.stubGlobal("fetch", fetcher); render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  fireEvent.change(await screen.findByRole("textbox", { name: "질문" }), { target: { value: "질문입니다" } });
  const submit = screen.getByRole("button", { name: "제출" }); fireEvent.click(submit); fireEvent.click(submit);
  await screen.findByText("질문입니다"); expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  expect(screen.queryByRole("textbox", { name: "질문" })).not.toBeInTheDocument();
  const call = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(call[1]?.body))).toMatchObject({ kind: "question", body: "질문입니다" }); expect(JSON.parse(String(call[1]?.body))).not.toHaveProperty("appUserId");
});
it("uses server member gate and removes old owner's visible data before the next read", async () => {
  const fetcher = vi.fn(async () => Response.json({ ...base, access: "members_required", mine: [{ ...owned, body: null }], items: [] }));
  vi.stubGlobal("fetch", fetcher); const view = render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  await screen.findByText(/Fan Passport가/); expect(screen.getByRole("link", { name: "팬 인증하기" })).toHaveAttribute("href", "/c/kara/verify?locale=ko"); expect(screen.queryByRole("textbox")).not.toBeInTheDocument(); expect(screen.queryByText("질문입니다")).not.toBeInTheDocument();
  let resolve!: (value: Response) => void; fetcher.mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; }));
  auth.user = { id: "owner-b" }; session.ownerId = "owner-b"; session.generation++; auth.getAccessToken.mockResolvedValue("token-b");
  view.rerender(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  await waitFor(() => expect(resolve).toBeDefined()); await act(async () => resolve(Response.json({ ...base, settings: { ...base.settings, accepting: false }, mine: [] })));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
it("closes an already rendered form at the actual deadline", async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));
 try {
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...base,settings:{...base.settings,closesAt:"2026-09-01T00:00:01Z"}})));
 await act(async()=>{render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko"/>);await vi.advanceTimersByTimeAsync(1);});
  expect(screen.getByRole("textbox",{name:"질문"})).toBeInTheDocument();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1001);});
  expect(screen.queryByRole("textbox",{name:"질문"})).not.toBeInTheDocument();
 } finally {vi.useRealTimers();}
});
it("shows the closed state to guests before offering login", async () => {
  auth.authenticated = false; auth.user = null;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...base, settings: { ...base.settings, accepting: false, closesAt: null } })));
  render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  expect(await screen.findByText("마감")).toBeInTheDocument();
  expect(screen.queryByText(/접수 마감:/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "로그인하고 계속" })).not.toBeInTheDocument();
});
it("labels cursor reset by its actual first-page behavior", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({ ...base, nextCursor: url.includes("cursor=") ? null : "next" })));
  render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
  expect(await screen.findByRole("button", { name: "처음으로" })).toBeInTheDocument();
});
const song = { provider: "spotify", trackId: "0123456789ABCDEFGHIJKL", title: "Song title", artist: "Artist name", album: "Album", artworkUrl: "https://i.scdn.co/image/abcdef", sourceUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL" };
it("searches Spotify, selects original metadata, saves and reads a public song without review controls", async () => {
  let saved = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/music/search")) return Response.json({ items: [song] });
    if (init?.method === "POST") { saved = true; return Response.json({ item: { ...owned, kind: "song", body: song.title, song, publicVisible: true }, replayed: false }); }
    return Response.json({ ...base, items: saved ? [{ id, kind: "song", body: song.title, song, publicVisible: true, nickname: "Fan", avatarUrl: "", isOwner: true, status: "submitted", selectedAt: null, revision: 1, createdAt: owned.createdAt }] : [] });
  });
  vi.stubGlobal("fetch", fetcher); render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  fireEvent.change(await screen.findByRole("combobox"), { target: { value: "song" } });
  const query = screen.getByRole("textbox", { name: "곡·아티스트 검색" });
  expect(query).toHaveAttribute("maxLength", "120");
  fireEvent.change(query, { target: { value: "A" } });
  expect(screen.getAllByRole("button", { name: "검색" })[1]).toBeDisabled();
  fireEvent.keyDown(query, { key: "Enter" });
  expect(fetcher.mock.calls.some(([url]) => url.startsWith("/api/music/search"))).toBe(false);
  fireEvent.change(screen.getByRole("textbox", { name: "곡·아티스트 검색" }), { target: { value: "Artist" } });
  fireEvent.click(screen.getAllByRole("button", { name: "검색" })[1]);
  fireEvent.click(await screen.findByRole("button", { name: "곡 선택 · Song title" }));
  expect(screen.getByText("닉네임과 제안은 이 페이지를 보는 사람들에게 공개돼요.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "제출" }));
  await screen.findByText("Fan");
  expect(screen.getByText("접수됨")).toBeInTheDocument();
  const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(post[0]).toContain("contract=songs-v1");
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({ kind: "song", body: song.title, song, publicVisible: true });
  expect(screen.queryByRole("button", { name: "숨기기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "선정" })).not.toBeInTheDocument();
});
it("keeps manual song entry available when music search fails", async () => {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/music/search")) return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
    if (init?.method === "POST") return Response.json({ item: { ...owned, kind: "song", body: "Manual song", publicVisible: true, song: { ...song, provider: "manual", title: "Manual song", artist: "Manual artist", album: null, artworkUrl: null, trackId: null, sourceUrl: null } }, replayed: false });
    return Response.json(base);
  });
  vi.stubGlobal("fetch", fetcher); render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  fireEvent.change(await screen.findByRole("combobox"), { target: { value: "song" } });
  fireEvent.change(screen.getByRole("textbox", { name: "곡·아티스트 검색" }), { target: { value: "Missing" } });
  fireEvent.click(screen.getAllByRole("button", { name: "검색" })[1]);
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "직접 입력" }));
  fireEvent.change(screen.getByRole("textbox", { name: "곡 제목" }), { target: { value: "Manual song" } });
  fireEvent.change(screen.getByRole("textbox", { name: "아티스트" }), { target: { value: "Manual artist" } });
  fireEvent.click(screen.getByRole("button", { name: "제출" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  const post = fetcher.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(post[1]?.body))).toMatchObject({ song: { provider: "manual", title: "Manual song", artist: "Manual artist", artworkUrl: null } });
});
it("resets a selected song when the account changes", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(url.startsWith("/api/music/search") ? { items: [song] } : base)));
  const view = render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  fireEvent.change(await screen.findByRole("combobox"), { target: { value: "song" } });
  fireEvent.change(screen.getByRole("textbox", { name: "곡·아티스트 검색" }), { target: { value: "Artist" } });
  fireEvent.click(screen.getAllByRole("button", { name: "검색" })[1]);
  fireEvent.click(await screen.findByRole("button", { name: "곡 선택 · Song title" }));
  auth.user = { id: "owner-b" }; session.ownerId = "owner-b"; session.generation++;
  view.rerender(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" />);
  expect(screen.queryByText("Song title")).not.toBeInTheDocument();
  expect(await screen.findByRole("textbox", { name: "질문" })).toBeInTheDocument();
});
it("shows public suggestions before the composer on the dedicated browsing page", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(base)));
  render(<LiveFanSubmissions slug="event" celebritySlug="kara" locale="ko" browseFirst />);
  const heading = await screen.findByRole("heading", { name: "모든 제안" });
  const composer = await screen.findByRole("textbox", { name: "질문" });
  expect(heading.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "팬 제안" })).not.toBeInTheDocument();
});
