import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import adminRows from "@/server/home-notice/fixtures/list_admin_home_notices.json";
import { homeNoticeCategories, homeNoticeCategoryLabels, homeNoticeErrorCodes, homeNoticeErrorMessages } from "@/features/home/domain/home-notice";
import { NoticeManager } from "./notice-manager";

const getAccessToken = vi.fn(async () => "token");
const setImage = vi.fn((_attrs: { src: string; alt: string }) => ({ run: vi.fn() }));
const editor = {
  isEditable: true,
  setEditable: vi.fn(),
  getJSON: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
  commands: { setContent: vi.fn() },
  chain: () => ({ focus: () => ({ setImage }) }),
};
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken }) }));
vi.mock("@tiptap/react", () => ({
  useEditor: (options: { editable: boolean }) => ({ ...editor, isEditable: options.editable }),
  EditorContent: () => <div data-testid="editor" />,
}));
vi.mock("../notice/tiptap-extensions", () => ({ noticeExtensions: [] }));
vi.mock("../notice/notice-body", () => ({ NoticeBody: () => <div /> }));

// Rows are the real list_admin_home_notices response captured by supabase/tests/home_notices.sh.
const rows = adminRows as Array<{ id: string; slug: string; category: string; publication_status: string; archived_at: string | null }>;
const draft = rows.find(row => row.slug === "r8data-e")!;
const published = rows.find(row => row.slug === "r8data-d")!;
const labels = homeNoticeCategoryLabels.ko;

function homeManager() {
  return render(<NoticeManager celebrityId="home" celebrityName="kyaa" role="admin" locale="ko" endpoint="/api/admin/home-notices" categories={homeNoticeCategories} categoryLabels={labels} />);
}
function postBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST").map(([url, init]) => ({ url: String(url), body: (init as RequestInit).body }));
}

describe("NoticeManager for home notices", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    getAccessToken.mockReset().mockResolvedValue("token");
    setImage.mockClear();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).endsWith("/assets")) return Response.json({ url: "https://cdn.example/storage/v1/object/public/cms-assets/public-image-assets/a.webp" });
      if (init?.method === "POST") return Response.json({ id: draft.id });
      return Response.json({ role: "admin", notices: rows });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("lists from the endpoint and shows the category field instead of post type and visibility", async () => {
    homeManager();
    await screen.findByRole("button", { name: /초안 E/ });
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/admin/home-notices");
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue("guide");
    expect(screen.queryByRole("combobox", { name: "글 구분" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "공개 범위" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "구분" })).getAllByRole("option").map(option => option.textContent)).toEqual(["안내", "크리에이터", "이벤트", "업데이트"]);
  });

  it("restores each notice's category on selection and resets to the first category for a new notice", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    homeManager();
    fireEvent.click(await screen.findByRole("button", { name: /최신 D/ }));
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue(published.category);
    fireEvent.click(screen.getByRole("button", { name: /초안 E/ }));
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue("guide");
    fireEvent.click(screen.getByRole("button", { name: /고정 C/ }));
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue("update");
    fireEvent.click(screen.getByRole("button", { name: "새 공지" }));
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue(homeNoticeCategories[0]);
  });

  it("treats a category-only change as unsaved: beforeunload, confirm on leave, cancel keeps it, reverting clears it", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    homeManager();
    fireEvent.click(await screen.findByRole("button", { name: /초안 E/ }));
    const field = screen.getByRole("combobox", { name: "구분" });
    fireEvent.change(field, { target: { value: "event" } });
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /최신 D/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue("event");
    fireEvent.click(screen.getByRole("button", { name: "새 공지" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue("event");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /최신 D/ }));
    expect(screen.getByRole("combobox", { name: "구분" })).toHaveValue(published.category);
    fireEvent.click(screen.getByRole("button", { name: /초안 E/ }));
    confirm.mockClear();
    fireEvent.change(screen.getByRole("combobox", { name: "구분" }), { target: { value: "event" } });
    fireEvent.change(screen.getByRole("combobox", { name: "구분" }), { target: { value: "guide" } });
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /최신 D/ }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("saves category without postType or visibility, sends state actions, and attaches images to the endpoint", async () => {
    vi.spyOn(window, "prompt").mockReturnValueOnce("r8data archive reason").mockReturnValueOnce("공지 이미지");
    const { container } = homeManager();
    fireEvent.click(await screen.findByRole("button", { name: /초안 E/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "구분" }), { target: { value: "creator" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("공지를 저장했습니다.");
    const [saved] = postBodies(fetchMock);
    expect(saved!.url).toBe("/api/admin/home-notices");
    const body = JSON.parse(String(saved!.body));
    expect(body).toMatchObject({ action: "save", id: draft.id, slug: "r8data-e", category: "creator", pinned: false });
    expect(body).not.toHaveProperty("postType");
    expect(body).not.toHaveProperty("visibility");

    fireEvent.click(screen.getByRole("button", { name: "공개" }));
    await screen.findByText("공지 상태를 변경했습니다.");
    expect(JSON.parse(String(postBodies(fetchMock)[1]!.body))).toEqual({ action: "publish", id: draft.id, expectedRevision: 1 });
    fireEvent.click(screen.getByRole("button", { name: "보관" }));
    await waitFor(() => expect(postBodies(fetchMock)).toHaveLength(3));
    expect(JSON.parse(String(postBodies(fetchMock)[2]!.body))).toEqual({ action: "archive", id: draft.id, expectedRevision: 1, reason: "r8data archive reason" });

    await screen.findByText("공지 상태를 변경했습니다.");
    const file = new File(["image"], "notice.png", { type: "image/png" });
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(setImage).toHaveBeenCalledTimes(1));
    expect(postBodies(fetchMock)[3]!.url).toBe(`/api/admin/home-notices/${draft.id}/assets`);
    expect(setImage).toHaveBeenCalledWith({ src: "https://cdn.example/storage/v1/object/public/cms-assets/public-image-assets/a.webp", alt: "공지 이미지" });
  });
});

