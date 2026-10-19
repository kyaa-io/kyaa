import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadCsv } from "@/features/analytics/ui/performance-table";
import { ByusDayRsvpManager } from "./byus-day-rsvp-manager";

const { auth, session } = vi.hoisted(() => ({
  auth: { user: { id: "owner" }, getAccessToken: vi.fn(async () => "token") },
  session: { status: "authorized", admin: { email: "admin@example.com", role: "viewer" } },
}));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => session }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("./admin-access-state", () => ({ AdminAccessState: ({ status }: { status: string }) => <p>access:{status}</p> }));
vi.mock("@/features/analytics/ui/performance-table", async importOriginal => ({
  ...await importOriginal<typeof import("@/features/analytics/ui/performance-table")>(), downloadCsv: vi.fn(),
}));

const attendees = Array.from({ length: 21 }, (_, index) => ({
  id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, koreanName: `접수자 ${index}`, englishName: `Guest ${index}`,
  affiliation: index === 20 ? "특별한 소속" : "kyaa", occupation: "매니저", phone: "+821000000001",
  email: `guest${index}@example.com`, nationality: "KR", createdAt: "2026-10-07T04:00:00+00:00",
}));
const rsvpFetchMock = vi.fn();
const participationFetchMock = vi.fn();
beforeEach(() => {
  session.status = "authorized"; auth.user = { id: "owner" }; auth.getAccessToken.mockResolvedValue("token");
  rsvpFetchMock.mockReset().mockImplementation(async () => Response.json({ attendees }));
  participationFetchMock.mockReset().mockImplementation(async () => Response.json({ participants: [], nextCursor: null }));
  vi.stubGlobal("fetch", (url: string, options: RequestInit) => url.startsWith("/api/admin/kyaa-wave-participants") ? participationFetchMock(url, options) : rsvpFetchMock(url, options));
  vi.mocked(downloadCsv).mockClear();
});

describe("kyaa wave registration list", () => {
  it.each([
    ["ko", "kyaa wave 참가 신청", "kyaa wave 참가 신청 명단을 확인하세요."],
    ["en", "kyaa wave registrations", "View the people registered for kyaa wave."],
  ] as const)("shows the event name in %s", async (locale, title, description) => {
    render(<ByusDayRsvpManager locale={locale} />);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it.each(["ko", "en"] as const)("exports the entire roster despite search and pagination in %s", async locale => {
    rsvpFetchMock.mockResolvedValueOnce(Response.json({ attendees: [
      { ...attendees[0], affiliation: '회사, "이름"\n둘째 줄', occupation: "=SUM(1,2)" }, ...attendees.slice(1),
    ] }));
    render(<ByusDayRsvpManager locale={locale} />);
    const button = screen.getByRole("button", { name: locale === "ko" ? "전체 명단 CSV" : "Export all to CSV" });
    expect(button).toBeDisabled();
    await screen.findByText("접수자 0");
    fireEvent.click(screen.getByRole("button", { name: locale === "ko" ? "다음 페이지" : "Next page" }));
    fireEvent.click(button);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는 검색어" } });
    fireEvent.click(button);
    expect(downloadCsv).toHaveBeenCalledTimes(2);
    const [filename, csv] = vi.mocked(downloadCsv).mock.calls[0];
    expect(filename).toBe("byus-day-rsvps.csv");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain(locale === "ko" ? '"한글 이름","영문 이름"' : '"Korean name","English name"');
    for (const attendee of attendees) expect(csv).toContain(`"${attendee.koreanName}"`);
    expect(csv).toContain('"회사, ""이름""\n둘째 줄"');
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('"\'+821000000001"');
    expect(csv).toContain("13:00");
    expect(csv).not.toContain(attendees[0].id);
    expect(vi.mocked(downloadCsv).mock.calls[1][1]).toBe(csv);
  });
  it("shows the registered names and KST dates, searches across all pages and refreshes", async () => {
    render(<ByusDayRsvpManager locale="ko" />);
    expect(await screen.findByText("접수자 0")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(21);
    expect(screen.getAllByText("13:00")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    expect(screen.getByText("접수자 20")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "GUEST0@EXAMPLE.COM" } });
    expect(screen.getByText("접수자 0")).toBeInTheDocument();
    expect(screen.queryByText("접수자 20")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "특별한 소속" } });
    expect(screen.getByText("접수자 20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() => expect(rsvpFetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("접수자 20")).toBeInTheDocument();
    expect(rsvpFetchMock).toHaveBeenCalledWith("/api/admin/byus-day-rsvps", expect.objectContaining({ cache: "no-store", headers: { authorization: "Bearer token" } }));
  });
  it("handles English empty, error and retry states", async () => {
    rsvpFetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 })).mockResolvedValueOnce(Response.json({ attendees: [] }));
    render(<ByusDayRsvpManager locale="en" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Registrations could not be loaded.");
    expect(screen.getByRole("button", { name: "Export all to CSV" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No one has registered yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export all to CSV" })).toBeDisabled();
  });
  it("clears a search with no results", async () => {
    render(<ByusDayRsvpManager locale="ko" />);
    await screen.findByText("접수자 0");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "없는 검색어" } });
    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.getByText("접수자 0")).toBeInTheDocument();
  });
  it("does not request data without an authorized session", () => {
    session.status = "unauthenticated";
    render(<ByusDayRsvpManager locale="ko" />);
    expect(screen.getByText("access:unauthenticated")).toBeInTheDocument();
    expect(rsvpFetchMock).not.toHaveBeenCalled();
  });
  it("removes attendee data when access is revoked on refresh", async () => {
    render(<ByusDayRsvpManager locale="ko" />);
    await screen.findByText("접수자 0");
    rsvpFetchMock.mockResolvedValueOnce(Response.json({}, { status: 403 }));
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    expect(await screen.findByText("access:denied")).toBeInTheDocument();
    expect(screen.queryByText("접수자 0")).not.toBeInTheDocument();
  });
  it("unmounts the previous attendee list when the signed-in user changes", async () => {
    const { rerender } = render(<ByusDayRsvpManager locale="ko" />);
    await screen.findByText("접수자 0");
    auth.user = { id: "next-owner" };
    rsvpFetchMock.mockReturnValueOnce(new Promise(() => {}));
    rerender(<ByusDayRsvpManager locale="ko" />);
    expect(screen.queryByText("접수자 0")).not.toBeInTheDocument();
  });
});


