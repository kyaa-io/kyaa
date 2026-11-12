import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CelebrityDirectory, directoryIntroduction } from "./celebrity-directory";

async function pickSort(label: string) {
  fireEvent.click(screen.getByRole("button", { name: /^정렬/ }));
  fireEvent.click(await screen.findByRole("menuitemradio", { name: label }));
}

const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/celebrities",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: routerPush }),
}));

const publishedCelebrityFixtures = [
  { slug: "kara", locale: "ko", name: "KARA", summary: "KARA summary", image: { url: "/images/guest-home/kara-card.jpg", alt: "KARA portrait", position: "center" }, roles: ["idol"] as const, themes: [], socialLinks: [], displayOrder: 0, fanCount: 12_800_000, upcomingLive: { slug: "kara-live", celebritySlug: "kara", locale: "ko", title: "KARA LIVE", startsAt: "2026-07-24T11:00:00.000Z", effectiveStatus: "scheduled" } },
  { slug: "elina", locale: "ko", name: "Elina", summary: "Elina summary", image: { url: "/images/guest-home/elina-card.jpg", alt: "Elina portrait", position: "center" }, roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: 1, fanCount: 3_200_000, upcomingLive: null },
  { slug: "changha", locale: "ko", name: "Changha", summary: "Changha summary", image: { url: "/images/guest-home/changha-card.jpg", alt: "Changha portrait", position: "center" }, roles: ["creator"] as const, themes: [], socialLinks: [], displayOrder: 2, fanCount: 1_450_000, upcomingLive: null },
] as const;
const ownedPassport = {
  id: "11111111-1111-4111-8111-111111111111",
  owner: { nickname: "Jewel_KAT" },
  celebrity: {
    slug: "kara",
    name: "KARA",
    image: {
      url: "/images/guest-home/kara-card.jpg",
      alt: "KARA portrait",
      position: "center",
    },
  },
  businessStatus: "issued",
  mint: {
    status: "queued",
    txHash: null,
    tokenId: null,
  },
  issuedAt: "2026-07-26T00:00:00.000Z",
  score: {
    points: 1,
    level: "Bronze",
  },
  stampSummary: {
    knowledge: 1,
    reservation: 0,
    attendance: 0,
    survey: 0,
    total: 1,
  },
  display: {
    level: "브론즈",
    mintStatus: "발급 대기",
  },
} as const;

let authenticated = false;
let authReady = true;
let ownerId = "owner-a";
const getAccessToken = vi.fn();
vi.mock("@/features/auth/client/auth-fallback", () => ({ usePrivy: () => ({ ready: authReady, authenticated, user: { id: ownerId }, getAccessToken }) }));

