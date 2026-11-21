import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FortuneCard } from "../card/screen";
import { FortuneResult } from "../result";
import { dayCardKind } from "./copy";
import { FortuneDeep } from "./screen";

const token = vi.hoisted(() => async () => "session");
const { toast, session, login, image } = vi.hoisted(() => ({
  toast: vi.fn(),
  session: { authenticated: true },
  login: vi.fn(),
  image: { render: vi.fn(), download: vi.fn(), share: vi.fn() },
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: session.authenticated, login, user: { id: "member" }, getAccessToken: token }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: vi.fn() }));
vi.mock("../card/card-image", () => ({ renderCardImage: image.render, downloadCardImage: image.download, shareCardImage: image.share }));

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
const dayAt = (offset: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
const result = (score: number) => ({
  locked: false,
  score,
  grade: { name: "등급" },
  fields: { fandom: score, people: score - 2, money: score - 6, rest: score - 4, work: score - 1, love: score - 3 },
  periods: { morning: score + 1, afternoon: score - 2, night: score },
  evidence: { dayPillar: "기해", yearPillar: "병오", relation: "무관", stage: "쇠", spirit: "화개살", tenGod: "식신", useful: "목", timeBasis: "시주 포함" },
  luck: { color: "초록", number: 3, direction: "동", item: "나무 연필", luckyHour: { start: 9, end: 11 }, restHour: null },
});
function serve(scores: number[], extra: (path: string) => Response | undefined = () => undefined) {
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/chemi/fortune/deep")
      return Response.json({ today: TODAY, days: scores.map((score, index) => ({ day: dayAt(index), result: result(score) })) });
    return extra(path) ?? Response.json({});
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => {
  cleanup();
  session.authenticated = true;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("marks each day with exactly one kind of card", () => {
  expect([50, 59, 60, 75, 89, 90, 98].map(dayCardKind)).toEqual(["amulet", "amulet", null, null, null, "keepsake", "keepsake"]);
});

it("compares tomorrow with today and hides a difference of zero", async () => {
  serve([80, 71, 71, 60, 60, 60, 60]);
  render(<FortuneDeep view="tomorrow" character="changha" locale="ko" readingId="11111111-1111-4111-8111-111111111111" paidPreview={false} />);
  expect(await screen.findByRole("heading", { level: 1, name: "익숙한 리듬으로" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "무난한 날" })).toBeVisible();
  expect(screen.getAllByLabelText("오늘보다 9점 낮음").length).toBeGreaterThan(1);
  expect(screen.getByText("오늘 올라온 기운이 내일부터 차분해져요.")).toBeVisible();
  expect(screen.getByRole("link", { name: "이번 주 운세" })).toHaveAttribute(
    "href",
    "/chemi/fortune/deep?locale=ko&c=changha&r=11111111-1111-4111-8111-111111111111&view=week",
  );
  expect(screen.getByRole("link", { name: "뒤로 가기" })).toHaveAttribute(
    "href",
    "/chemi/fortune?locale=ko&c=changha&step=result&r=11111111-1111-4111-8111-111111111111",
  );
  cleanup();
  serve([71, 71, 71, 60, 60, 60, 60]);
  render(<FortuneDeep view="tomorrow" character="elina" locale="ko" paidPreview={false} />);
  expect(await screen.findByText("내일도 오늘과 비슷하게 흘러가요.")).toBeVisible();
  expect(screen.queryByLabelText(/오늘보다/)).toBeNull();
  expect(screen.getByText("내일 건 미리 봐 뒀어요. 시간대부터 챙겨요.")).toBeVisible();
});

it("draws seven days, links only today and tomorrow, and keeps paid dates out before payment", async () => {
  serve([96, 78, 57, 71, 88, 82, 66]);
  const view = render(<FortuneDeep view="week" character="changha" locale="ko" paidPreview={false} />);
  await screen.findByRole("heading", { level: 1, name: "이번 주 운세" });
  const chart = within(view.container.querySelector("ol") as HTMLElement);
  expect(chart.getAllByRole("listitem")).toHaveLength(7);
  expect(chart.getAllByRole("link")).toHaveLength(2);
  expect(view.container.querySelectorAll("table tbody tr")).toHaveLength(6);
  expect(view.container.querySelectorAll('[data-level="5"]').length).toBeGreaterThan(0);
  // 눈여겨볼 날: 가장 높은 날 · 그다음 · 가장 낮은 날
  const notable = [...view.container.querySelectorAll("ol")].at(-1)!.querySelectorAll(":scope > li");
  expect([...notable].map((row) => row.textContent)).toEqual([
    expect.stringContaining("96 · 아주 좋은 날"),
    expect.stringContaining("88 · 좋은 날"),
    expect.stringContaining("57 · 쉬어 가는 날"),
  ]);
  expect(screen.queryByText("DEV 시험")).toBeNull();
  expect(screen.queryByLabelText("운세를 볼 날짜")).toBeNull();
  cleanup();
  serve([96, 78, 57, 71, 88, 82, 66]);
  render(<FortuneDeep view="week" character="changha" locale="ko" paidPreview />);
  expect(await screen.findByText("DEV 시험")).toBeVisible();
  expect(screen.getByLabelText("운세를 볼 날짜")).toBeVisible();
});

it("asks a guest to sign in instead of loading", async () => {
  session.authenticated = false;
  const fetcher = serve([]);
  render(<FortuneDeep view="week" character="changha" locale="ko" paidPreview={false} />);
  fireEvent.click(await screen.findByRole("button", { name: "로그인" }));
  expect(login).toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
});

it("shows the amulet on a rest day, the keepsake on a great day and nothing in between", async () => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:card", revokeObjectURL: () => {} }));
  serve([56, 70, 70, 70, 70, 70, 70]);
  image.render.mockResolvedValue(new File(["x"], "card.png"));
  render(<FortuneCard character="dosa" locale="ko" />);
  // 화면의 카드는 저장되는 그림 그대로다.
  const card = await screen.findByRole("img", { name: /kyaa 도사의 응원 부적.*천천히 가도 괜찮소/ });
  expect(card).toHaveAttribute("src", "blob:card");
  expect(screen.getAllByText("56 · 쉬어 가는 날").length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "카드 저장" }));
  await waitFor(() => expect(image.download).toHaveBeenCalled());
  expect(image.render).toHaveBeenCalledWith(expect.objectContaining({ kind: "amulet", character: "dosa", score: 56 }));
  expect(toast).toHaveBeenCalledWith({ title: "카드를 저장했어요", tone: "success" });
  cleanup();
  serve([93, 70, 70, 70, 70, 70, 70]);
  render(<FortuneCard character="yuna" locale="ko" />);
  expect(await screen.findByRole("img", { name: /유나의 기념 카드.*93점/ })).toBeVisible();
  cleanup();
  serve([75, 70, 70, 70, 70, 70, 70]);
  render(<FortuneCard character="yuna" locale="ko" />);
  expect(await screen.findByText("오늘은 카드가 나오지 않는 날이에요")).toBeVisible();
  expect(screen.queryByRole("img", { name: /카드|부적/ })).toBeNull();
});

