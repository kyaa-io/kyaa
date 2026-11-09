import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import adminRows from "@/server/home-notice/fixtures/list_admin_home_notices.json";
import { homeNoticeErrorMessages } from "@/features/home/domain/home-notice";
import { AuthorizedHomeNoticeManager } from "./home-notice-admin";

// The admin is a two-language tool: AdminLocale = "ko" | "en" (operations-shell.tsx:16), its language button toggles ko↔en (:82),
// and every manager reads `lang === "en" ? "en" : "ko"` (e.g. live-manager.tsx:55, home-banner-manager.tsx:83). Home notices follow it.
const search = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value), usePathname: () => "/admin/home-notices", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({ status: "authorized", admin: { email: "a@example.invalid", role: "admin" } }) }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken: async () => "token" }) }));
vi.mock("@tiptap/react", () => ({
  useEditor: (options: { editable: boolean }) => ({ isEditable: options.editable, setEditable: vi.fn(), getJSON: () => ({ type: "doc", content: [] }), commands: { setContent: vi.fn() }, isDestroyed: false }),
  EditorContent: () => <div />, NodeViewWrapper: () => null, ReactNodeViewRenderer: () => null,
}));
vi.mock("../notice/tiptap-extensions", () => ({ noticeExtensions: [] }));
vi.mock("../notice/notice-body", () => ({ NoticeBody: () => <div /> }));

afterEach(() => { vi.unstubAllGlobals(); });

describe("home notice admin language", () => {
  it.each([
    ["lang=en", "en", "Save"],
    ["", "ko", "저장"],
    ["lang=ko", "ko", "저장"],
    // Not an admin language: the whole admin shell stays Korean, so the error does too (no mixed-language screen).
    ["lang=ja", "ko", "저장"],
    ["lang=zh-Hans", "ko", "저장"],
  ] as const)("%s shows the %s screen and its taken-URL message", async (query, language, saveLabel) => {
    search.value = query;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? Response.json({ error: "SLUG_TAKEN", message: "raw SQL text" }, { status: 409 })
      : Response.json({ role: "admin", notices: adminRows })));
    render(<AuthorizedHomeNoticeManager />);
    fireEvent.click(await screen.findByRole("button", { name: /초안 E|Draft E/ }));
    fireEvent.click(screen.getByRole("button", { name: saveLabel }));
    expect(await screen.findByRole("alert")).toHaveTextContent(homeNoticeErrorMessages[language].SLUG_TAKEN);
  });
});
