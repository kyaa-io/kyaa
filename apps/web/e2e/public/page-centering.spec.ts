import { expect, test } from "@playwright/test";

// 넓은 PC 화면에서 헤더 안쪽 줄과 본문이 뷰포트 가운데에 있어야 한다(11/11 운영 "오른쪽으로 치우쳐짐" 확인).
const paths = ["/?locale=ko", "/pages/groups?locale=ko", "/benefits?locale=ko", "/my?locale=ko"];

for (const width of [1280, 1440, 1680, 1920, 2560]) {
  test(`header row and main sit at the viewport center at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      const offsets = await page.evaluate(() => {
        const viewportCenter = document.documentElement.clientWidth / 2;
        const center = (element: Element | null) => {
          if (!element) return null;
          const rect = element.getBoundingClientRect();
          return rect.left + rect.width / 2 - viewportCenter;
        };
        const header = document.querySelector("header");
        const controls = header ? [...header.querySelectorAll("a, button")].filter((element) => element.getBoundingClientRect().width > 0) : [];
        const first = controls[0]?.getBoundingClientRect();
        const last = controls.at(-1)?.getBoundingClientRect();
        return {
          main: center(document.querySelector("main")),
          nav: center(document.querySelector("header nav")),
          headerRow: first && last ? (first.left + last.right) / 2 - viewportCenter : null,
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(offsets.overflow, path).toBeLessThanOrEqual(0);
      expect(Math.abs(offsets.main ?? 99), `${path} main`).toBeLessThanOrEqual(1);
      if (offsets.nav !== null) expect(Math.abs(offsets.nav), `${path} header nav`).toBeLessThanOrEqual(1);
      expect(Math.abs(offsets.headerRow ?? 99), `${path} header row`).toBeLessThanOrEqual(1);
    }
  });
}