describe("NoticeManager shows the cause of a refused home notice request", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it.each([["SLUG_TAKEN", 409], ["NOT_FOUND", 404], ["UNAVAILABLE", 503]] as const)("shows the %s message", async (code, status) => {
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ error: code, message: "raw SQL text" }, { status })
      : Response.json({ role: "admin", notices: rows })));
    render(<NoticeManager celebrityId="home" celebrityName="kyaa" role="admin" locale="ko" endpoint="/api/admin/home-notices" categories={homeNoticeCategories} categoryLabels={labels} errorMessages={homeNoticeErrorMessages.ko} />);
    fireEvent.click(await screen.findByRole("button", { name: /초안 E/ }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(homeNoticeErrorMessages.ko[code]);
    expect(screen.queryByText("raw SQL text")).not.toBeInTheDocument();
  });
  it("has a message for every code in all 12 languages", () => {
    for (const messages of Object.values(homeNoticeErrorMessages)) {
      expect(Object.keys(messages).sort()).toEqual([...homeNoticeErrorCodes].sort());
      for (const text of Object.values(messages)) expect(text.trim().length).toBeGreaterThan(8);
    }
    expect(Object.keys(homeNoticeErrorMessages)).toHaveLength(12);
  });
});

describe("NoticeManager channel operator path stays as it was", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("keeps operator URLs, has no category field, and saves postType and visibility without category", async () => {
    const operatorRow = {
      id: "11111111-1111-4111-8111-111111111111", slug: "hello", publication_status: "draft", pinned: false, post_type: "notice", visibility: "public",
      published_at: null, archived_at: null, archive_reason: null, revision: 1,
      celebrity_notice_localizations: [
        { locale: "ko", title: "첫 공지", body_json: { type: "doc", content: [{ type: "paragraph" }] } },
        { locale: "en", title: "First notice", body_json: { type: "doc", content: [{ type: "paragraph" }] } },
      ],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST" && String(input).endsWith("/assets")) return Response.json({ url: "https://cdn.example/x.webp" });
      if (init?.method === "POST") return Response.json({ id: operatorRow.id });
      return Response.json({ notices: [operatorRow] });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "prompt").mockReturnValue("이미지");
    const { container } = render(<NoticeManager celebrityId="channel-1" celebrityName="채널" role="operator" locale="ko" apiBase="/api/operator/channels" />);
    fireEvent.click(await screen.findByRole("button", { name: /첫 공지/ }));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/operator/channels/channel-1/notices");
    expect(screen.queryByRole("combobox", { name: "구분" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "글 구분" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("공지를 저장했습니다.");
    const saved = postBodies(fetchMock)[0]!;
    expect(saved.url).toBe("/api/operator/channels/channel-1/notices");
    const body = JSON.parse(String(saved.body));
    expect(body).toMatchObject({ postType: "notice", visibility: "public" });
    expect(body).not.toHaveProperty("category");
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(["i"], "a.png", { type: "image/png" })] } });
    await waitFor(() => expect(postBodies(fetchMock)).toHaveLength(2));
    expect(postBodies(fetchMock)[1]!.url).toBe(`/api/operator/channels/channel-1/notices/${operatorRow.id}/assets`);
  });
});
