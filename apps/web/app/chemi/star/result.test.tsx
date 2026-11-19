import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "./reading.fixture.json";
import { StarChart } from "./chart";
import { StarResult } from "./result";
import type { StarReading } from "./reading";

const { toast, celebrate, getAccessToken } = vi.hoisted(() => ({
  toast: vi.fn(),
  celebrate: vi.fn(),
  getAccessToken: vi.fn(async () => "session"),
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, login: vi.fn(), user: { id: "member" }, getAccessToken }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: celebrate }));

const reading = { ...fixture, replayed: true } as unknown as StarReading;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows the four areas with star names, the three reasons and the sun and moon signs", () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grants: [] })));
  render(<StarResult locale="ko" reading={reading} character="changha" backHref="/chemi/star" onChart={() => {}} />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("한 박자 쉬어 가는 날");
  // 별점은 글자 이름이 있다(총운은 1440 열에도 한 번 더 있다).
  expect(screen.getAllByRole("img", { name: "돈 별점 5개 중 4개" })).toHaveLength(1);
  expect(screen.getAllByRole("img", { name: "총운 별점 5개 중 2개" }).length).toBeGreaterThan(0);
  const why = screen.getByRole("heading", { name: "왜 그런지" }).closest("section")!;
  expect(within(why).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText("오늘 가장 밝은 곳")).toBeTruthy();
  const chart = screen.getByRole("heading", { name: "내 출생 차트" }).closest("section")!;
  expect(within(chart).getByText("황소")).toBeTruthy();
  expect(within(chart).getByText("게")).toBeTruthy();
});

it("opens the full chart from the summary", () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grants: [] })));
  const onChart = vi.fn();
  render(<StarResult locale="ko" reading={reading} character="changha" backHref="/chemi/star" onChart={onChart} />);
  fireEvent.click(screen.getByRole("button", { name: /전체 보기/ }));
  expect(onChart).toHaveBeenCalledOnce();
});

it("opens the share card and copies the public URL; completion is recorded only after a successful copy", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/chemi/rewards/today") return Response.json({ grants: [] });
    if (path === "/api/chemi/shares") return Response.json({ shareId: "card", url: "/chemi/star?from=card" });
    return Response.json({});
  });
  const copy = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
  vi.stubGlobal("fetch", fetcher);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  render(<StarResult locale="ko" reading={reading} character="changha" backHref="/chemi/star" onChart={() => {}} />);
  fireEvent.click(screen.getAllByRole("button", { name: "자랑하기" })[0]!);
  const dialog = await screen.findByRole("dialog");
  const card = dialog.querySelector("[data-star-share-card]")!;
  expect(within(card as HTMLElement).getByText("한 박자 쉬어 가는 날")).toBeTruthy();
  expect(within(card as HTMLElement).getByText("황소자리")).toBeTruthy();
  expect(within(card as HTMLElement).getByText(/^“.+”$/)).toBeTruthy();
  const copyLink = within(dialog).getByRole("button", { name: "링크 복사" });
  fireEvent.click(copyLink);
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "복사하지 못했어요", tone: "error" }));
  expect(fetcher.mock.calls.some(([path]) => String(path).includes("/done"))).toBe(false);
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "링크 복사" }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "결과를 복사했어요", tone: "success" }));
  await waitFor(() => expect(fetcher.mock.calls.some(([path]) => String(path).includes("/done"))).toBe(true));
});

it("has one way out to the other fortunes, not two buttons to the same place", () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grants: [] })));
  render(<StarResult locale="ko" reading={reading} character="changha" backHref="/chemi/star" onChart={() => {}} />);
  expect(screen.queryByRole("link", { name: "다른 주제" })).toBeNull();
  expect(screen.getAllByRole("link", { name: "다른 운세 보기" })).toHaveLength(1);
});

it("tags each reason with a different area before repeating one", () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grants: [] })));
  const many = {
    ...reading,
    result: {
      ...reading.result,
      reasons: ["Moon", "Sun", "Venus", "Mercury", "Saturn"].map((body, index) => ({
        body, target: "Sun", angle: 60, hour: 10, applying: true, score: 5 - index, exitDate: "2026-11-25",
      })),
    },
  } as unknown as StarReading;
  render(<StarResult locale="ko" reading={many} character="changha" backHref="/chemi/star" onChart={() => {}} />);
  const why = screen.getByRole("heading", { name: "왜 그런지" }).closest("section")!;
  const tags = within(why).getAllByRole("listitem").map((item) => item.querySelector("[class*=tag]")?.textContent);
  expect(new Set(tags).size).toBe(3);
});

it("draws the wheel with all twelve signs and ten planets, and the chart sections", () => {
  const { container } = render(
    <StarChart locale="ko" reading={reading} character="elina" onBack={() => {}} />,
  );
  const wheel = container.querySelector("svg[role=img]")!;
  expect(wheel.querySelectorAll("text")).toHaveLength(12);
  expect(wheel.querySelectorAll("circle[r='5'], circle[r='3.5']")).toHaveLength(10);
  expect(screen.getByRole("heading", { name: "행성 10개" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "원소 · 양식" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("황소의 고집, 게의 다정함");
});
