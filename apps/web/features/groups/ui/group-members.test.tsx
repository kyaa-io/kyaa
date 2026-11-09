import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { APP_LOCALES } from "@/i18n/locales";
import { groupMembersCopy } from "./group-members-copy";
import { fanListCopy } from "./fan-list-copy";
import { fanListTime } from "./fan-list-time";
import { GroupMembers } from "./group-members";

vi.mock("@/features/group-social/profile-modal", () => ({ ProfileModal: ({ person, onClose }: { person: { profileId: string; nickname: string }; onClose: () => void }) => <div role="dialog" aria-label={person.nickname} data-profile={person.profileId}><button onClick={onClose}>닫기</button></div> }));
const resource = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined, error: false, loading: false, authenticated: true, ownerKey: "owner:1", retry: vi.fn() }));
const ranked = vi.hoisted(() => ({ state: { status: "loading" } as Record<string, unknown> }));
vi.mock("./use-group-resource", () => ({ useGroupResource: vi.fn(() => resource) }));
vi.mock("@/features/rankings/ui/use-ranking-resource", () => ({ useRankingResource: vi.fn(() => ({ state: ranked.state })) }));
import { useGroupResource } from "./use-group-resource";
const page = "e9700000-0000-4000-8000-000000000001";
const fan = { nickname: "긴 닉네임의 팬 이름 Long Fan Name", avatarUrl: null, tier: "Gold", hearts: 2, stamps: 0, first_jjinfan_at: "2026-10-01T00:00:00Z", last_active_at: "2026-11-01T00:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); resource.data = { items: [fan], nextCursor: null }; resource.error = false; resource.loading = false; resource.authenticated = true; resource.ownerKey = "owner:1"; ranked.state = { status: "loading" }; });

describe("fan list controls", () => {
  it("orders four chips and debounces search without a submit button", async () => {
    render(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.getAllByRole("button").slice(0, 4).map(x => x.textContent)).toEqual(["팬", "찐팬", "내 친구", "팬 랭킹"]);
    expect(screen.queryByRole("button", { name: "검색" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "찐팬" }));
    expect(screen.getByRole("button", { name: "찐팬" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "별" } });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "별빛" } });
    expect(useGroupResource).not.toHaveBeenCalledWith(expect.stringContaining("search=%EB%B3%84%EB%B9%9B"), expect.any(Function));
    await waitFor(() => expect(useGroupResource).toHaveBeenCalledWith(expect.stringContaining("sort=hearts&mode=jjinfans&search=%EB%B3%84%EB%B9%9B"), expect.any(Function)));
  });
  it.each(APP_LOCALES)("has localized chips, search and sort in %s", locale => {
    const t = groupMembersCopy(locale), copy = fanListCopy(locale);
    render(<GroupMembers pageId={page} locale={locale} member/>);
    for (const name of [t.members, copy.jjinfans, t.friends, t.ranking]) expect(screen.getByRole("button", { name })).toBeVisible();
    expect(screen.getByRole("searchbox", { name: t.search })).toBeVisible(); expect(screen.getByText(copy.order)).toBeVisible();
  });
  it("keeps the friend chip with a login action when signed out", () => {
    resource.authenticated = false;
    render(<GroupMembers pageId={page} locale="ko" member={false}/>);
    expect(useGroupResource).toHaveBeenCalledWith(expect.stringContaining("public-people?sort=hearts"), expect.any(Function));
    fireEvent.click(screen.getByRole("button", { name: "내 친구" }));
    expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", expect.stringContaining("/login"));
    expect(useGroupResource).not.toHaveBeenCalledWith(expect.stringContaining("mode=friends"), expect.any(Function));
  });
  it("shows a single empty line and keeps search available", () => {
    resource.data = { items: [], nextCursor: null };
    render(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.getByRole("status")).toHaveTextContent("조건에 맞는 팬이 없어요.");
    expect(screen.getByRole("status").querySelector("svg,button,a")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내 친구" }));
    expect(screen.getByRole("searchbox")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("이 모임에 가입한 친구가 없어요.");
  });
});