beforeEach(() => {
  authReady = true;
  authenticated = false;
  ownerId = "owner-a";
  getAccessToken.mockReset();
  routerPush.mockReset();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

it("renders the My favorites block and stages from the minimal directory projection", async () => {
  authenticated = true;
  getAccessToken.mockResolvedValue("token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passports: [{ celebrity: { slug: "kara" }, score: ownedPassport.score }] }) }));
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
  await screen.findByRole("heading", { name: "내 최애" });
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByRole("button", { name: /KARA · 브론즈/ })).toBeInTheDocument();
});

describe("directory initial loading", () => {
  beforeEach(() => {
    authenticated = true;
    ownerId = "owner-a";
    getAccessToken.mockReset().mockResolvedValue("token");
    vi.unstubAllGlobals();
  });

  it.each([true, false])("reveals the rows and the My favorites block once, with owned=%s", async (ownsPassport) => {
    authReady = false;
    let resolve!: (value: unknown) => void;
    const pending = new Promise(done => { resolve = done; });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => pending });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    const expectLoading = () => {
      expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
      expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
      expect(screen.queryByText(/총 \d+개/)).not.toBeInTheDocument();
    };
    expectLoading();
    expect(fetchMock).not.toHaveBeenCalled();
    authReady = true;
    view.rerender(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expectLoading();
    await act(async () => resolve({ passports: ownsPassport ? [ownedPassport] : [] }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "내 최애" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "내 최애" }) !== null).toBe(ownsPassport);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("reveals All once auth resolves to guest without requesting Passports", () => {
    authReady = false;
    authenticated = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="en" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    authReady = true;
    view.rerender(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="en" />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves loading on failure and shows every row without a My favorites block", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    await screen.findByRole("button", { name: "전체" });
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps visible rows during a background refresh", async () => {
    let resolve!: (value: unknown) => void;
    const pending = new Promise(done => { resolve = done; });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ passports: [ownedPassport] }) })
      .mockResolvedValueOnce({ ok: true, json: () => pending });
    vi.stubGlobal("fetch", fetchMock);
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    await screen.findByRole("heading", { name: "내 최애" });
    fireEvent.focus(window);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
    await act(async () => resolve({ passports: [ownedPassport] }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });
});

describe("published celebrity directory", () => {

  it("prioritizes editorial leads and exposes useful search and sort controls", async () => {
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    expect(screen.getAllByRole("link", { name: "kyaa 홈" })[0]).toHaveAttribute("href", "/?locale=ko");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Changha");
    expect(screen.getByRole("link", { name: "KARA 만나보기" })).toHaveAttribute("href", "/kara?locale=ko");
    expect(screen.getByText("LIVE 예정")).toHaveAttribute("data-live-status", "scheduled");
    expect(screen.getByText(/7월 24일/)).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "이름으로 찾기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^정렬/ })).toHaveTextContent("기본순");
    const karaCard = screen.getByText("KARA", { selector: "strong" }).closest("article");
    expect(karaCard?.querySelector("strong")?.compareDocumentPosition(karaCard.querySelector("img")!)).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(within(karaCard!).getByRole("link", { name: "KARA 만나보기" })).toContainElement(karaCard!.querySelector("img"));
    expect(within(karaCard!).queryByText("KARA 만나보기")).not.toBeInTheDocument();
    expect(within(karaCard!).getAllByText("KARA", { selector: "strong" })).toHaveLength(1);
  });

  it("filters by name and teaches recovery from a zero-result filter", () => {
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    fireEvent.change(screen.getByRole("searchbox", { name: "이름으로 찾기" }), { target: { value: "Elina" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByText("Elina", { selector: "strong" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "이름으로 찾기" }), { target: { value: "없는 셀럽" } });
    expect(screen.getByRole("status")).toHaveTextContent("검색 결과가 없어요.");
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("sorts without mutating the published input order", async () => {
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    await pickSort("이름순");
    expect(screen.getAllByRole("article")[0]).toHaveTextContent("Changha");
    expect(publishedCelebrityFixtures[0]?.slug).toBe("kara");
  });

  it("puts creators with a Passport in a My favorites block above the full list", async () => {
    authenticated = true;
    getAccessToken.mockResolvedValue("token");
    const stageProgress = { policyVersion: 2, current: { key: "silver-1", tier: "Silver", subdivision: 1, rank: 2, minimumScore: 15 }, next: { key: "silver-2", tier: "Silver", subdivision: 2, rank: 3, minimumScore: 30 }, remaining: 10, progressPercent: 33, unit: "points" as const };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passports: [{ ...ownedPassport, score: { level: "Silver", points: 20, stageProgress } }] }) }));
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    const mine = await screen.findByRole("heading", { name: "내 최애" });
    expect(screen.queryByRole("button", { name: "내 최애" })).not.toBeInTheDocument();
    const block = mine.closest("section")!;
    expect(within(block).getAllByRole("article")).toHaveLength(1);
    expect(within(block).getByText("KARA", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "전체" })).not.toBeInTheDocument();
    const rest = screen.getByRole("region", { name: "최애 목록" });
    expect(within(rest).getAllByRole("article")).toHaveLength(2);
    expect(within(rest).getByText("총 2개")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/passports?locale=ko&tierStages=1&view=directory", expect.objectContaining({ headers: { Authorization: "Bearer token" } }));
    const trigger = screen.getByRole("button", { name: /KARA.*20점/ });
    expect(trigger.closest("a")).toBeNull();
    expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-passport-owned", "true");
    expect(screen.getAllByRole("article")[1]).not.toHaveAttribute("data-passport-owned");
    fireEvent.click(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent("20점");
    expect(screen.getByRole("tooltip")).toHaveTextContent("10점");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await pickSort("이름순");
    expect(screen.getAllByRole("article")[1]).toHaveTextContent("Changha");
    expect(publishedCelebrityFixtures[0].slug).toBe("kara");
  });

  it("shows only the full list when the signed-in user has no Passport", async () => {
    authenticated = true;
    getAccessToken.mockResolvedValue("token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passports: [] }) }));
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    await screen.findByRole("button", { name: "전체" });
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("article")).toHaveLength(3);
    expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
  });

  it("shows My favorites only after Passport data arrives and keeps every row", async () => {
    authenticated = true;
    getAccessToken.mockResolvedValue("token");
    let resolve!: (value: unknown) => void;
    const pending = new Promise((done) => { resolve = done; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => pending }));
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    expect(screen.queryByRole("button", { name: "전체" })).not.toBeInTheDocument();
    await act(async () => resolve({ passports: [ownedPassport] }));
    await screen.findByRole("heading", { name: "내 최애" });
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("shows no My favorites block when the API DTO is malformed", async () => {
    authenticated = true;
    getAccessToken.mockResolvedValue("token");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        passports: [{ ...ownedPassport, score: undefined }],
      }),
    }));
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    await screen.findByRole("button", { name: "전체" });
    expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("gives guests no My favorites block and no My favorites chip", () => {
    render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
    expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "내 최애" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("teaches the user what happens next when no published rows exist", () => {
    render(<CelebrityDirectory celebrities={[]} locale="ko" />);
    expect(screen.getByRole("status")).toHaveTextContent("지금 공개된 셀럽이 없어요.");
    expect(screen.getByRole("link", { name: "LIVE 둘러보기" })).toHaveAttribute("href", "/?locale=ko");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("localizes directory controls and preserves English locale in navigation", () => {
    const english = publishedCelebrityFixtures.map((celebrity) => ({ ...celebrity, locale: "en" as const, upcomingLive: celebrity.upcomingLive ? { ...celebrity.upcomingLive, locale: "en" as const } : null }));
    render(<CelebrityDirectory celebrities={english} locale="en" />);
    expect(screen.getByRole("heading", { name: "Find your favorite" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search celebrities" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View KARA’s fan page" })).toHaveAttribute("href", "/kara?locale=en");
  });
});

it("uses one whole-row link and complete introductory sentence", () => {
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko"/>);
  const link = screen.getByRole("link", { name:"KARA 만나보기" });
  expect(link.querySelector("img")).not.toBeNull();
  expect(link.querySelector("strong")).toHaveTextContent("KARA");
  expect(link.querySelector("a")).toBeNull();
  expect(directoryIntroduction("엘리나는 노래와 뷰티를 공유합니다. 함께한 순간을 기록하세요.", "ko")).toBe("엘리나는 노래와 뷰티를 공유합니다.");
  expect(directoryIntroduction("A complete introduction without punctuation", "en")).toBe("A complete introduction without punctuation");
});

it("keeps identical card treatment in default and sorted discovery", async () => {
  const { container } = render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
  expect(container.querySelectorAll('[data-supporting="true"]')).toHaveLength(0);
  expect(new Set([...container.querySelectorAll("article")].map(a => a.className)).size).toBe(1);
  await pickSort("이름순");
  expect(container.querySelectorAll('[data-supporting="true"]')).toHaveLength(0);
});

it("keeps My favorites above the list when sorted by name", async () => {
  authenticated = true;
  getAccessToken.mockResolvedValue("token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ok:true,json:async()=>({passports:[ownedPassport]})}));
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" initialSort="name-asc" />);
  await screen.findByRole("heading", { name: "내 최애" });
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-passport-owned", "true");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("KARA");
});

it("clears prior owner rows immediately and ignores late responses after switching accounts", async () => {
  authenticated = true; ownerId = "owner-a";
  getAccessToken.mockResolvedValue("token");
  let resolveOld!: (value: unknown) => void;
  const late = new Promise(resolve => { resolveOld = resolve; });
  const fetchMock = vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({passports:[ownedPassport]})})
    .mockResolvedValueOnce({ok:true,json:()=>late})
    .mockResolvedValue({ok:true,json:async()=>({passports:[]})});
  vi.stubGlobal("fetch",fetchMock);
  const view=render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
  await screen.findByRole("heading", { name: "내 최애" });
  fireEvent.focus(window);
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
  ownerId="owner-b";
  view.rerender(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
  expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
  await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(3));
  await act(async()=>resolveOld({passports:[ownedPassport]}));
  expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
});


it("shows the empty state with a reset for a name search and restores every row", () => {
  authenticated = false;
  getAccessToken.mockReset();
  vi.unstubAllGlobals();
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="en" initialRole="creator" />);
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "Creators" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Elina" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "KARA" } });
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
});

it("hides My favorites once a role or name filter is active and keeps the role in the URL", async () => {
  authenticated = true;
  getAccessToken.mockResolvedValue("token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passports: [ownedPassport] }) }));
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" />);
  await screen.findByRole("heading", { name: "내 최애" });
  fireEvent.click(screen.getByRole("button", { name: "크리에이터" }));
  expect(screen.queryByRole("heading", { name: "내 최애" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(new URL(window.location.href).searchParams.get("owned")).toBeNull();
  expect(new URL(window.location.href).searchParams.get("role")).toBe("creator");
});

it("keeps the selected role in the URL without losing locale, sort or history state", () => {
  authenticated = false;
  window.history.replaceState({ entry: "directory" }, "", "/celebrities?locale=en&sort=name-asc#directory-results");
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="en" initialSort="name-asc" />);
  fireEvent.click(screen.getByRole("button", { name: "Creators" }));
  expect(new URL(window.location.href).searchParams.get("role")).toBe("creator");
  expect(screen.getAllByRole("article")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "All" }));
  expect(window.location.pathname + window.location.search + window.location.hash).toBe("/celebrities?locale=en&sort=name-asc&role=all#directory-results");
  expect(window.history.state).toEqual({ entry: "directory" });
  window.history.replaceState({}, "", "/");
});

it("clears deep-linked filters from the URL so reloading cannot restore an old role", async () => {
  authenticated = true;
  getAccessToken.mockResolvedValue("token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passports: [ownedPassport] }) }));
  window.history.replaceState({}, "", "/celebrities?locale=ko&role=show_host&q=missing&owned=1&sort=name-asc");
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" initialRole="show_host" initialQuery="missing" initialSort="name-asc" />);
  fireEvent.click(await screen.findByRole("button", { name: "필터 초기화" }));
  expect(screen.getAllByRole("article")).toHaveLength(3);
  expect(screen.getByRole("searchbox")).toHaveValue("");
  expect(screen.getByRole("button", { name: /^정렬/ })).toHaveTextContent("이름순");
  expect(window.location.pathname + window.location.search).toBe("/celebrities?locale=ko&role=all&sort=name-asc");
  window.history.replaceState({}, "", "/");
});

it("places the five public roles after All and never offers My favorites as a filter", () => {
  const roles = (["idol", "singer", "actor", "creator", "show_host"] as const).map((role, index) => ({
    ...publishedCelebrityFixtures[0],
    slug: `role-${role}`,
    name: role,
    roles: [role] as const,
    displayOrder: index,
  }));
  render(<CelebrityDirectory celebrities={roles} locale="en" />);
  const group = screen.getByRole("group", { name: "Browse by category" });
  expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual([
    "All", "Idols", "Singers", "Actors", "Creators", "Show hosts",
  ]);
});


it("offers a favorite request at discovery and preserves an unmatched name", async () => {
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" initialQuery=" 새 최애 & 이름 " />);
  const links = await screen.findAllByRole("link", { name: "최애 요청" });
  expect(links.length).toBe(2);
  for (const link of links) {
    const url = new URL(link.getAttribute("href")!, "https://byus.kr");
    expect(url.pathname).toBe("/pages/groups/apply");
    expect(url.searchParams.get("name")).toBe("새 최애 & 이름");
    expect(url.searchParams.get("locale")).toBe("ko");
  }
});


it("discovers brands separately from people without losing search or locale", () => {
  const brand = { ...publishedCelebrityFixtures[0], slug: "runmusic", name: "RUN&MUSIC FESTIVAL", roles: ["brand"] as const, fanCount: 0, upcomingLive: null };
  window.history.replaceState({}, "", "/celebrities?locale=en");
  render(<CelebrityDirectory celebrities={[...publishedCelebrityFixtures, brand]} locale="en" />);
  fireEvent.click(screen.getByRole("button", { name: "Brands" }));
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByRole("article")).toHaveTextContent("RUN&MUSIC FESTIVAL");
  expect(new URL(window.location.href).searchParams.get("role")).toBe("brand");
  expect(new URL(window.location.href).searchParams.get("locale")).toBe("en");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "festival" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
});

it("marks only the Wave listing as private and explains check-in access", () => {
  const wave = { ...publishedCelebrityFixtures[1], slug: "kyaa-wave-fanpage", name: "Kyaa Wave", summary: "Event", upcomingLive: null };
  render(<CelebrityDirectory celebrities={[wave, publishedCelebrityFixtures[0]]} locale="ko" />);
  const card = screen.getByText("Kyaa Wave", { selector: "strong" }).closest("article")!;
  expect(within(card).getByText("Private")).toBeInTheDocument();
  expect(within(card).getByRole("img", { name: "Dragon Hill Lodge" })).toHaveAttribute("src", expect.stringContaining("dragon-hill-lodge-exterior.jpg"));
  expect(card.querySelector("[data-creator-avatar]")).toBeNull();
  expect(within(card).getByText("체크인한 참가자 전용", { selector: "p" })).toBeInTheDocument();
  expect(within(screen.getByText("KARA", { selector: "strong" }).closest("article")!).queryByText("Private")).toBeNull();
});

it("keeps the chips' aria-controls target when every row is a favorite", async () => {
  authenticated = true;
  getAccessToken.mockResolvedValue("token");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ passports: [ownedPassport] }) }));
  const { container } = render(<CelebrityDirectory celebrities={[publishedCelebrityFixtures[0]]} locale="ko" />);
  await screen.findByRole("heading", { name: "내 최애" });
  expect(screen.queryByRole("heading", { name: "전체" })).not.toBeInTheDocument();
  const target = container.querySelector("#directory-results");
  expect(target).not.toBeNull();
  expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-controls", "directory-results");
});

it("keeps the empty state to one sentence and puts reset and request in a row below it", () => {
  render(<CelebrityDirectory celebrities={publishedCelebrityFixtures} locale="ko" initialQuery="없는 셀럽" />);
  const empty = screen.getByRole("status");
  expect(empty).toHaveTextContent("검색 결과가 없어요.");
  expect(within(empty).queryByRole("button")).toBeNull();
  expect(within(empty).queryByRole("link")).toBeNull();
  expect(screen.getByRole("button", { name: "필터 초기화" })).toBeInTheDocument();
  expect(empty.nextElementSibling).toContainElement(screen.getByRole("button", { name: "필터 초기화" }));
});

// Keep these domain-request tests independent of the separately tested translation transport.
vi.mock("@/features/content-safety/ui/use-automatic-translation", () => ({
  TranslatedText: ({ text, children, className, as: Tag = "span" }: { text: string; children?: import("react").ReactNode; className?: string; as?: "span" | "p" | "div" }) => <Tag className={className}>{children ?? text}</Tag>,
}));
