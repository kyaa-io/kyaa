// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";

const h = vi.hoisted(() => ({ authenticated: true, list: { items: [] as unknown[] }, request: vi.fn(), toast: vi.fn(), burst: vi.fn(), replace: vi.fn(), search: "tab=certifications&share=1&locale=ko" }));
vi.mock("@/features/groups/ui/use-group-resource", () => {
  class GroupRequestError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
  return { GroupRequestError, useGroupRequest: () => ({ request: h.request, authenticated: h.authenticated, ready: true, ownerKey: "u:1" }),
    useGroupResource: (url: string | null, parse: (value: unknown) => unknown) => ({ data: url ? parse(h.list) : undefined, loading: false, retry: vi.fn() }) };
});
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ DukjilProvider: ({ children }: { children: import("react").ReactNode }) => <>{children}</>,
  useDukjil: () => ({ status: "on", catalog: { rules: { share: { points: 10, dailyLimit: 3 } } }, today: { policyActive: true, actions: { share: { count: 1, points: 10, remaining: 2, stamped: true } } } }) }));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: h.toast }));
vi.mock("@/components/fan-ui/point-reward-burst", () => ({ usePointRewardBurst: () => ({ burst: null, add: h.burst, clear: vi.fn() }), PointRewardBurst: () => null }));
vi.mock("@/features/my/ui/guest-login", () => ({ GuestLoginAction: () => <a href="/login">로그인</a> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/elina", useSearchParams: () => new URLSearchParams(h.search), useRouter: () => ({ replace: h.replace, push: vi.fn() }) }));
import { ShareProofHistoryRows, ShareProofTile } from "./share-proof-panel";
import { shareProofCopy } from "./share-proof-copy";

beforeEach(() => { h.authenticated = true; h.list = { items: [] }; h.request.mockReset(); h.toast.mockReset(); h.burst.mockReset(); h.replace.mockReset(); h.search = "tab=certifications&share=1&locale=ko"; });
afterEach(cleanup);
const field = () => screen.getByLabelText("2. SNS에 올린 글 주소");

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
  expect(await screen.findByRole("alert")).toHaveTextContent("프로필 주소는 인증되지 않아요");
  expect(h.request).not.toHaveBeenCalled();
});

it("submits a post address and celebrates the server's grant", async () => {
  h.request.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", replayed: false, reward: { points: 10, stamps: 1 } });
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: "https://x.com/fan/status/1" } });
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  await waitFor(() => expect(h.burst).toHaveBeenCalledWith(10));
  expect(h.request).toHaveBeenCalledWith("/api/me/share-proofs", { method: "POST", body: JSON.stringify({ creator: "elina", url: "https://x.com/fan/status/1" }) });
  expect(field()).toHaveValue("");
});

it.each([["SHARE_PROOF_URL_USED", "이미 인증에 쓰인 글이에요."], ["PASSPORT_REQUIRED", "패스포트가 있어야"], ["SHARE_PROOF_UNAVAILABLE", "인증하지 못했어요"]])("explains %s", async (code, line) => {
  const { GroupRequestError } = await import("@/features/groups/ui/use-group-resource");
  h.request.mockRejectedValue(new GroupRequestError(409, code));
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: "https://x.com/fan/status/1" } });
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(line);
});

it("says the daily cap in the shared toast when the proof paid nothing", async () => {
  h.request.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", replayed: false, rewardSkipped: "daily_limit" });
  render(<ShareProofTile slug="elina" locale="ko" />);
  fireEvent.change(field(), { target: { value: "https://x.com/fan/status/1" } });
  fireEvent.click(screen.getByRole("button", { name: "인증하기" }));
  await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "인증은 됐어요. 오늘 공유 포인트는 모두 받았어요.", tone: "neutral" }));
  expect(h.burst).not.toHaveBeenCalled();
});

it("keeps the dialog for a signed-out fan with a sign-in action and no list read", () => {
  h.authenticated = false;
  render(<ShareProofTile slug="elina" locale="ko" />);
  expect(screen.getByRole("dialog", { name: "SNS 공유 인증" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인" })).toBeInTheDocument();
  expect(field()).toBeDisabled();
});

it("lists own proofs in the dialog and as rows of the 인증 history", () => {
  h.list = { items: [{ id: "33333333-3333-4333-8333-333333333333", platform: "instagram", url: "https://www.instagram.com/p/C1abc/", points: 10, createdAt: "2026-11-08T09:48:11+09:00" }] };
  render(<ShareProofTile slug="elina" locale="ko" />);
  const link = screen.getByRole("link", { name: "인스타그램" });
  expect(link).toHaveAttribute("href", "https://www.instagram.com/p/C1abc/");
  expect(link).toHaveAttribute("data-outbound-tracking", "off");
  cleanup();
  h.search = "tab=certifications&locale=ko";
  render(<ShareProofHistoryRows slug="elina" locale="ko" classes={{ row: "row", copy: "copy", status: "status" }} empty={<p>없음</p>} />);
  expect(screen.getByRole("link", { name: /SNS 공유 인증/ })).toHaveTextContent("+10P");
  expect(screen.queryByText("없음")).toBeNull();
});

it("has every line in every locale", () => {
  for (const locale of APP_LOCALES) expect(Object.values(shareProofCopy(locale)).every(value => typeof value === "function" ? value("1", "3") : value)).toBe(true);
});
