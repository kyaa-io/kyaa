import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { getMatchCopy } from "@/app/chemi/games/match/copy";
import { getRunCopy } from "@/app/chemi/games/run/copy";
import { tarotCharacter } from "@/features/chemi/tarot/script";
import { pageLikeEventTitle } from "@/features/reaction/domain/page-like-event";
import { creatorName, creatorNameSlugs } from "./creator-names";

const hangul = /[가-힣]/;

describe("creatorName", () => {
  it("shows the chemi favorites in each language", () => {
    expect(creatorName("changha", "ko")).toBe("창하");
    expect(creatorName("changha", "en")).toBe("Changha");
    expect(creatorName("changha", "ja")).toBe("チャンハ");
    expect(creatorName("changha", "th")).toBe("ชางฮา");
    expect(creatorName("changha", "ru")).toBe("Чанха");
    expect(creatorName("changha", "zh-Hans")).toBe("Changha");
    expect(creatorName("elina", "ja")).toBe("エリナ");
    expect(creatorName("yuna", "ru")).toBe("Юна");
    expect(creatorName("dosa", "ja")).toBe("kyaa ドサ");
  });

  it("never shows Hangul outside the Korean screen", () => {
    for (const slug of creatorNameSlugs)
      for (const locale of APP_LOCALES.filter((value) => value !== "ko"))
        expect(creatorName(slug, locale), `${slug} ${locale}`).not.toMatch(hangul);
  });

  it("keeps the stored name for Korean and Latin-script screens, and for creators without a row", () => {
    expect(creatorName("changha", "ko", "창하")).toBe("창하");
    expect(creatorName("changha", "en", "CHANGHA")).toBe("CHANGHA");
    expect(creatorName("changha", "ja", "Changha")).toBe("チャンハ");
    expect(creatorName("nchive", "ja", "NCHIVE")).toBe("NCHIVE");
    expect(creatorName("unknown", "fr", null)).toBe("unknown");
  });

  it("is the one source for chemi game, tarot and event names", () => {
    for (const locale of APP_LOCALES) {
      expect(getMatchCopy(locale).changha).toBe(creatorName("changha", locale));
      expect(getRunCopy(locale).elina).toBe(creatorName("elina", locale));
      expect(tarotCharacter("dosa", locale).name).toBe(creatorName("dosa", locale));
    }
    expect(pageLikeEventTitle("yuna", "ja")).toBe("ユナ × Kyaa");
    expect(pageLikeEventTitle("yuna", "ko")).toBe("유나 × Kyaa");
    expect(pageLikeEventTitle("nchive", "ja")).toBeUndefined();
  });
});
