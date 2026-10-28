import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissionBuilder } from "./mission-builder";

const getAccessToken = vi.fn(async () => "token");
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ getAccessToken }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/lives/live-1/missions",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("./use-admin-session", () => ({
  useAdminSession: () => ({ status: "authorized", admin: { email: "ops@byus.test", role: "operator" } }),
}));

describe("MissionBuilder", () => {
  beforeEach(() => {
    getAccessToken.mockClear();
  });

  it("renders inside the admin shell with usable controls and a truthful empty state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ missions: [] })));
    const { container } = render(<MissionBuilder liveEventId="live-1" />);

    expect(await screen.findByText("아직 집계된 미션 통계가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "미션 빌더" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "미션 유형" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초안 만들기" })).toBeDisabled();
    expect(container.querySelector("main main")).toBeNull();
  });

  it("sends explicit mixed option policies on create and update", async () => {
    const bodies: Array<{ command: string; questions: Array<{ options: Array<{ preserveOriginal: boolean }> }> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      if (init?.method === "POST") { bodies.push(JSON.parse(String(init.body))); return Response.json({ missionId: "10000000-0000-4000-8000-000000000001" }); }
      return Response.json({ missions: [] });
    }));
    render(<MissionBuilder liveEventId="live-1" />);
    await screen.findByText("아직 집계된 미션 통계가 없습니다.");
    for (const [name, value] of [["제목", "투표"], ["Title", "Vote"], ["질문", "무엇을 고를까요?"], ["Question", "Choose one"], ["선택지 1", "Love Rat"], ["Option 1", "Love Rat"], ["선택지 2", "다음 작품"], ["Option 2", "Next artwork"], ["공개 시작", "2026-10-01T10:00"], ["공개 종료", "2026-10-02T10:00"]]) {
      fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
    }
    const policies = screen.getAllByRole("checkbox", { name: "곡명·작품명 원문 유지" });
    expect(policies[0]).not.toBeChecked();
    fireEvent.click(policies[0]);
    fireEvent.click(screen.getByRole("button", { name: "초안 만들기" }));
    await screen.findByText("미션 초안을 만들었습니다.");
    fireEvent.click(screen.getByRole("button", { name: "초안 수정" }));
    await screen.findByText("미션 초안을 수정했습니다.");
    expect(bodies.map(body => body.questions[0].options.map(option => option.preserveOriginal))).toEqual([[true, false], [true, false]]);
  });

  it("separates a statistics failure from an empty result and retries", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ missions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MissionBuilder liveEventId="live-1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("미션 통계를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("아직 집계된 미션 통계가 없습니다.")).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