describe("sorted fan rows", () => {
  it("shows hearts, zero stamps, first heart date and no identifier-dependent profile action", () => {
    render(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.getByText(fan.nickname)).toBeVisible(); expect(screen.getByLabelText("하트 2")).toBeVisible();
    expect(screen.getByRole("listitem")).toHaveTextContent("누적 스탬프 0");
    expect(screen.getByText(fanListTime(fan.first_jjinfan_at, "ko"))).toHaveAttribute("datetime", fan.first_jjinfan_at);
    expect(screen.queryByRole("button", { name: new RegExp(fan.nickname) })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("keeps 0 hearts and omits a nonexistent first-heart date", () => {
    resource.data = { items: [{ ...fan, hearts: 0, first_jjinfan_at: null }], nextCursor: null };
    render(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.getByLabelText("하트 0")).toBeVisible(); expect(screen.getByRole("listitem").querySelector("time")).toBeNull();
  });
  it("appends the next page and resets its cursor on a new search", async () => {
    resource.data = { items: [fan], nextCursor: "opaque-next" };
    const view = render(<GroupMembers pageId={page} locale="ko" member/>);
    fireEvent.click(screen.getByRole("button", { name: "팬 더 보기" }));
    resource.data = undefined; resource.loading = true;
    view.rerender(<GroupMembers pageId={page} locale="ko" member/>);
    expect(useGroupResource).toHaveBeenLastCalledWith(expect.stringContaining("cursor=opaque-next"), expect.any(Function));
    resource.data = { items: [{ ...fan, nickname: "다음 팬" }], nextCursor: null }; resource.loading = false;
    view.rerender(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "새 검색" } });
    await waitFor(() => expect(useGroupResource).toHaveBeenLastCalledWith(expect.not.stringContaining("cursor="), expect.any(Function)));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });
  it("retains a list while searching, but clears it when the viewer changes", () => {
    const view = render(<GroupMembers pageId={page} locale="ko" member/>);
    resource.data = undefined; resource.loading = true;
    view.rerender(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.getByText(fan.nickname)).toBeVisible(); expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true");
    resource.ownerKey = "owner:2";
    view.rerender(<GroupMembers pageId={page} locale="ko" member/>);
    expect(screen.queryByText(fan.nickname)).toBeNull(); expect(view.container.querySelector('[data-fan-skeleton="member"]')).toBeTruthy();
  });
  it("offers retry after an error", () => {
    resource.error = true; render(<GroupMembers pageId={page} locale="ko" member/>);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" })); expect(resource.retry).toHaveBeenCalledOnce();
  });
});

it("preserves the existing ranking and my rank behavior", () => {
  resource.data = { items: [{ ...fan, profileId: page, role: "member", rank: 17, points: 120 }], nextCursor: null, ranking: { available: true, reason: null, fanCount: 120, asOf: "2026-11-01T00:00:00Z" } };
  ranked.state = { status: "ready", data: { me: { rank: 140, score: 12, inTop: false } } };
  render(<GroupMembers pageId={page} locale="ko" member rankingsSlug="nchive" inTab presentation={{ creatorName: "아티스트", subtitles: {} }}/>);
  fireEvent.click(screen.getByRole("button", { name: "팬 랭킹" }));
  expect(screen.getByRole("heading", { level: 3, name: "아티스트 팬 랭킹" })).toBeVisible();
  expect(screen.getByText("120 점")).toBeVisible(); expect(screen.getByText("140")).toBeVisible(); expect(screen.getByText("12 점")).toBeVisible();
  expect(screen.getByRole("link", { name: "팬 랭킹" })).toHaveAttribute("href", "/rankings/nchive?locale=ko");
});


describe("ranking regression coverage", () => {
  const profileId = "e9700000-0000-4000-8000-000000000002";
  beforeEach(() => {
    resource.data = { items: [{ ...fan, profileId, role: "member", rank: 17, points: 120 }], nextCursor: null, ranking: { available: true, reason: null, fanCount: 120, asOf: "2026-11-01T00:00:00Z" } };
  });
  it("opens and closes the ranking profile modal with the selected fan ID", () => {
    render(<GroupMembers pageId={page} locale="ko" member/>);
    fireEvent.click(screen.getByRole("button", { name: "팬 랭킹" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(fan.nickname) }));
    expect(screen.getByRole("dialog", { name: fan.nickname })).toHaveAttribute("data-profile", profileId);
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("hides my pinned rank when inTop is true", () => {
    ranked.state = { status: "ready", data: { me: { rank: 17, score: 120, inTop: true } } };
    render(<GroupMembers pageId={page} locale="ko" member rankingsSlug="nchive"/>);
    fireEvent.click(screen.getByRole("button", { name: "팬 랭킹" }));
    expect(screen.getByText("120 점")).toBeVisible();
    expect(screen.queryByText("내 순위")).toBeNull();
  });
  it("hides the public ranking link when no slug is supplied", () => {
    render(<GroupMembers pageId={page} locale="ko" member/>);
    fireEvent.click(screen.getByRole("button", { name: "팬 랭킹" }));
    expect(screen.getByText("120 점")).toBeVisible();
    expect(screen.queryByRole("link", { name: "팬 랭킹" })).toBeNull();
  });
});
