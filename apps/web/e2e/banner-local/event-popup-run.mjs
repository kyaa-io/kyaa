import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { popupLive } from "./fixture.ts";
import { startHarness } from "./server.mjs";

const out = path.resolve(process.env.BANNER_EVIDENCE_DIR ?? "test-results/banner-local/member-event");
await mkdir(out, { recursive: true });
const harness = await startHarness({ port: 4199 });
const browser = await chromium.launch();
const asset = { id: "90000000-0000-4000-8000-000000000003", url: "/images/guest-home/elina-card.jpg", width: 1080, height: 1080, revision: 1, mimeType: "image/jpeg" };
const banner = {
  id: "90000000-0000-4000-8000-000000000001", kind: "announcement", celebrityId: null, category: "event",
  placement: "member_event_popup", startsAt: "2026-11-19T13:00:00.000Z", endsAt: "2026-11-20T00:00:00.000Z",
  title: "엘리나 정기 LIVE", description: "엘리나와 함께하는 라이브 방송에 참여해 보세요.", ctaLabel: "이벤트 참여하기",
  href: "/live/elina-week-0", alt: "엘리나", desktopImage: asset, mobileImage: null,
};
const evidence = {};
async function account(page, owner) {
  await page.evaluate(owner => {
    if (owner) localStorage.setItem("banner-local-account", owner);
    else localStorage.removeItem("banner-local-account");
    window.dispatchEvent(new Event("banner-local-account"));
  }, owner);
}
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: "reduce" });
    await page.clock.install({ time: new Date("2026-11-19T14:59:35Z") });
    const home = harness.baseURL + "/event-popup-preview?locale=ko";
    let mode = "active";
    let current = banner;
    let reads = 0;
    await page.route("**/api/public/banner-slots?area=member-event&*", route => {
      assert.match(route.request().headers().authorization, /^Bearer /);
      reads++;
      return route.fulfill({ status: mode === "error" ? 503 : 200, json: { slots: mode === "active" ? { member_event_popup: current } : {} } });
    });
    await page.route("**/api/me/page-notices?*", route => route.fulfill({ json: { seen: false } }));
    await page.goto(home);
    const modal = page.getByRole("dialog", { name: banner.title });
    await expect(modal).toHaveCount(0);
    assert.equal(reads, 0);
    await page.screenshot({ path: path.join(out, `empty-${width}.png`) });
    mode = "error";
    await account(page, "did:privy:fixture-a");
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(modal).toHaveCount(0);
    await page.screenshot({ path: path.join(out, `error-${width}.png`) });
    mode = "active";
    await page.goto(home + "&result=1");
    const result = page.getByRole("dialog", { name: "래플 결과 안내" });
    await expect(result).toBeVisible();
    await expect(modal).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(modal).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    const image = modal.getByRole("img");
    await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    evidence[width] = await modal.evaluate(dialog => {
      const title = getComputedStyle(dialog.querySelector("h2"));
      const body = getComputedStyle(dialog.querySelector("p"));
      const style = getComputedStyle(dialog);
      const img = dialog.querySelector("img");
      return { width: dialog.offsetWidth, title: [title.fontSize, title.fontWeight, title.lineHeight], body: [body.fontSize, body.lineHeight], gap: style.gap, padding: style.padding, radius: style.borderRadius, shadow: style.boxShadow, image: [img.clientWidth, img.clientHeight, img.naturalWidth, img.naturalHeight], close: dialog.querySelector("button").offsetHeight };
    });
    await page.screenshot({ animations: "disabled", path: path.join(out, `main-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await page.goto(home);
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "오늘 하루 안 보기" }).click();
    await page.reload();
    await expect.poll(() => page.evaluate(() => Object.entries(localStorage).find(([key]) => key.includes("member-event-popup"))?.[1])).toBe(String(Date.parse("2026-11-19T15:00:00Z")));
    await expect(modal).toHaveCount(0);
    await account(page, "did:privy:fixture-b");
    await expect(modal).toBeVisible();
    await account(page, null);
    await expect(modal).toHaveCount(0);
    await account(page, "did:privy:fixture-a");
    current = { ...banner, href: "/live/elina-week-1" };
    await page.reload();
    await expect(modal).toBeVisible();
    mode = "off";
    await page.clock.runFor(16_000);
    await expect(modal).toHaveCount(0);
    current = banner;
    const focusTarget = page.getByRole("link", { name: "전체 이벤트" });
    await focusTarget.focus();
    mode = "active";
    await page.clock.runFor(16_000);
    await expect(modal).toBeVisible();
    await page.keyboard.press("Escape");
    await page.clock.runFor(300);
    await expect(focusTarget).toBeFocused();
    await page.reload();
    await expect(modal).toBeVisible();
    await page.route("**/api/live-events/elina-week-0?*", route => route.fulfill({ json: popupLive }));
    await modal.getByRole("link", { name: banner.ctaLabel }).click();
    await expect(page).toHaveURL(/\/live\/elina-week-0\?locale=ko$/);
    await expect(modal).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "엘리나 정기 LIVE 1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "LIVE 예약하기" })).toBeVisible();
    await page.screenshot({ path: path.join(out, `detail-${width}.png`) });

    current = { ...banner, endsAt: new Date(await page.evaluate(() => Date.now()) + 6_000).toISOString() };
    await page.goto(home);
    await expect(modal).toBeVisible();
    await page.clock.runFor(7_000);
    await expect(modal).toHaveCount(0);

    const copy = { ...banner, desktopImage: asset };
    const { title, description, ctaLabel, href, alt, desktopImage, mobileImage } = copy;
    const localized = { title, description, ctaLabel, href, alt, desktopImage, mobileImage };
    let item = { id: banner.id, placement: banner.placement, kind: banner.kind, celebrityId: null, publicationStatus: "published", sortOrder: 0, revision: 1, startsAt: banner.startsAt, endsAt: banner.endsAt, localizations: { ko: localized, en: localized } };
    let adminMode = "active";
    await page.route("**/api/admin/home-banners", route => {
      if (route.request().method() === "POST") {
        const command = route.request().postDataJSON();
        if (command.action === "save") {
          assert.equal(command.placement, "member_event_popup");
          assert.equal(command.startsAt, "2026-11-19T13:30:00.000Z");
          assert.equal(command.endsAt, banner.endsAt);
          assert.equal(command.localizations.ko.href, banner.href);
          assert.equal(command.localizations.en.href, banner.href);
          item = { ...item, startsAt: command.startsAt, revision: item.revision + 1 };
        } else {
          assert.equal(command.action, "publication");
          assert.equal(command.publicationStatus, "draft");
          item = { ...item, publicationStatus: "draft", revision: item.revision + 1 };
        }
      }
      return route.fulfill({ status: adminMode === "error" ? 503 : 200, json: { items: adminMode === "active" ? [item] : [], celebrities: [] } });
    });
    for (const state of ["active", "empty", "error"]) {
      adminMode = state;
      await page.goto(harness.baseURL + "/admin/home-banners?locale=ko");
      await expect(page.getByRole("heading", { name: "배너 관리", exact: true })).toBeVisible();
      if (state === "active") await expect(page.getByLabel("이벤트 상세 경로")).toHaveValue(banner.href);
      else await expect(page.getByText(state === "empty" ? /등록된 배너/ : /처리하지 못/).first()).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: path.join(out, `admin-${state}-${width}.png`), fullPage: true });
      if (state === "active") {
        const start = page.getByLabel("노출 시작 (한국 시간)");
        await expect(start).toHaveValue("2026-11-19T22:00");
        await start.fill("2026-11-19T22:30");
        await page.getByRole("button", { name: "변경사항 저장" }).click();
        await expect(page.getByRole("status").filter({ hasText: "배너를 저장했습니다." })).toBeVisible();
        await page.getByRole("button", { name: "비공개로 전환" }).click();
        await expect(page.getByRole("button", { name: "공개", exact: true })).toBeVisible();
      }
    }
    await page.close();
  }
  await writeFile(path.join(out, "measurements.json"), JSON.stringify(evidence, null, 2));
} finally {
  await browser.close();
  await harness.close();
}
