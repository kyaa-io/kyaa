import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupLeaderOpen } from "./group-leader-open";

const state = vi.hoisted(() => ({ request: vi.fn(), authenticated: true, ready: true, push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }), usePathname: () => "/pages/groups/apply", useSearchParams: () => new URLSearchParams() }));
vi.mock("./use-group-resource", () => ({ useGroupRequest: () => ({ request: state.request, authenticated: state.authenticated, ready: state.ready, ownerKey: "actor:1" }), useGroupResource: () => ({ data: undefined, error: false }) }));
vi.mock("./group-shell", () => ({ GroupShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("./group-application", () => ({ GroupApplication: ({ notice }: { notice?: string }) => <div data-testid="general-form">{notice ? <p role="alert">{notice}</p> : null}</div> }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], busy: false, ready: false, invalid: false, add: vi.fn(), remove: vi.fn(), retry: vi.fn(), markUsed: vi.fn() }) }));

const pass = "A".repeat(43);
const page = "10000000-0000-4000-8000-000000000004";
beforeEach(() => { state.request.mockReset(); state.push.mockReset(); state.authenticated = true; state.ready = true; });
afterEach(cleanup);

it("a usable pass shows the open form: name, optional intro, one room link, a single primary action", async () => {
  state.request.mockResolvedValueOnce({ valid: true, label: "오픈채팅 ○○방" });
  render(<GroupLeaderOpen locale="ko" pass={pass} />);
  expect(await screen.findByRole("heading", { level: 1, name: "모임 열기" })).toBeInTheDocument();
  expect(state.request).toHaveBeenCalledWith("/api/groups/leader-passes/check", { method: "POST", body: JSON.stringify({ token: pass }) });
  expect(screen.getByLabelText("모임 이름")).toBeRequired();
  expect(screen.getAllByRole("textbox", { name: "방 링크" })).toHaveLength(1);
  // 운영 경험·가입 질문·유형 선택은 없다.
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByText("기존에 운영하던 페이지가 있나요?")).toBeNull();
  expect(screen.getByRole("button", { name: "모임 열기" })).toBeDisabled();
});

it("submitting sends the token once with the typed fields and goes to the invite tab of the new group", async () => {
  state.request.mockResolvedValueOnce({ valid: true, label: "x" }).mockResolvedValueOnce({ pageId: page });
  render(<GroupLeaderOpen locale="ko" pass={pass} />);
  fireEvent.change(await screen.findByLabelText("모임 이름"), { target: { value: " 토요일의 취향 " } });
  fireEvent.change(screen.getByRole("textbox", { name: "방 링크" }), { target: { value: "https://open.kakao.com/o/taste" } });
  fireEvent.click(screen.getByRole("button", { name: "모임 열기" }));
  await waitFor(() => expect(state.push).toHaveBeenCalledWith(`/pages/groups/${page}/manage?section=invite&locale=ko`));
  const [url, init] = state.request.mock.calls[1]!;
  expect(url).toBe("/api/groups/applications/with-pass");
  const body = JSON.parse((init as RequestInit).body as string);
  expect(body).toMatchObject({ token: pass, name: "토요일의 취향", description: "", externalLinks: [{ url: "https://open.kakao.com/o/taste" }] });
  expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(body).not.toHaveProperty("kind");
});

it("an unsupported room link stops the submit before any request", async () => {
  state.request.mockResolvedValueOnce({ valid: true, label: "x" });
  render(<GroupLeaderOpen locale="ko" pass={pass} />);
  fireEvent.change(await screen.findByLabelText("모임 이름"), { target: { value: "모임" } });
  fireEvent.change(screen.getByRole("textbox", { name: "방 링크" }), { target: { value: "http://open.kakao.com/o/a" } });
  fireEvent.click(screen.getByRole("button", { name: "모임 열기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("지원하지 않는 주소예요");
  expect(state.request).toHaveBeenCalledTimes(1);
  expect(state.push).not.toHaveBeenCalled();
});

it.each([404, 409])("a pass the server refuses (%s) falls back to the general form with one error line", async (status) => {
  state.request.mockResolvedValueOnce({ valid: true, label: "x" }).mockRejectedValueOnce(Object.assign(new Error("x"), { status }));
  render(<GroupLeaderOpen locale="ko" pass={pass} />);
  fireEvent.change(await screen.findByLabelText("모임 이름"), { target: { value: "모임" } });
  fireEvent.click(screen.getByRole("button", { name: "모임 열기" }));
  expect(await screen.findByTestId("general-form")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("사용할 수 없는 링크예요");
});

it("a pass that is used, expired or malformed shows the general form with the error and never calls submit", async () => {
  state.request.mockResolvedValueOnce({ valid: false });
  const view = render(<GroupLeaderOpen locale="ko" pass={pass} />);
  expect(await screen.findByTestId("general-form")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("사용할 수 없는 링크예요");
  view.unmount();
  state.request.mockReset();
  render(<GroupLeaderOpen locale="ko" pass="short" />);
  expect(screen.getByTestId("general-form")).toBeInTheDocument();
  expect(state.request).not.toHaveBeenCalled();
});

it("signed out: only the login action, returning to the same pass link", () => {
  state.authenticated = false;
  render(<GroupLeaderOpen locale="ko" pass={pass} />);
  const login = screen.getByRole("link", { name: "로그인" });
  expect(decodeURIComponent(login.getAttribute("href")!)).toContain(`/pages/groups/apply?locale=ko&pass=${pass}`);
  expect(state.request).not.toHaveBeenCalled();
});
