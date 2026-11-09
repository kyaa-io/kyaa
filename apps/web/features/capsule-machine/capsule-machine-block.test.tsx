import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { CapsuleMachineBlock } from "./capsule-machine-block";
import { capsuleMachineCopy } from "./copy";
import { CAPSULE_DRAW_OPEN, canDrawCount, isRarePrize, pickCampaign, probabilityLabel, tallyPrizes, toOutcomes } from "./domain";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "owner-a" }, getAccessToken: vi.fn(async () => "token-a") }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "owner-a", generation: 0 }));
const canvas = vi.hoisted(() => ({ mounted: 0 }));
const gpu = vi.hoisted(() => ({ ok: true, checks: 0 }));
vi.mock("./gpu", () => ({ canRunCapsuleMachine: async () => { gpu.checks++; return gpu.ok; } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
// The three.js chunk never loads in jsdom: the dynamic canvas stands in as a marker (no engine = the still-image path).
vi.mock("next/dynamic", () => ({ default: () => function MachineCanvasStub() { canvas.mounted++; return <canvas data-testid="machine-canvas" />; } }));

const id = "10000000-0000-4000-8000-000000000001", card = "10000000-0000-4000-8000-000000000002", key = "10000000-0000-4000-8000-000000000003";
const campaign = { id, name: "엘리나 굿즈 캡슐", status: "active" as const, blankWeight: 850000, weightTotal: 1000000 as const, prizes: [
  { id: card, name: "포토카드", imageUrl: null, stock: 10, weight: 50000 },
  { id: key, name: "키링", imageUrl: "https://cdn.example/key.webp", stock: 12, weight: 100000 },
] };
const wallet = { sequence: 1, points: 100, hearts: 1, tickets: 12, policyVersion: "group-wallet-v1", pointCost: 100, writeFenced: false, attendance: { date: "2026-11-01", checkedIn: true, streak: 1, nextBonusIn: 6 } };
const blank = (index: number) => ({ index, prizeId: null, name: null, imageUrl: null });

let posts: Array<{ url: string; body: { requestKey: string; count: number } }> = [];
function serve(draw?: (body: { requestKey: string; count: number }) => unknown, items: unknown[] = [campaign]) {
  posts = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { const body = JSON.parse(init.body as string); posts.push({ url, body }); return Response.json(draw!(body)); }
    if (url.startsWith("/api/groups/capsules")) return Response.json({ items });
    if (url.startsWith("/api/me/wallet")) return Response.json(wallet);
    throw new Error(url);
  }));
}
function setReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}
class VisibleObserver { constructor(private cb: IntersectionObserverCallback) {} observe(target: Element) { this.cb([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); } disconnect() {} unobserve() {} takeRecords() { return []; } }

beforeEach(() => { localStorage.clear(); auth.authenticated = true; canvas.mounted = 0; gpu.ok = true; gpu.checks = 0; setReducedMotion(false); vi.stubGlobal("IntersectionObserver", VisibleObserver); });

it("ships as 준비 중: the machine loads, both draw buttons stay disabled, and no draw can be sent", async () => {
  expect(CAPSULE_DRAW_OPEN).toBe(false);
  serve(() => { throw new Error("no draw while 준비 중"); });
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  await screen.findByRole("heading", { name: campaign.name });
  expect(screen.getByText("준비 중")).toBeInTheDocument();
  expect(await screen.findByTestId("machine-canvas")).toBeInTheDocument();
  const one = screen.getByRole("button", { name: /1회 뽑기/ }), ten = screen.getByRole("button", { name: /10회 뽑기/ });
  expect(one).toBeDisabled(); expect(ten).toBeDisabled();
  fireEvent.click(one); fireEvent.click(ten);
  expect(posts).toHaveLength(0);
  expect(await screen.findByText("응모권 12장")).toBeInTheDocument();
});

it("shows every prize and the blank with the server's exact probability", async () => {
  serve();
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  const list = await screen.findByRole("list", { name: "경품" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows.map((row) => row.textContent)).toEqual(["포토카드5%", "키링10%", "꽝85%"]);
  expect(screen.getByText("22개")).toBeInTheDocument(); // 남은 경품 = stock sum
});

it("keeps the frame and locks my tickets for a guest without reading the wallet", async () => {
  auth.authenticated = false;
  serve();
  render(<CapsuleMachineBlock locale="ko" guest />);
  await screen.findByRole("heading", { name: campaign.name });
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).startsWith("/api/me/wallet"))).toBe(false);
  expect(screen.getByRole("button", { name: /1회 뽑기/ })).toBeDisabled();
});

