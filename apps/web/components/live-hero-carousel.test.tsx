import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bannerFixture as banner } from "../e2e/banner-local/fixture";
import { LiveCountdown, LiveHeroCarousel } from "./live-hero-carousel";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), null] }));
vi.mock("./auth-intent-link", () => ({ AuthIntentLink: ({ children }: { children: React.ReactNode }) => <a href="/live/test">{children}</a> }));

const advance = (ms = 6_000) => act(() => { vi.advanceTimersByTime(ms); });
const activeSlide = () => document.querySelector('[data-active="true"]')?.getAttribute("aria-label");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2027-01-01T00:00:00Z"));
  vi.stubGlobal("IntersectionObserver", undefined);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("hero visibility and independent pause reasons", () => {
  it("keeps user pause through hover, pointer release and blur", () => {
    render(<LiveHeroCarousel homeBanners={[banner]} locale="ko" />);
    const root = screen.getByRole("region");
    expect(root).toHaveAttribute("data-shine-paused", "false");
    fireEvent.click(screen.getByRole("button", { name: "자동 재생 정지" }));
    fireEvent.mouseEnter(root); fireEvent.pointerDown(root);
    fireEvent.mouseLeave(root); fireEvent.pointerUp(window); fireEvent.blur(root);
    advance(12_000);
    expect(activeSlide()).toBe("1 / 2");
    expect(root).toHaveAttribute("data-shine-paused", "true");
    fireEvent.click(screen.getByRole("button", { name: "자동 재생 시작" }));
    expect(root).toHaveAttribute("data-shine-paused", "false");
    advance();
    expect(activeSlide()).toBe("2 / 2");
  });

  it("does not clear keyboard pause when hover ends", () => {
    render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    const root = screen.getByRole("region");
    fireEvent.focus(root); fireEvent.mouseEnter(root); fireEvent.mouseLeave(root);
    advance(); expect(activeSlide()).toBe("1 of 2");
    fireEvent.blur(root); advance(); expect(activeSlide()).toBe("2 of 2");
  });

  it("stops timers offscreen and while the document is hidden", () => {
    let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() { intersect([{ isIntersecting: true }]); }
      disconnect = disconnect;
    });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const view = render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    act(() => intersect([{ isIntersecting: false }]));
    expect(screen.getByRole("region")).toHaveAttribute("data-shine-paused", "true");
    expect(vi.getTimerCount()).toBe(0);
    advance(); expect(activeSlide()).toBe("1 of 2");
    act(() => intersect([{ isIntersecting: true }]));
    hidden.mockReturnValue(true); fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByRole("region")).toHaveAttribute("data-shine-paused", "true");
    expect(vi.getTimerCount()).toBe(0);
    hidden.mockReturnValue(false); fireEvent(document, new Event("visibilitychange"));
    expect(screen.getByRole("region")).toHaveAttribute("data-shine-paused", "false");
    advance(); expect(activeSlide()).toBe("2 of 2");
    view.unmount(); expect(disconnect).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it("does not autoplay before the first screen has finished loading", () => {
    const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => window.setTimeout(callback, 300));
    vi.stubGlobal("cancelIdleCallback", (id: number) => window.clearTimeout(id));
    render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    advance(19_000);
    expect(activeSlide()).toBe("1 of 2");
    expect(screen.getByRole("region")).toHaveAttribute("data-shine-paused", "false");
    readyState.mockReturnValue("complete");
    act(() => { window.dispatchEvent(new Event("load")); });
    advance(299); advance(1);
    advance(5_999); expect(activeSlide()).toBe("1 of 2");
    advance(1); expect(activeSlide()).toBe("2 of 2");
  });

  it("starts after load without requestIdleCallback on the next task", () => {
    const readyState = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    vi.stubGlobal("requestIdleCallback", undefined);
    render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    advance(10_000); expect(activeSlide()).toBe("1 of 2");
    readyState.mockReturnValue("complete");
    act(() => { window.dispatchEvent(new Event("load")); });
    advance(0);
    advance(5_999); expect(activeSlide()).toBe("1 of 2");
    advance(1); expect(activeSlide()).toBe("2 of 2");
  });

  it("stops waiting for a load that never comes 20 seconds after mount", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    advance(19_999); expect(activeSlide()).toBe("1 of 2");
    advance(1);
    advance(5_999); expect(activeSlide()).toBe("1 of 2");
    advance(1); expect(activeSlide()).toBe("2 of 2");
  });

  it("keeps the autoplay schedule once the visitor has moved a slide before the page finished loading", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Next banner" }));
    expect(activeSlide()).toBe("2 of 2");
    advance(); expect(activeSlide()).toBe("1 of 2");
  });
});

