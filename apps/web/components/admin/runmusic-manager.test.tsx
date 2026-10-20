import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RunmusicManager, toRunmusicKstInput, fromRunmusicKstInput } from "./runmusic-manager";
const { auth, session } = vi.hoisted(() => ({
  auth: { user: { id: "admin" }, getAccessToken: vi.fn(async () => "token") },
  session: { status: "authorized", admin: { role: "admin", email: "admin@example.test" } },
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => session }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("./admin-access-state", () => ({ AdminAccessState: ({ status }: { status: string }) => <p>{status}</p> }));
const campaign = { slug: "runmusic-2026", published: true, registrationOpensAt: "2026-10-20T00:00:00+09:00", registrationClosesAt: "2026-10-24T00:00:00+09:00", eventStartsAt: "2026-10-24T17:00:00+09:00", eventEndsAt: "2026-10-24T19:00:00+09:00", prizeCount: 100, prizeLabel: "스타벅스 1만원", drawn: false, resultsPublished: false };
const summary = { campaign, revision: 3, participantCount: 60, drawId: null, winnerCount: 0, receivedCount: 0 };
const fetchMock = vi.fn();
beforeEach(() => {
  session.status = "authorized"; session.admin.role = "admin"; auth.getAccessToken.mockReset().mockResolvedValue("token");
  fetchMock.mockReset().mockResolvedValue(Response.json(summary)); vi.stubGlobal("fetch", fetchMock);
});
describe("RUN&MUSIC administration", () => {
  it("converts KST input explicitly regardless of the computer timezone", () => {
    expect(toRunmusicKstInput("2026-10-24T08:00:00Z")).toBe("2026-10-24T17:00");
    expect(fromRunmusicKstInput("2026-10-24T17:00")).toBe("2026-10-24T08:00:00.000Z");
  });
  it("gates requests behind existing admin authorization", () => {
    session.status = "denied"; render(<RunmusicManager locale="ko" />);
    expect(screen.getByText("denied")).toBeInTheDocument(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("saves KST times with the current expected revision", async () => {
    render(<RunmusicManager locale="ko" />); await screen.findByRole("heading", { name: "운영 설정" });
    fireEvent.change(screen.getByLabelText("당일 참여 시작 (KST)"), { target: { value: "2026-10-24T18:00" } });
    fetchMock.mockResolvedValueOnce(Response.json({ ...summary, revision: 4 }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" })); await screen.findByRole("status");
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ expectedRevision: 3, eventStartsAt: "2026-10-24T09:00:00.000Z", prizeCount: 100 });
  });
  it("explains settings conflicts without claiming a save", async () => {
    render(<RunmusicManager locale="ko" />); await screen.findByRole("heading", { name: "운영 설정" });
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "RUNMUSIC_CONFLICT" } }, { status: 409 }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("다른 관리자가 설정을 변경했어요");
    expect(screen.queryByText("저장했어요.")).not.toBeInTheDocument();
  });
  it("publishes a completed draw without resubmitting disabled times", async () => {
    const drawn = { ...summary, campaign: { ...campaign, drawn: true }, drawId: "10000000-0000-4000-8000-000000000001", winnerCount: 60 };
    fetchMock.mockResolvedValueOnce(Response.json(drawn)); render(<RunmusicManager locale="ko" />);
    await screen.findByRole("heading", { name: "추첨 완료" }); expect(screen.getByLabelText("당일 참여 시작 (KST)")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("결과 공개")); fetchMock.mockResolvedValueOnce(Response.json({ ...drawn, revision: 4, campaign: { ...drawn.campaign, resultsPublished: true } }));
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" })); await screen.findByRole("status");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ expectedRevision: 3, published: true, resultsPublished: true });
  });
  it("requires a separate confirmation and keeps the draw request key on retry", async () => {
    render(<RunmusicManager locale="ko" />); const button = await screen.findByRole("button", { name: "추첨 실행" });
    expect(button).toBeDisabled(); fireEvent.click(screen.getByLabelText(/참여를 마감하고 추첨을 실행/));
    fetchMock.mockRejectedValueOnce(new TypeError("network")); fireEvent.click(button); await screen.findByRole("alert");
    const key = JSON.parse(fetchMock.mock.calls[1][1].body).requestKey;
    fetchMock.mockResolvedValueOnce(Response.json({ ...summary, drawId: "10000000-0000-4000-8000-000000000001", campaign: { ...campaign, drawn: true } }));
    fireEvent.click(button); await screen.findByRole("heading", { name: "추첨 완료" });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).requestKey).toBe(key);
  });
  it("prevents viewer mutations and records a winner receipt for writable admins", async () => {
    const published = { ...summary, drawId: "10000000-0000-4000-8000-000000000001", campaign: { ...campaign, drawn: true, resultsPublished: true } };
    fetchMock.mockResolvedValueOnce(Response.json(published)); render(<RunmusicManager locale="ko" />);
    await screen.findByRole("heading", { name: "추첨 완료" });
    fireEvent.change(screen.getByLabelText("당첨자의 수령 확인 번호"), { target: { value: "10000000-0000-4000-8000-000000000002" } });
    fetchMock.mockResolvedValueOnce(Response.json({ receivedAt: "2026-10-24T10:30:00Z", replayed: false }));
    fireEvent.click(screen.getByRole("button", { name: "수령 완료 처리" }));
    expect(await screen.findByRole("status")).toHaveTextContent("수령 확인을 기록했어요.");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ receiptId: "10000000-0000-4000-8000-000000000002" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
  it("shows viewer settings as read-only", async () => {
    session.admin.role = "viewer"; render(<RunmusicManager locale="ko" />); await screen.findByRole("heading", { name: "운영 설정" });
    expect(screen.getByRole("button", { name: "설정 저장" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "현장 코드 변경" })).toBeDisabled();
  });
});
