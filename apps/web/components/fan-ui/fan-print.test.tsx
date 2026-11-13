import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FanPrintChanceCard, FanPrintGiftCard, FanPrintPhotoInk, FanPrintTicket } from "./fan-print";

afterEach(cleanup);

it("prints the ticket facts and stamps it only when asked", () => {
  const props = { title: "KYAA RAFFLE", amount: "US$400", prize: "Visa 기프트카드", winners: "총 17명", deadlineLabel: "CLOSES", deadline: "2026.11.30 23:59 KST", serial: "No. SAMPLE", stub: "1인 1응모" };
  const { container, rerender } = render(<FanPrintTicket {...props} />);
  expect(container.textContent).toContain("US$400");
  expect(container.querySelector("[data-fan-print-stamp]")).toBeNull();
  rerender(<FanPrintTicket {...props} stamp="응모 완료" />);
  expect(container.querySelector("[data-fan-print-stamp]")?.textContent).toBe("응모 완료");
  expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
});

it("draws one card per winner, capped at ten", () => {
  const { container } = render(<><FanPrintGiftCard label="GIFT CARD" amount="US$25" note="KYAA RAFFLE 2026" count={4} /><FanPrintGiftCard label="GIFT CARD" amount="US$10" note="KYAA RAFFLE 2026" count={30} /></>);
  const piles = container.querySelectorAll("[data-fan-print='gift-card']");
  expect(piles[0].querySelectorAll("i[style]").length).toBe(3);
  expect(piles[0]).toHaveAttribute("data-art", "print");
  expect(piles[1].querySelectorAll("i[style]").length).toBe(9);
});

it("gives every chance row the same number of slots", () => {
  const { container } = render(<FanPrintChanceCard title="DAILY CHANCE" each="+1" slots={3} rows={[{ label: "댓글", stamp: "first-comment", cap: "하루 3번" }, { label: "출석", stamp: "daily-checkin", cap: "하루 3번" }]} />);
  expect(container.querySelectorAll("b").length).toBe(6);
  expect(container.querySelectorAll("img[data-art='stamp']").length).toBe(6);
});

it("pins photo print to the measured card corners in photo pixels", () => {
  const { container } = render(<FanPrintPhotoInk width={1920} height={750} cards={[{ tl: [100, 200], tr: [1100, 100], bl: [163, 830], lines: [{ text: "US$100", x: 70, y: 470, size: 210 }], mark: { x: 728, y: 66, width: 202 } }]} stamp={{ at: [50, 60], size: 90, turn: -6, lines: ["KYAA", "RAFFLE"] }} />);
  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("viewBox", "0 0 1920 750");
  expect(svg).toHaveAttribute("preserveAspectRatio", "xMidYMid slice");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("g[transform^='matrix']")).toHaveAttribute("transform", "matrix(1 -0.1 0.1 1 100 200)");
  expect(container.textContent).toBe("US$100KYAARAFFLE");
});
