import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunmusicManager } from "./runmusic-manager";
const { auth, session } = vi.hoisted(() => ({
  auth: { user: { id: "admin" }, getAccessToken: vi.fn(async () => "token") },
  session: { status: "authorized", admin: { role: "admin", email: "admin@example.test" } },
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => session }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./admin-access-state", () => ({ AdminAccessState: ({ status }: { status: string }) => <p>{status}</p> }));
const campaign = { slug: "runmusic-2026", published: true, entryOpensAt: "2026-10-20T00:00:00+09:00", entryClosesAt: "2026-10-24T23:59:00+09:00", resultsAt: "2026-10-24T23:59:00+09:00", prizes: [
  { code: "andong_yogurt_1l", label: "안동 요거트 1L", count: 15, imageUrl: "/images/runmusic/andong-yogurt-1l.png" },
  { code: "starbucks_10000", label: "스타벅스 1만원", count: 150, imageUrl: "/images/kyaa-wave/starbucks-10000-voucher.jpg" },
], drawn: false, resultsPublished: false };
const winner = { appUserId: "10000000-0000-4000-8000-000000000001", prizeCode: "andong_yogurt_1l", receiptId: "10000000-0000-4000-8000-000000000002", receivedAt: null, contactSaved: true, contactMasked: "my***ao" };
const summary = { campaign, revision: 3, participantCount: 60, drawId: null, winnerCount: 0, receivedCount: 0, autoPublishEnabled: false, winners: [], delivery: { pending: 0, sent: 0, failed: 0, skipped: 0 } };
const drawn = { ...summary, campaign: { ...campaign, drawn: true, resultsPublished: true }, drawId: "10000000-0000-4000-8000-000000000003", winnerCount: 1, winners: [winner], delivery: { pending: 1, sent: 0, failed: 0, skipped: 0 } };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-25T00:00:00+09:00"));
  session.status = "authorized"; session.admin.role = "admin"; auth.user = { id: "admin" }; auth.getAccessToken.mockReset().mockResolvedValue("token");
  fetchMock.mockReset().mockImplementation(async () => Response.json(summary)); vi.stubGlobal("fetch", fetchMock);
});
describe("RUN&MUSIC administration", () => {
  it("gates requests behind existing admin authorization", () => {
    session.status = "denied"; render(<RunmusicManager locale="ko" />);
    expect(screen.getByText("denied")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows fixed dates and prize counts and saves only the two supported flags", async () => {
    render(<RunmusicManager locale="ko" />); await screen.findByRole("heading", { name: "운영 설정" });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument(); expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByText("안동 요거트 1L · 15")).toBeInTheDocument(); expect(screen.getByText("스타벅스 1만원 · 150")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("마감 시 자동 추첨·결과 공개"));
    fetchMock.mockResolvedValueOnce(Response.json({ ...summary, revision: 4, autoPublishEnabled: true }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" })); await screen.findByRole("status");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ expectedRevision: 3, published: true, autoPublishEnabled: true });
  });
  it("explains settings conflicts without claiming a save", async () => {
    render(<RunmusicManager locale="ko" />); await screen.findByRole("heading", { name: "운영 설정" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "RUNMUSIC_CONFLICT" } }, { status: 409 }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다른 관리자가 설정을 변경했어요");
    expect(screen.queryByText("저장했어요.")).not.toBeInTheDocument();
  });
  it("prevents manual processing before the approved due time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-24T23:58:59+09:00"));
    render(<RunmusicManager locale="ko" />);
    expect(await screen.findByRole("button", { name: "결과 처리 재시도" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reuses the manual retry request key and prevents duplicate clicks", async () => {
    render(<RunmusicManager locale="ko" />); const button = await screen.findByRole("button", { name: "결과 처리 재시도" });
    fetchMock.mockRejectedValueOnce(new TypeError("network")); fireEvent.click(button); fireEvent.click(button); await screen.findByRole("alert");
    expect(fetchMock).toHaveBeenCalledTimes(2); const key = JSON.parse(fetchMock.mock.calls[1][1].body).requestKey;
    fetchMock.mockResolvedValueOnce(Response.json(drawn)); fireEvent.click(button); await screen.findByRole("heading", { name: "결과 공개 완료" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).requestKey).toBe(key);
  });
  it("reveals a masked contact only on an authenticated POST and can hide it", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(drawn)); render(<RunmusicManager locale="ko" />);
    const reveal = await screen.findByRole("button", { name: "연락처 보기" });
    expect(screen.getByText("my***ao")).toBeInTheDocument(); expect(screen.queryByText("my-kakao")).not.toBeInTheDocument();
    fetchMock.mockResolvedValueOnce(Response.json({ kakaoId: "my-kakao" })); fireEvent.click(reveal);
    expect(await screen.findByText("my-kakao")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/admin/runmusic/contact");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "POST", headers: { authorization: "Bearer token" } });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ appUserId: winner.appUserId });
    fireEvent.click(screen.getByRole("button", { name: "연락처 숨기기" })); expect(screen.queryByText("my-kakao")).not.toBeInTheDocument();
  });
  it("records receipt collection and refreshes actual delivery stats", async () => {
    fetchMock.mockResolvedValueOnce(Response.json(drawn)); render(<RunmusicManager locale="ko" />);
    const button = await screen.findByRole("button", { name: "수령 완료 처리" });
    fetchMock.mockResolvedValueOnce(Response.json({ receivedAt: "2026-10-25T10:30:00Z", replayed: false })); fireEvent.click(button);
    expect(await screen.findByRole("status")).toHaveTextContent("수령 확인을 기록했어요.");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ receiptId: winner.receiptId });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
  it("keeps viewer settings, contact reveal and receipt collection read-only", async () => {
    session.admin.role = "viewer"; fetchMock.mockResolvedValueOnce(Response.json(drawn)); render(<RunmusicManager locale="ko" />);
    expect(await screen.findByRole("button", { name: "설정 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "연락처 보기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "수령 완료 처리" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "결과 처리 재시도" })).toBeDisabled();
  });
});
