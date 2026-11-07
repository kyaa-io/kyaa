import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { messages } from "@/i18n/catalogs/components__fan-ui__fan-ui-copy";
import { APP_LOCALES } from "@/i18n/locales";
import { FanEntityCard } from "./fan-entity-card";
import { FanPageHeader } from "./fan-page-header";
import { FanPostRow, fanPostTimeLabel } from "./fan-post-row";
import { FanSkeleton, FanSkeletonRows } from "./fan-skeleton";
import { FanStarAction } from "./fan-star-action";
import { FanTabs } from "./fan-tabs";
import { FanTag } from "./fan-tag";
import { fanUiSource } from "./fan-ui-source";
import { clearResources, dropResource, peekResource, RESOURCE_FRESH_MS, ME_RESOURCE_FRESH_MS, shareResourceRead, storeResource, syncResourceOwner } from "./resource-cache";

vi.mock("@/features/groups/ui/group-image", () => ({ GroupImage: ({ src, className }: { src: string; className?: string }) => <img src={src} className={className} alt="" /> }));

describe("copy", () => {
  it("fills every added locale and keeps every placeholder", () => {
    const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
    const locales = APP_LOCALES.filter((locale) => locale !== "ko" && locale !== "en");
    expect(Object.keys(messages).sort()).toEqual(Object.keys(fanUiSource).sort());
    for (const [key, source] of Object.entries(fanUiSource)) for (const locale of locales) {
      const text = (messages as Record<string, Record<string, string>>)[key][locale];
      expect(text?.trim(), `${key}/${locale}`).toBeTruthy();
      expect(placeholders(text), `${key}/${locale}`).toEqual(placeholders(source.en));
    }
  });
});

