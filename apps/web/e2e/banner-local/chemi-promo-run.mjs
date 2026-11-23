import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { startHarness } from "./server.mjs";

const out = path.resolve(process.env.BANNER_EVIDENCE_DIR ?? "test-results/banner-local/chemi-promo");
await mkdir(out, { recursive: true });
const harness = await startHarness({ port: 4201 });
const browser = await chromium.launch();
const now = new Date("2026-11-24T14:58:00Z");
const popup = {
  id: "90000000-0000-4000-8000-000000000002", kind: "announcement", celebrityId: null, category: "guide",
  placement: "chemi_promo_popup", startsAt: "2026-11-24T00:00:00Z", endsAt: "2026-12-24T00:00:00Z",
  title: "케미 탭이 열렸어요", description: "운세를 보고, 미니게임을 즐기며, 미니 최애를 키워요.",
  ctaLabel: "케미 해 보기", href: "/guide/chemi", alt: "달빛 아래 모인 케미의 주인공 네 명",
  desktopImage: { id: "90000000-0000-4000-8000-000000000003", url: "/chemi/chemi-promo.webp", width: 1774, height: 887, revision: 1, mimeType: "image/webp" },
  mobileImage: null,
};
const key = `kyaa:chemi-promo:${popup.id}`;
try {
  for (const width of [390, 1440]) {
    for (const member of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      await page.clock.setFixedTime(now);
      if (member) await page.addInitScript(() => localStorage.setItem("banner-local-account", "did:privy:fixture-a"));
      const event = { ...popup, id: "90000000-0000-4000-8000-000000000004", placement: "member_event_popup", title: "회원 이벤트", href: "/live/elina-week-0" };
      let eventAvailable = member;
      await page.route("**/api/public/banner-slots?area=member-event&*", route => route.fulfill({ json: { slots: eventAvailable ? { member_event_popup: event } : {} } }));
      await page.route("**/api/public/banner-slots?area=chemi-promo&*", route => route.fulfill({ json: { slots: { chemi_promo_popup: popup } } }));
      const url = harness.baseURL + "/event-popup-preview?scenario=chemi&locale=ko";
      await page.goto(url);
      const dialog = page.getByRole("dialog", { name: popup.title });
      if (member) {
        await expect(page.getByRole("dialog", { name: event.title })).toBeVisible();
        await expect(dialog).toHaveCount(0);
        eventAvailable = false;
        await page.keyboard.press("Escape");
      }
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(1);
      await expect(dialog.getByRole("link", { name: popup.ctaLabel })).toHaveAttribute("href", "/guide/chemi?locale=ko");
      await expect.poll(() => dialog.getByRole("img").evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      const state = member ? "member" : "guest";
      await page.screenshot({ path: path.join(out, `modal-${state}-${width}.png`) });
      for (const [toggle, expiry] of [
        ["오늘 하루 안 보기", Date.parse("2026-11-24T15:00:00Z")],
        ["일주일간 안 보기", +now + 604_800_000],
      ]) {
        await dialog.getByRole("button", { name: toggle }).click();
        assert.equal(await page.evaluate(key => Number(localStorage.getItem(key)), key), expiry);
        await page.clock.setFixedTime(new Date(expiry - 1));
        await page.reload();
        await expect(dialog).toHaveCount(0);
        if (toggle === "일주일간 안 보기") {
          const banner = page.locator('[data-home-hero-banner][data-kind="chemi"]').first();
          await expect(banner).toBeVisible();
          await expect.poll(() => banner.locator('[data-hero-full-image] img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
          await banner.screenshot({ path: path.join(out, `banner-${state}-${width}.png`) });
        }
        await page.clock.setFixedTime(new Date(expiry));
        await expect(dialog).toBeVisible();
        await page.clock.setFixedTime(now);
      }
      await page.close();
    }
  }
  console.log("Chemi promo browser checks passed.");
} finally {
  await browser.close();
  await harness.close();
}