it("collapses to one empty line when no capsule is public, without loading the GPU check or three.js", async () => {
  serve(undefined, []);
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  expect(await screen.findByRole("status")).toHaveTextContent("진행 중인 캡슐이 없어요");
  expect(screen.queryByRole("list", { name: "경품" })).toBeNull();
  expect(screen.queryByRole("button", { name: /뽑기/ })).toBeNull();
  expect(gpu.checks).toBe(0); expect(canvas.mounted).toBe(0);
});

it("shows one error line with 다시 시도 when the capsule list fails, and recovers", async () => {
  let fail = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/groups/capsules")) return fail ? Response.json({ error: { code: "GROUP_WALLET_UNAVAILABLE" } }, { status: 503 }) : Response.json({ items: [campaign] });
    return Response.json(wallet);
  }));
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("캡슐 뽑기를 불러오지 못했어요");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(await screen.findByRole("heading", { name: campaign.name })).toBeInTheDocument();
});

it("before the list arrives a browser that last saw a campaign reserves the whole machine: 남은 경품 row and four prize slots", async () => {
  localStorage.setItem("kyaa-capsule-machine:has-campaign", "1");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (url.startsWith("/api/groups/capsules")) { await gate; return Response.json({ items: [campaign] }); } return Response.json(wallet); }));
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  expect(await screen.findByText("남은 경품")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "경품" }).querySelectorAll("li")).toHaveLength(4);
  release();
  expect(await screen.findByText("22개")).toBeInTheDocument();
});

it("on a tier 0 GPU keeps the still render and never loads the three.js chunk", async () => {
  gpu.ok = false;
  serve();
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  await screen.findByRole("heading", { name: campaign.name });
  await waitFor(() => expect(gpu.checks).toBe(1));
  expect(canvas.mounted).toBe(0);
  expect(screen.queryByTestId("machine-canvas")).toBeNull();
});

it("without graphics, a draw still ends in the result card with the server's result", async () => {
  serve((body) => ({ requestKey: body.requestKey, campaignId: id, count: 1, results: [{ index: 1, prizeId: key, name: "키링", imageUrl: "https://cdn.example/key.webp" }], tickets: 11 }));
  render(<CapsuleMachineBlock locale="ko" guest={false} drawOpen />);
  await screen.findByRole("heading", { name: campaign.name });
  await waitFor(() => expect(screen.getByRole("button", { name: /1회 뽑기/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /1회 뽑기/ }));
  expect(await screen.findByRole("heading", { name: "키링 당첨" })).toBeInTheDocument();
  expect(posts).toEqual([{ url: `/api/groups/capsules/${id}/draw`, body: { requestKey: expect.any(String), count: 1 } }]);
  expect(screen.getByRole("link", { name: "수령 방법 확인" })).toHaveAttribute("href", "/my/capsules?locale=ko");
});

it("a ten draw lists all ten capsules and counts the prizes", async () => {
  serve((body) => ({ requestKey: body.requestKey, campaignId: id, count: 10, tickets: 2, results: [
    { index: 1, prizeId: card, name: "포토카드", imageUrl: null }, blank(2), { index: 3, prizeId: key, name: "키링", imageUrl: null }, blank(4), blank(5),
    { index: 6, prizeId: key, name: "키링", imageUrl: null }, blank(7), blank(8), blank(9), blank(10)] }));
  render(<CapsuleMachineBlock locale="ko" guest={false} drawOpen />);
  await waitFor(() => expect(screen.getByRole("button", { name: /10회 뽑기/ })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: /10회 뽑기/ }));
  expect(await screen.findByRole("heading", { name: "10회 중 3개 당첨" })).toBeInTheDocument();
  expect(screen.getByText("포토카드 1개")).toBeInTheDocument(); expect(screen.getByText("키링 2개")).toBeInTheDocument();
  expect(document.querySelectorAll('[data-row="capsule-result"]')).toHaveLength(10);
  expect(document.querySelector('[data-row="capsule-result"][data-rare]')).toHaveTextContent("포토카드");
});