describe("FanTag", () => {
  it("draws the artist check and no other leading icon", () => {
    const { container, rerender } = render(<FanTag tone="artist">인증 아티스트</FanTag>);
    expect(container.querySelector("svg")).toBeInTheDocument();
    rerender(<FanTag tone="neutral">브랜드</FanTag>);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("FanStarAction", () => {
  it("runs once while pending and keeps its label with aria-busy", () => {
    const onClick = vi.fn();
    const { rerender } = render(<FanStarAction state="empty" label="가입" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "가입" }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<FanStarAction state="empty" label="가입" onClick={onClick} pending />);
    const button = screen.getByRole("button", { name: "가입" });
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
  it("is a plain status when it has nothing to do", () => {
    render(<FanStarAction state="filled" label="가입함" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("가입함").parentElement).toHaveAttribute("data-fan-star", "filled");
  });
});

describe("FanSkeleton", () => {
  it("hides its bars from assistive tech and marks the group busy with no loading text", () => {
    const { container } = render(<><FanSkeleton width={40} height={12} /><FanSkeletonRows rows={3} variant="post" /></>);
    expect(container.querySelector('[data-fan-skeleton="post"]')).toHaveAttribute("aria-busy", "true");
    expect(container.querySelectorAll('[data-fan-skeleton="post"] > div')).toHaveLength(3);
    expect(container.textContent).toBe("");
    expect(Array.from(container.querySelectorAll("span")).every((bar) => bar.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("FanTabs", () => {
  it("marks the strip while more tabs sit past its right edge", () => {
    render(<FanTabs label="탭" current="home" items={[{ key: "home", label: "홈" }]} />);
    const nav = screen.getByRole("navigation", { name: "탭" });
    expect(nav).toHaveAttribute("data-more", "false");
    Object.defineProperty(nav, "clientWidth", { configurable: true, value: 300 });
    Object.defineProperty(nav, "scrollWidth", { configurable: true, value: 420 });
    fireEvent.scroll(nav);
    expect(nav).toHaveAttribute("data-more", "true");
    nav.scrollLeft = 120;
    fireEvent.scroll(nav);
    expect(nav).toHaveAttribute("data-more", "false");
  });
  const items = [{ key: "home", label: "홈", href: "/x?tab=home" }, { key: "board", label: "게시판", href: "/x?tab=board" }];
  it("marks the current link and never scrolls on navigation", () => {
    render(<FanTabs label="탭" current="board" items={items} />);
    expect(screen.getByRole("link", { name: "게시판" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
  });
  it("selects a button tab through onSelect and preloads before the press", () => {
    const onSelect = vi.fn(), onPreload = vi.fn();
    render(<FanTabs variant="chip" label="필터" current="a" items={[{ key: "a", label: "전체" }, { key: "b", label: "팬", onSelect, onPreload }]} />);
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.pointerEnter(screen.getByRole("button", { name: "팬" }));
    expect(onPreload).toHaveBeenCalledOnce();
    act(() => { fireEvent.click(screen.getByRole("button", { name: "팬" })); });
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("FanEntityCard", () => {
  it("keeps one card to a name line and a tag + fan count line", () => {
    render(<FanEntityCard href="/p" image={{ src: "/a.png" }} name="RUN&MUSIC" kind="brand" locale="ko" memberCount={1300} />);
    expect(screen.getByRole("link")).toHaveTextContent("RUN&MUSIC브랜드팬 1,300");
    expect(screen.getByText("브랜드")).toHaveAttribute("data-fan-tag", "neutral");
  });
  it("omits the fan count when it is unknown and shows initials without an image", () => {
    render(<FanEntityCard href="/p" image={{}} name="모임이름" kind="hobby" locale="ko" />);
    expect(screen.getByRole("link")).not.toHaveTextContent("팬");
    expect(screen.getByText("모임")).toBeInTheDocument();
  });
});

describe("FanPostRow", () => {
  it("formats today as a clock and any other day as a date", () => {
    const now = new Date(2026, 10, 7, 12, 0);
    expect(fanPostTimeLabel(new Date(2026, 10, 7, 9, 5), now)).toBe("09:05");
    expect(fanPostTimeLabel(new Date(2026, 10, 3, 9, 5), now)).toBe("11. 03.");
    expect(fanPostTimeLabel("not-a-date", now)).toBe("");
  });
  it("swaps a broken or missing image for the post icon and drops empty columns", () => {
    const { container, rerender } = render(<FanPostRow href="/p" locale="ko" title="제목" thumbnail="/broken.png" author="별빛" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.textContent).not.toContain("—");
    rerender(<FanPostRow href="/p" locale="ko" title="제목" thumbnail={null} views={null} likes={3} density="board" />);
    expect(screen.getByText("추천 3")).toBeInTheDocument();
    expect(screen.queryByLabelText(/조회/)).toBeNull();
  });
  it("labels board numbers on the row itself", () => {
    render(<FanPostRow href="/p" locale="ko" title="제목" author="별빛" views={1234} likes={3} density="board" />);
    expect(screen.getByText("조회 1,234")).toBeInTheDocument();
    expect(screen.getByText("추천 3")).toBeInTheDocument();
  });
  it("shows the notice tag, the comment count and a source link beside the row link", () => {
    render(<FanPostRow href="/p/1" locale="ko" title="공지 글" notice commentCount={8} source={{ label: "엘리나", href: "/elina?tab=board" }} density="home" views={12} />);
    expect(screen.getByText("공지")).toHaveAttribute("data-fan-tag", "notice");
    expect(screen.getByLabelText("댓글 8")).toHaveTextContent("[8]");
    expect(screen.getByRole("link", { name: "엘리나" })).toHaveAttribute("href", "/elina?tab=board");
    expect(screen.queryByLabelText(/조회/)).toBeNull();
  });

  it("puts the verified artist tag next to the author, not inside the name", () => {
    render(<FanPostRow href="/p/1" locale="ko" title="글" author="엘리나" authorArtist density="home" />);
    expect(screen.getByText("엘리나")).toHaveTextContent(/^엘리나$/);
    expect(screen.getByText("인증 아티스트")).toHaveAttribute("data-fan-tag", "artist");
  });
});

describe("FanPageHeader", () => {
  it("has no meta line and draws links, menu, stats and tabs in their own slots", () => {
    render(<FanPageHeader frameId="p1" image={{ src: "/a.png" }} name="RUN&MUSIC" kind="brand" locale="ko" description="소개 원문" star={{ state: "empty", label: "가입", onClick: () => {} }} links={[{ kind: "youtube", href: "https://y.test" }]} menu={<button>더보기</button>} stats={<div>띠</div>} tabs={<div>탭</div>} />);
    expect(screen.getByRole("heading", { level: 1, name: "RUN&MUSIC" })).toBeInTheDocument();
    expect(document.querySelector("[data-frame-id]")).toHaveAttribute("data-frame-id", "p1");
    expect(screen.getByRole("link", { name: "youtube" })).toHaveAttribute("data-outbound-kind", "social");
    expect(screen.queryByText(/브랜드 ·/)).toBeNull();
  });
});

describe("resource store", () => {
  it("keeps a value fresh for 30 seconds, and personal values only for the short first-load window", () => {
    vi.useFakeTimers();
    storeResource("o:/api/groups/1", { a: 1 });
    storeResource("o:/api/me/summary", { b: 1 });
    expect(peekResource("o:/api/groups/1")?.fresh).toBe(true);
    expect(peekResource("o:/api/me/summary")?.fresh).toBe(true);
    vi.advanceTimersByTime(ME_RESOURCE_FRESH_MS + 1);
    expect(peekResource("o:/api/me/summary")?.fresh).toBe(false);
    expect(peekResource("o:/api/groups/1")?.fresh).toBe(true);
    vi.advanceTimersByTime(RESOURCE_FRESH_MS + 1);
    expect(peekResource("o:/api/groups/1")?.fresh).toBe(false);
    expect(peekResource("o:/api/groups/1")?.value).toEqual({ a: 1 });
    vi.useRealTimers();
  });
  it("joins a read in flight, stores only success, and clears when the owner changes", async () => {
    const load = vi.fn(async () => 1);
    await Promise.all([shareResourceRead("k", load), shareResourceRead("k", load)]);
    expect(load).toHaveBeenCalledOnce();
    expect(peekResource("k")?.value).toBe(1);
    await expect(shareResourceRead("bad", async () => { throw new Error("x"); })).rejects.toThrow();
    expect(peekResource("bad")).toBeUndefined();
    syncResourceOwner("a:0");
    syncResourceOwner("b:0");
    expect(peekResource("k")).toBeUndefined();
    storeResource("k", 2);
    dropResource("k");
    expect(peekResource("k")).toBeUndefined();
    clearResources();
  });
  it("aborts a shared read only when every waiter has left", async () => {
    let signal: AbortSignal | undefined;
    const load = (received: AbortSignal) => { signal = received; return new Promise<number>(() => {}); };
    const first = new AbortController(), second = new AbortController();
    void shareResourceRead("shared", load, first.signal);
    void shareResourceRead("shared", load, second.signal);
    first.abort();
    expect(signal?.aborted).toBe(false);
    second.abort();
    expect(signal?.aborted).toBe(true);
  });
  it("does not store a read that a retry has superseded", async () => {
    let finish: (value: number) => void = () => {};
    const read = shareResourceRead("slow", () => new Promise<number>((resolve) => { finish = resolve; }));
    dropResource("slow");
    finish(1);
    await read;
    expect(peekResource("slow")).toBeUndefined();
  });
});
