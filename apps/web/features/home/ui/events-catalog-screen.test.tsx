import type { ComponentProps, ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import type { HomeBanner } from "../domain/home-banner";
import type { RaffleList } from "@/features/benefit/domain/raffle";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: ComponentProps<"a"> & { href: string }) => <a href={String(href)} {...props}>{children}</a> }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({
  FanAppFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
  FanContentContainer: ({ children, className, id }: { children: ReactNode; className?: string; id?: string }) => <main className={className} id={id}>{children}</main>,
}));

import { EventsCatalogScreen } from "./events-catalog-screen";
import { eventsCatalogCopy } from "./events-catalog-copy";

const banner: HomeBanner = {
  id: "banner", kind: "announcement", celebrityId: null,
  title: "공개 이벤트 제목", description: "등록된 설명 그대로", ctaLabel: "이벤트 확인", href: "/c/creator?tab=event#entry", alt: "원본 안내 이미지",
  desktopImage: { id: "desktop", url: "/banner.jpg", width: 1200, height: 600, mimeType: "image/jpeg", revision: 1 },
  mobileImage: null,
};

describe("events catalog", () => {
  it("lists original public copy and preserves the destination query and hash", () => {
    render(<EventsCatalogScreen locale="ko" homeBanners={[banner]} elinaRaffles={[]} showElinaCampaign={false} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("전체 이벤트");
    expect(screen.getByText(banner.description)).toBeVisible();
    expect(screen.getByRole("link", { name: /공개 이벤트 제목/ })).toHaveAttribute("href", "/c/creator?tab=event&locale=ko#entry");
    expect(screen.getByRole("img", { name: banner.alt })).toHaveAttribute("width", "1200");
  });

  it("leaves an external destination intact", () => {
    render(<EventsCatalogScreen locale="ja" homeBanners={[{ ...banner, href: "https://example.com/event?source=original#details" }]} elinaRaffles={[]} showElinaCampaign={false} />);
    expect(screen.getByRole("link", { name: /공개 이벤트 제목/ })).toHaveAttribute("href", "https://example.com/event?source=original#details");
  });

  it("uses the full group photo for a creator welcome card", () => {
    const image = { ...banner.desktopImage, width: 1200, height: 1200 };
    const mobileImage = { ...image, id: "mobile", url: "/group.jpg", width: 1200, height: 900 };
    const { container } = render(<EventsCatalogScreen locale="ko" homeBanners={[{ ...banner, kind: "announcement", celebrityId: "creator", desktopImage: image, mobileImage }]} elinaRaffles={[]} showElinaCampaign={false} />);
    expect(container.querySelector("picture source")).toBeNull();
    expect(screen.getByRole("img", { name: banner.alt }).getAttribute("src")).toContain("group.jpg");
  });

  it("shows retry rather than claiming an unavailable catalog is empty", () => {
    render(<EventsCatalogScreen locale="ko" homeBanners={[]} elinaRaffles={[]} showElinaCampaign={false} contentUnavailable />);
    expect(screen.getByRole("alert")).toHaveTextContent("일부 이벤트를 불러오지 못했어요.");
    expect(screen.queryByText("현재 공개된 이벤트가 없어요.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the home campaign after public banners when its portrait is missing", () => {
    render(<EventsCatalogScreen locale="ko" homeBanners={[banner]} elinaRaffles={[]} showElinaCampaign />);
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent(banner.title);
    expect(links[1]).toHaveAccessibleName("엘리나와 함께 뱅크시 전시 보러 가요");
    expect(links[0].className).toBe(links[1].className);
  });

  it("preserves the published result destination in the shared card", () => {
    render(<EventsCatalogScreen locale="ko" homeBanners={[banner]} elinaRaffles={[{ status: "closed", resultsPublishedAt: "2026-10-20T00:00:00Z" } as RaffleList["raffles"][number]]} showElinaCampaign />);
    expect(screen.getByRole("link", { name: /내 결과 확인/ })).toHaveAttribute("href", "/my/raffles?locale=ko");
  });

  it("provides complete UI copy for every supported locale", () => {
    for (const locale of APP_LOCALES) {
      expect(Object.values(eventsCatalogCopy(locale)).every(value => value.length > 0)).toBe(true);
    }
  });
});
