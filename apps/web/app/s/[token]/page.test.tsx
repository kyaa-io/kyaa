import { describe, expect, it, vi } from "vitest";
vi.mock("@/server/seo/public-content", () => ({ loadSeoCreator: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: vi.fn() }));
vi.mock("@/server/community-stamps/shared-passport", () => ({ readSharedPassportActivity: vi.fn() }));
import { APP_LOCALES } from "@/i18n/locales";
import { generateMetadata } from "./page";

const preview = async (locale?: string) => generateMetadata({ searchParams: Promise.resolve(locale ? { locale } : {}) });

describe("shared Passport link preview", () => {
  it("follows the link's language in title, description and picture", async () => {
    const ko = await preview("ko"), en = await preview("en"), ja = await preview("ja");
    expect(ko.openGraph?.title).toBe("함께 좋아하는 마음을 만나보세요. | kyaa");
    expect(en.openGraph?.title).toBe("Meet the favorite that brought you here. | kyaa");
    expect(ja.openGraph?.title).toBe("あなたをここへ導いた推しに会いましょう。 | kyaa");
    expect(ko.openGraph?.description).toBe("이 패스포트로 연결된 최애 페이지에서 소식과 팬 활동을 확인할 수 있어요.");
    for (const [locale, meta] of [["ko", ko], ["en", en], ["ja", ja]] as const) {
      const images = (meta.openGraph as { images: { url: string }[] }).images;
      expect(new URL(images[0]!.url).searchParams.get("locale")).toBe(locale);
      expect(new URL(images[0]!.url).pathname).toBe("/share/passport.png");
    }
    expect(JSON.stringify(ko)).not.toContain("A favorite worth sharing");
  });
  it("has a distinct title in every language and stays out of search", async () => {
    const titles = new Set<string>();
    for (const locale of APP_LOCALES) { const meta = await preview(locale); titles.add(String(meta.title)); expect(meta.robots).toEqual({ index: false, follow: false }); }
    expect(titles.size).toBe(APP_LOCALES.length);
  });
});
