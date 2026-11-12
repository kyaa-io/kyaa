import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomeBelowRankingSlot } from "./home-below-ranking-slot";
vi.mock("@/components/live-hero-carousel", () => ({ LiveHeroCarousel: ({homeBanners,renderBanner,compact,elinaGuide}:any) => <section data-compact={compact} data-guide={String(elinaGuide)}>{homeBanners.map(renderBanner)}</section> }));
vi.mock("next/link", () => ({ default: ({children,...props}:any) => <a {...props}>{children}</a> }));
describe("challenge banners", () => {
 it("reuses the compact hero carousel for the three approved creators", () => {
  const {container}=render(<HomeBelowRankingSlot locale="ko" />);
  expect(container.querySelector('section')).toHaveAttribute('data-compact','true');
  expect(screen.getAllByRole('link').map(a=>a.getAttribute('href'))).toEqual(['yuna','hiroro','mmnoo-s'].map(slug=>`/${slug}?locale=ko&challenge=jjinfan100`));
  expect(screen.getAllByRole('img')).toHaveLength(3);
  expect(screen.queryByText('찐팬이 100명 모이면 순위가 공개돼요')).not.toBeInTheDocument();
 });
});