it("with reduced motion shows the still render only and never loads the 3D machine", async () => {
  setReducedMotion(true);
  serve();
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  await screen.findByRole("heading", { name: campaign.name });
  expect(screen.queryByTestId("machine-canvas")).toBeNull();
  expect(canvas.mounted).toBe(0);
  expect(document.querySelector("[data-capsule-graphics]")).toHaveAttribute("data-capsule-graphics", "still");
});

it("does not load the 3D machine before the block nears the screen", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} takeRecords() { return []; } });
  serve();
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  await screen.findByRole("heading", { name: campaign.name });
  expect(screen.queryByTestId("machine-canvas")).toBeNull();
  expect(document.querySelector('img[src="/images/capsule-machine/machine-idle.webp"]')).toBeInTheDocument();
});

it("plays only what the server decided: rare at 5% or less, unknown prizes never rare, blanks stay blank", () => {
  expect(isRarePrize(50000, 1000000)).toBe(true); expect(isRarePrize(50001, 1000000)).toBe(false);
  const result = { requestKey: id, campaignId: id, count: 10 as const, tickets: 0, results: [
    { index: 2, prizeId: key, name: "키링", imageUrl: null }, { index: 1, prizeId: card, name: "포토카드", imageUrl: null },
    { index: 3, prizeId: "10000000-0000-4000-8000-0000000000ff", name: "?", imageUrl: null }, ...[4, 5, 6, 7, 8, 9, 10].map(blank)] };
  expect(toOutcomes(result, campaign).map((o) => o.level)).toEqual([2, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  expect(toOutcomes(result, campaign)[1]!.imageUrl).toBe("https://cdn.example/key.webp");
  expect(tallyPrizes(result)).toEqual([{ name: "키링", count: 1 }, { name: "포토카드", count: 1 }, { name: "?", count: 1 }]);
  expect(probabilityLabel(1, 1000000, "ko")).toBe("0.0001%");
});

it("picks the running capsule first and never enables a draw while closed for opening", () => {
  expect(pickCampaign([{ ...campaign, status: "paused" }, campaign])).toBe(campaign);
  expect(pickCampaign([])).toBeNull();
  expect(canDrawCount(campaign, 1, 12, false)).toBe(false);
  expect(canDrawCount(campaign, 10, 9, true)).toBe(false);
  expect(canDrawCount({ ...campaign, prizes: [{ ...campaign.prizes[0]!, stock: 5 }] }, 10, 10, true)).toBe(false); // a prize with stock 5 could run out within ten
  expect(canDrawCount(campaign, 1, 1, true)).toBe(true);
});

it("has every capsule machine label in all 12 locales", () => {
  for (const locale of APP_LOCALES) {
    const c = capsuleMachineCopy(locale);
    for (const key of ["soon", "open", "perDraw", "tickets", "prizes", "remaining", "myTickets", "won", "noPrize", "tenWon", "tally", "claim", "close", "again", "skip", "rare"] as const) expect(c.text(key)?.length).toBeGreaterThan(0);
    expect(c.fill("tickets", { n: 10 })).toContain("10");
  }
});

it("before the list arrives a first visit starts at the one-line height, so an empty list does not collapse a tall block", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (url.startsWith("/api/groups/capsules")) { await gate; return Response.json({ items: [] }); } return Response.json(wallet); }));
  const view = render(<CapsuleMachineBlock locale="ko" guest={false} />);
  expect(view.container.querySelector("[data-capsule-pending]")).not.toBeNull();
  expect(view.container.querySelector("[data-lucky-module]")).toBeNull();
  release();
  expect(await screen.findByRole("status")).toHaveTextContent("진행 중인 캡슐이 없어요");
  expect(localStorage.getItem("kyaa-capsule-machine:has-campaign")).toBe("0");
});

it("remembers a campaign for the next visit's first paint", async () => {
  serve();
  render(<CapsuleMachineBlock locale="ko" guest={false} />);
  await screen.findByRole("heading", { name: campaign.name });
  expect(localStorage.getItem("kyaa-capsule-machine:has-campaign")).toBe("1");
});