describe("separate private participation list", () => {
  const participant = { id: "20000000-0000-4000-8000-000000000001", name: "참여 확인 성함", createdAt: "2026-10-22T10:00:00Z" };
  it("shows confirmations separately and follows the server cursor", async () => {
    participationFetchMock.mockResolvedValueOnce(Response.json({ participants: [participant], nextCursor: "next-page" }))
      .mockResolvedValueOnce(Response.json({ participants: [{ ...participant, name: "다음 확인 성함" }], nextCursor: null }));
    render(<ByusDayRsvpManager locale="ko" />);
    await screen.findByText(participant.name); await screen.findByText("접수자 0");
    const region = screen.getByRole("table", { name: "참여 확인" });
    expect(within(region).getByText(participant.name)).toBeInTheDocument();
    expect(within(region).queryByText("접수자 0")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 참여 명단" }));
    await screen.findByText("다음 확인 성함");
    expect(participationFetchMock).toHaveBeenLastCalledWith("/api/admin/kyaa-wave-participants?cursor=next-page", expect.objectContaining({ cache: "no-store", headers: { authorization: "Bearer token" } }));
    expect(screen.queryByText(participant.name)).not.toBeInTheDocument();
    expect(screen.getByText("접수자 0")).toBeInTheDocument();
  });
  it("retries a participation read without refreshing RSVPs", async () => {
    participationFetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    render(<ByusDayRsvpManager locale="en" />);
    const alert = await screen.findByRole("alert"); expect(alert).toHaveTextContent("Participation confirmations could not be loaded.");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByText("No participation confirmations yet."); expect(rsvpFetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not reveal participation names after access denial", async () => {
    participationFetchMock.mockResolvedValueOnce(Response.json({ participants: [participant], nextCursor: null }));
    render(<ByusDayRsvpManager locale="ko" />); await screen.findByText(participant.name);
    participationFetchMock.mockResolvedValueOnce(Response.json({}, { status: 403 }));
    fireEvent.click(screen.getByRole("button", { name: "참여 명단 새로고침" }));
    await screen.findByText("access:denied"); expect(screen.queryByText(participant.name)).not.toBeInTheDocument();
  });
});
