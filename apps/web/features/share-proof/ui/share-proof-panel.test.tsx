// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";

const h = vi.hoisted(() => ({ authenticated: true, list: { items: [] as unknown[] }, request: vi.fn(), toast: vi.fn(), burst: vi.fn(), replace: vi.fn(), push: vi.fn(), search: "tab=certifications&share=1&locale=ko" }));
vi.mock("@/features/groups/ui/use-group-resource", () => {
  class GroupRequestError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
  return { GroupRequestError, useGroupRequest: () => ({ request: h.request, authenticated: h.authenticated, ready: true, ownerKey: "u:1" }),
    useGroupResource: (url: string | null, parse: (value: unknown) => unknown) => ({ data: url ? parse(h.list) : undefined, loading: false, retry: vi.fn() }) };
});
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ DukjilProvider: ({ children }: { children: import("react").ReactNode }) => <>{children}</>,
  useDukjil: () => ({ status: "on", catalog: { rules: { share: { points: 10, dailyLimit: 3 } } }, today: { policyActive: true, actions: { share: { count: 1, points: 10, remaining: 2, stamped: true } } } }) }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: h.toast }));
vi.mock("@/components/fan-ui/point-reward-burst", () => ({ usePointRewardBurst: () => ({ burst: null, add: h.burst, clear: vi.fn() }), PointRewardBurst: () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/elina", useSearchParams: () => new URLSearchParams(h.search), useRouter: () => ({ replace: h.replace, push: h.push }) }));
import { ShareProofHistoryRows, ShareProofTile } from "./share-proof-panel";
import { shareProofCopy } from "./share-proof-copy";

beforeEach(() => { h.authenticated = true; h.list = { items: [] }; h.request.mockReset(); h.toast.mockReset(); h.burst.mockReset(); h.replace.mockReset(); h.search = "tab=certifications&share=1&locale=ko"; });
afterEach(cleanup);
const field = () => screen.getByLabelText("2. SNS에 올린 게시물 주소");
const XURL = "https://x.com/fan/status/1850000000000000001";
const own = () => fireEvent.click(screen.getByRole("checkbox", { name: "내가 직접 올린 게시물이에요" }));

it("is a tile of the 인증 list with today's share count, opening the proof dialog in the address", () => {
  h.search = "tab=certifications&locale=ko";
  render(<ShareProofTile slug="elina" locale="ko" />);
  const tile = screen.getByRole("link", { name: /SNS 공유 인증/ });
  expect(tile).toHaveAttribute("href", "/elina?tab=certifications&locale=ko&share=1");
  expect(tile).toHaveTextContent("오늘 1/3 · +10P");
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("checks the address on the device first and names a profile address as the problem", async () => {
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: "https://www.instagram.com/elina_official/" } });
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("게시물 주소가 아니에요");
  fireEvent.change(field(), { target: { value: "https://vm.tiktok.com/ZMabc123/" } });
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("단축 주소는 받지 않아요");
  expect(h.request).not.toHaveBeenCalled();
});

it("asks for the own-post confirmation before sending", async () => {
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: XURL } });
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("직접 올린 게시물인지 확인해 주세요.");
  expect(h.request).not.toHaveBeenCalled();
});

it("submits a confirmed post address, asks for the official tag and says the request is waiting for confirmation instead of showing points", async () => {
  h.request.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", replayed: false, status: "pending" });
  render(<ShareProofTile slug="elina" locale="ko" />);
  expect(screen.getByText("게시물에 @kyaa_app을 태그해 주세요.")).toBeInTheDocument();
  fireEvent.change(field(), { target: { value: XURL } }); own();
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "인증을 요청했어요. 확인되면 포인트가 들어와요.", tone: "success" }));
  expect(h.request).toHaveBeenCalledWith("/api/me/share-proofs", { method: "POST", body: JSON.stringify({ creator: "elina", url: XURL, ownPost: true }) });
  expect(h.burst).not.toHaveBeenCalled();
  expect(field()).toHaveValue("");
});

