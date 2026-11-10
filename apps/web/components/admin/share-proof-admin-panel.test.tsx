// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ShareProofAdminPanel } from "./share-proof-admin-panel";

const ID = "33333333-3333-4333-8333-333333333333", MEMBER = "11111111-1111-4111-8111-111111111111";
const row = (extra: Record<string, unknown> = {}) => ({ id: ID, createdAt: "2026-11-11T10:00:00+09:00", status: "pending", platform: "instagram", url: "https://www.instagram.com/p/C1aBc_D-2xY/", postId: "C1aBc_D-2xY", points: null,
  creator: { slug: "elina", name: "엘리나" }, member: { id: MEMBER, nickname: "팬" }, duplicateCount: 0, revision: 0, rejectCode: null, revokedAt: null, revokeResult: null, ...extra });
const answer = (rows: unknown[], review?: unknown) => vi.fn(async (url: string, method?: string) => method === "POST" ? { ok: true, status: 200, data: { result: review } } : { ok: true, status: 200, data: { items: rows, hasMore: false } });
afterEach(cleanup);

it("lists the proofs waiting for a decision with the official tag to check, and approves one", async () => {
  const request = answer([row()], { id: ID, status: "accepted", replayed: false, reward: { points: 10 } });
  render(<ShareProofAdminPanel locale="ko" request={request as never} canWrite />);
  expect(await screen.findByText("@kyaa_app 태그 확인")).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith("/api/admin/share-proofs?status=pending");
  fireEvent.click(screen.getByRole("button", { name: "승인하고 지급" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/admin/share-proofs/${ID}/review`, "POST", { decision: "accept", revision: 0 }));
  expect(await screen.findByRole("status")).toHaveTextContent("승인하고 10P를 지급했습니다.");
});

it("rejects with the chosen reason", async () => {
  const request = answer([row()], { id: ID, status: "rejected", replayed: false });
  render(<ShareProofAdminPanel locale="ko" request={request as never} canWrite />);
  fireEvent.change(await screen.findByRole("combobox", { name: "반려 사유" }), { target: { value: "unrelated" } });
  fireEvent.click(screen.getByRole("button", { name: "반려" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith(`/api/admin/share-proofs/${ID}/review`, "POST", { decision: "reject", revision: 0, rejectCode: "unrelated" }));
});

it("cannot approve a post on a network whose official account is not confirmed", async () => {
  const tiktok = answer([row({ platform: "tiktok", url: "https://www.tiktok.com/@fan/video/7430000000000000555" })]) as never;
  render(<ShareProofAdminPanel locale="ko" request={tiktok} canWrite />);
  expect(await screen.findByText("공식 계정을 확인하지 못해 승인할 수 없습니다.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "승인하고 지급" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "반려" })).toBeEnabled();
});

it("offers a payout retry for an accepted proof that was never paid, and no decision to a viewer", async () => {
  const unpaid = answer([row({ status: "accepted", points: null })]) as never, waiting = answer([row()]) as never;
  render(<ShareProofAdminPanel locale="ko" request={unpaid} canWrite />);
  expect(await screen.findByRole("button", { name: "지급 다시 시도" })).toBeEnabled();
  cleanup();
  render(<ShareProofAdminPanel locale="ko" request={waiting} canWrite={false} />);
  await screen.findByText("@kyaa_app 태그 확인");
  expect(screen.queryByRole("button", { name: "승인하고 지급" })).toBeNull();
});
