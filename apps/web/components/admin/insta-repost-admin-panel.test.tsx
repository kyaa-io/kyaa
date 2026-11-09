// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InstaRepostAdminPanel } from "./insta-repost-admin-panel";

const ID = "33333333-3333-4333-8333-333333333333", MEMBER = "11111111-1111-4111-8111-111111111111";
const row = (extra: Record<string, unknown> = {}) => ({ id: ID, submittedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), status: "pending", postKind: "story", url: null, hasCapture: true, revision: 2,
  creator: { slug: "elina", name: "엘리나" }, member: { id: MEMBER, nickname: "팬1" }, duplicateCount: 1, rejectCode: null, reviewedAt: null, reviewerRole: null, payResult: null,
  points: null, approvedAt: null, clawedBack: false, revokedAt: null, revokeResult: null, ...extra });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("lists pending reposts oldest first with their waiting time, and approves with the revision it showed", async () => {
  const request = vi.fn(async (url: string) => url.startsWith("/api/admin/insta-reposts?")
    ? { ok: true, status: 200, data: { items: [row()], hasMore: false } }
    : { ok: true, status: 200, data: { result: { id: ID, status: "accepted", points: 30, payResult: "paid", revision: 2 } } });
  render(<InstaRepostAdminPanel locale="ko" request={request} requestImage={vi.fn()} canWrite />);
  const item = await screen.findByText("엘리나");
  expect(item.closest("li")).toHaveTextContent("5시간 지남");
  expect(item.closest("li")).toHaveTextContent("같은 게시물 1명");
  expect(request).toHaveBeenCalledWith("/api/admin/insta-reposts?status=pending");
  fireEvent.click(screen.getByRole("button", { name: "승인" }));
  await screen.findByText("30P 지급");
  expect(request).toHaveBeenCalledWith(`/api/admin/insta-reposts/${ID}/review`, "POST", { decision: "accept", revision: 2 });
});

it("rejects with the chosen reason and says why a review was refused", async () => {
  const request = vi.fn(async (url: string, method?: string) => method === "POST"
    ? { ok: false, status: 403, data: { error: { code: "SELF_REVIEW_FORBIDDEN" } } }
    : { ok: true, status: 200, data: { items: [row()], hasMore: false } });
  render(<InstaRepostAdminPanel locale="ko" request={request} requestImage={vi.fn()} canWrite />);
  await screen.findByText("엘리나");
  fireEvent.change(screen.getByRole("combobox", { name: "반려 사유" }), { target: { value: "private_account" } });
  fireEvent.click(screen.getByRole("button", { name: "반려" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("본인 리포스트는 확인할 수 없습니다.");
  expect(request).toHaveBeenCalledWith(`/api/admin/insta-reposts/${ID}/review`, "POST", { decision: "reject", revision: 2, rejectCode: "private_account" });
});

it("opens the story capture from the authorized bytes, and offers no decision to a viewer", async () => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:capture-1");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const requestImage = vi.fn(async () => new Blob(["png"], { type: "image/png" }));
  const request = vi.fn(async () => ({ ok: true, status: 200, data: { items: [row()], hasMore: false } }));
  render(<InstaRepostAdminPanel locale="ko" request={request} requestImage={requestImage} canWrite={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "캡처 보기" }));
  await waitFor(() => expect(screen.getByAltText("캡처 보기")).toHaveAttribute("src", "blob:capture-1"));
  expect(requestImage).toHaveBeenCalledWith(`/api/admin/insta-reposts/${ID}/capture`);
  expect(screen.queryByRole("button", { name: "승인" })).toBeNull();
});

it("shows what an approval paid and lets an admin revoke it with a reason", async () => {
  const request = vi.fn(async (url: string) => url.includes("/revoke")
    ? { ok: true, status: 200, data: { result: { id: ID, replayed: false, result: "corrected" } } }
    : { ok: true, status: 200, data: { items: [row({ status: "accepted", payResult: "month_cap", points: 0, hasCapture: false, url: "https://www.instagram.com/p/C1aBc_D-2xY/" })], hasMore: false } });
  render(<InstaRepostAdminPanel locale="ko" request={request} requestImage={vi.fn()} canWrite />);
  expect(await screen.findByText("이번 달 지급 한도로 0P")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "회수 사유" }), { target: { value: "게시물 삭제 확인" } });
  fireEvent.click(screen.getByRole("button", { name: "회수" }));
  expect(await screen.findByRole("status")).toHaveTextContent("회수했습니다.");
  expect(request).toHaveBeenCalledWith(`/api/admin/share-proofs/${ID}/revoke`, "POST", { reason: "게시물 삭제 확인" });
});
