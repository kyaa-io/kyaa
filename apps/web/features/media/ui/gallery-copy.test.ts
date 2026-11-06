import { expect, it } from "vitest";
import { messages } from "@/i18n/catalogs/features__media__gallery";
import { APP_LOCALES } from "@/i18n/locales";
import { galleryTitle, noPostsText, viewAllText } from "./gallery-copy";
import { gallerySource } from "./gallery-source";

it("fills every added locale", () => {
  expect(Object.keys(messages).sort()).toEqual(Object.keys(gallerySource).sort());
  for (const locale of APP_LOCALES) { expect(galleryTitle(locale).trim(), locale).toBeTruthy(); expect(noPostsText(locale).trim(), locale).toBeTruthy(); expect(viewAllText(locale).trim(), locale).toBeTruthy(); }
  expect(galleryTitle("ko")).toBe("갤러리");
  expect(galleryTitle("en")).toBe("Gallery");
});