it.each([["SHARE_PROOF_URL_SHORT", "단축 주소는 받지 않아요"], ["SHARE_PROOF_URL_REUSED", "다른 회원이 이미 인증을 요청한 게시물이에요."], ["PASSPORT_REQUIRED", "패스포트가 있어야"], ["SHARE_PROOF_UNAVAILABLE", "인증하지 못했어요"]])("explains %s", async (code, line) => {
  const { GroupRequestError } = await import("@/features/groups/ui/use-group-resource");
  h.request.mockRejectedValue(new GroupRequestError(409, code));
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: XURL } }); own();
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(line);
});

it("says a repeated own post was already sent", async () => {
  h.request.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", replayed: true, status: "pending" });
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: XURL } }); own();
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "이미 인증한 게시물이에요.", tone: "neutral" }));
});

it("keeps the dialog for a signed-out fan with a sign-in action and no list read", () => {
  h.authenticated = false;
  render(<ShareProofTile slug="elina" locale="ko" />);
  expect(screen.getByRole("dialog", { name: "SNS 공유 인증" })).toBeInTheDocument();
  expect(field()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "로그인하고 인증하기" }));
  expect(h.push).toHaveBeenCalledWith(expect.stringContaining("/login"));
  expect(h.push.mock.calls[0][0]).toContain(encodeURIComponent("share=1"));
});

it("lists own proofs in the dialog and as rows of the 인증 history", () => {
  h.list = { items: [{ id: "33333333-3333-4333-8333-333333333333", platform: "instagram", url: "https://www.instagram.com/p/C1aBc_D-2xY/", points: 10, createdAt: "2026-11-08T09:48:11+09:00", status: "accepted" },
    { id: "44444444-4444-4444-8444-444444444444", platform: "x", url: XURL, points: 10, createdAt: "2026-11-07T09:48:11+09:00", status: "revoked" },
    { id: "55555555-5555-4555-8555-555555555555", platform: "tiktok", url: "https://www.tiktok.com/@fan/video/7430000000000000555", points: null, createdAt: "2026-11-06T09:48:11+09:00", status: "pending" },
    { id: "66666666-6666-4666-8666-666666666666", platform: "threads", url: "https://www.threads.net/@fan/post/DAbC12xYz9", points: null, createdAt: "2026-11-05T09:48:11+09:00", status: "rejected" }] };
  render(<ShareProofTile slug="elina" locale="ko" />);
  const link = screen.getByRole("link", { name: "인스타그램" });
  expect(link).toHaveAttribute("href", "https://www.instagram.com/p/C1aBc_D-2xY/");
  expect(screen.getByRole("link", { name: "X" }).closest("li")).toHaveTextContent("운영자 취소");
  expect(screen.getByRole("link", { name: "틱톡" }).closest("li")).toHaveTextContent("확인 중");
  expect(screen.getByRole("link", { name: "스레드" }).closest("li")).toHaveTextContent("인증 안 됨");
  expect(link).toHaveAttribute("data-outbound-tracking", "off");
  cleanup();
  h.search = "tab=certifications&locale=ko";
  render(<ShareProofHistoryRows slug="elina" locale="ko" classes={{ row: "row", copy: "copy", status: "status" }} empty={<p>없음</p>} />);
  const rows = screen.getAllByRole("link", { name: /SNS 공유 인증/ });
  expect(rows[0]).toHaveTextContent("+10P");
  expect(rows[1]).toHaveTextContent("운영자 취소");
  expect(rows[2]).toHaveTextContent("확인 중");
  expect(rows[2].querySelector("span:last-child")).toHaveAttribute("data-status", "pending");
  expect(screen.queryByText("없음")).toBeNull();
});

it("has every line in every locale", () => {
  for (const locale of APP_LOCALES) expect(Object.values(shareProofCopy(locale)).every(value => typeof value === "function" ? value("1", "3") : value)).toBe(true);
});