it("falls back to the plain art, reports a failed save and stays quiet when the share sheet is dismissed", async () => {
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:card", revokeObjectURL: () => {} }));
  serve([95, 70, 70, 70, 70, 70, 70]);
  image.render.mockRejectedValue(new Error("canvas"));
  render(<FortuneCard character="changha" locale="ko" />);
  expect(await screen.findByRole("img", { name: /창하의 기념 카드/ })).toHaveAttribute("src", "/chemi/fortune/card/keep-changha-v1.webp");
  fireEvent.click(screen.getByRole("button", { name: "카드 저장" }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "카드를 저장하지 못했어요. 다시 시도해 주세요.", tone: "error" }));
  toast.mockClear();
  image.render.mockResolvedValue(new File(["x"], "card.png"));
  image.share.mockRejectedValueOnce(new DOMException("closed", "AbortError"));
  fireEvent.click(screen.getAllByRole("button", { name: "자랑하기" })[0]);
  await waitFor(() => expect(image.share).toHaveBeenCalled());
  expect(toast).not.toHaveBeenCalled();
});

it("puts the day card and the free deeper rows on today's result only", async () => {
  const reading = (score: number, kstDate: string) => ({ readingId: "22222222-2222-4222-8222-222222222222", kstDate, styled: null, replayed: true, reward: {}, result: { ...result(score), grade: { name: "아주 좋은 날" } } });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grants: [] })));
  render(<FortuneResult locale="ko" character="changha" initial={reading(94, TODAY) as never} />);
  const card = await screen.findByRole("link", { name: /기념 카드/ });
  expect(card).toHaveAttribute("href", "/chemi/fortune/card?locale=ko&c=changha&r=22222222-2222-4222-8222-222222222222");
  expect(screen.getByRole("link", { name: "내일 운세" })).toHaveAttribute("href", expect.stringContaining("view=tomorrow"));
  expect(screen.getByRole("link", { name: "이번 주 운세" })).toHaveAttribute("href", expect.stringContaining("view=week"));
  expect(screen.queryByLabelText("운세를 볼 날짜")).toBeNull();
  cleanup();
  render(<FortuneResult locale="ko" character="changha" initial={reading(94, dayAt(-1)) as never} paidPreview />);
  await screen.findByRole("heading", { level: 1 });
  expect(screen.queryByRole("link", { name: /기념 카드/ })).toBeNull();
  expect(screen.queryByRole("link", { name: "내일 운세" })).toBeNull();
  expect(screen.getByLabelText("운세를 볼 날짜")).toBeVisible();
});