describe("autoplay waits for the next slide's picture", () => {
  const second = { ...banner, id: "90000000-0000-4000-8000-000000000011", title: "두 번째 배너",
    desktopImage: { ...banner.desktopImage, id: "90000000-0000-4000-8000-000000000013" },
    mobileImage: { ...banner.mobileImage!, id: "90000000-0000-4000-8000-000000000014", url: "/images/guest-home/kara-second.jpg" } };
  const setup = () => {
    const ready = new WeakSet<HTMLImageElement>();
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockImplementation(function (this: HTMLImageElement) {
      return !this.src.includes("kara-second") || ready.has(this);
    });
    const view = render(<LiveHeroCarousel homeBanners={[banner, second]} elinaGuide={null} locale="en" />);
    const picture = [...view.container.querySelectorAll("img")].find((image) => image.src.includes("kara-second"))!;
    return { view, picture, finish: (event: "load" | "error") => { ready.add(picture); act(() => { fireEvent[event](picture); }); } };
  };

  it("moves as soon as the picture has loaded", () => {
    const { finish } = setup();
    advance(); advance(3_000); expect(activeSlide()).toBe("1 of 2");
    finish("load");
    expect(activeSlide()).toBe("2 of 2");
  });

  it("moves at once when the picture fails", () => {
    const { finish } = setup();
    advance(); expect(activeSlide()).toBe("1 of 2");
    finish("error");
    expect(activeSlide()).toBe("2 of 2");
  });

  it("moves after one more interval when the picture never finishes", () => {
    setup();
    advance(); advance(5_999); expect(activeSlide()).toBe("1 of 2");
    advance(1); expect(activeSlide()).toBe("2 of 2");
  });

  it("does not move when hovered while waiting, even if the picture then loads", () => {
    const { finish } = setup();
    advance(); fireEvent.mouseEnter(screen.getByRole("region"));
    finish("load"); advance(12_000);
    expect(activeSlide()).toBe("1 of 2");
  });

  it("leaves no timer or listener behind when unmounted while waiting", () => {
    const { view, finish } = setup();
    advance(); view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    finish("load");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("reduced motion", () => {
  it("keeps reduced-motion manual navigation and gives only the first image high priority", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<LiveHeroCarousel homeBanners={[banner]} locale="en" />);
    advance(12_000); expect(activeSlide()).toBe("1 of 2");
    expect(screen.getByRole("region")).toHaveAttribute("data-shine-paused", "true");
    expect(screen.getByRole("button", { name: "Pause autoplay" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next banner" }));
    expect(activeSlide()).toBe("2 of 2");
    expect(document.querySelectorAll('img[fetchpriority="high"]')).toHaveLength(1);
  });
});

it("updates a resumed countdown from the current clock and has no inactive interval", () => {
  const props = { effectiveStatus: "scheduled" as const, startsAt: "2027-01-01T00:01:00Z" };
  const view = render(<LiveCountdown {...props} active />);
  expect(screen.getByText("00:01:00")).toBeInTheDocument();
  view.rerender(<LiveCountdown {...props} active={false} />);
  expect(vi.getTimerCount()).toBe(0); advance(10_000);
  view.rerender(<LiveCountdown {...props} active />);
  expect(screen.getByText("00:00:50")).toBeInTheDocument();
});

it("renders a managed banner with its own artwork and preserves the guide", () => {
  const { container } = render(<LiveHeroCarousel homeBanners={[banner]} locale="ko" />);
  expect(container.querySelectorAll("article")).toHaveLength(2);
  expect(container.querySelectorAll("[data-home-hero-banner]")).toHaveLength(2);
  expect(screen.getByRole("link", { name: "방송 일정 보기" })).toHaveAttribute("href", "/live/calendar?celebrity=elina&locale=ko");
  expect(container.querySelector("picture img")).toHaveAttribute("src", expect.stringContaining("elina-card.jpg"));
  expect(container.querySelector('article[aria-hidden="true"]')).toHaveAttribute("inert");
});

it("keeps the managed banner order ahead of announced raffle results", () => {
  const { container } = render(<LiveHeroCarousel homeBanners={[banner]} locale="ko" elinaRaffles={[{
    id: "11111111-1111-4111-8111-111111111111", benefitId: "22222222-2222-4222-8222-222222222222",
    title: "한정판 스태츄", summary: "선물", imageUrl: null, winnerQuantity: 1, status: "closed",
    entryOpensAt: null, entryClosesAt: "2026-10-08T00:00:00Z", resultsPublishedAt: "2026-10-09T00:00:00Z",
    fulfillmentMethod: "physical_shipping", perFanTicketLimit: null,
  }]} />);
  expect(container.querySelector('[data-active="true"]')).toHaveTextContent(banner.title);
  expect(screen.getByRole("link", { name: "방송 일정 보기" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음 배너" }));
  expect(container.querySelector('[data-active="true"]')).toHaveTextContent("래플 결과가 발표됐어요");
  expect(screen.getByRole("link", { name: "내 결과 확인" })).toHaveAttribute("href", "/my/raffles?locale=ko");
  expect(container.querySelectorAll("article")).toHaveLength(2);
});

it("retains copy and the CTA when an image cannot load", () => {
  const { container } = render(<LiveHeroCarousel homeBanners={[banner]} locale="ko" />);
  fireEvent.error(container.querySelector("picture img")!);
  expect(container.querySelector("[data-banner-image-unavailable]")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "방송 일정 보기" })).toBeInTheDocument();
});

it.each([1200, 1800])("uses a split creator welcome only for square artwork (width %s)", (width) => {
  const { container } = render(<LiveHeroCarousel homeBanners={[{
    ...banner, kind: "announcement", celebrityId: "11111111-1111-4111-8111-111111111111",
    title: "We;Na × Kyaa", href: "/wena", ctaLabel: "위나 팬페이지 보기",
    desktopImage: { ...banner.desktopImage, width, height: 1200 },
  }]} locale="ko" />);
  const welcome = container.querySelector('[data-kind="welcome"]');
  if (width === 1200) {
    expect(welcome?.querySelector("[data-hero-mobile-image] picture")).toBeInTheDocument();
    expect(welcome?.querySelector("picture source")).toHaveAttribute("media", "(min-width: 768px) and (max-width: 1023px), (min-width: 1200px)");
  }
  else {
    expect(welcome).not.toBeInTheDocument();
    expect(container.querySelector('[data-kind="live"] picture')).toBeInTheDocument();
  }
  expect(screen.getByRole("link", { name: "위나 팬페이지 보기" })).toHaveAttribute("href", "/wena?locale=ko");
});

it("uses the same locale desktop source when the mobile asset is absent", () => {
  const { container } = render(<LiveHeroCarousel homeBanners={[{ ...banner, mobileImage: null }]} locale="en" />);
  expect(container.querySelector("picture")).toHaveAttribute("data-mobile-fallback", "true");
  expect(container.querySelector("picture img")).toHaveAttribute("src", expect.stringContaining("kara-hero.png"));
});
