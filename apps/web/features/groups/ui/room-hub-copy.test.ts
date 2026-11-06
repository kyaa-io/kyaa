import { describe, expect, it } from "vitest";
import { messages } from "@/i18n/catalogs/features__groups__ui__room-hub-source";
import { APP_LOCALES } from "@/i18n/locales";
import { roomHubText } from "./room-hub-copy";
import { roomHubSource } from "./room-hub-source";
describe("room hub copy", () => {
  it("fills every added locale for every key", () => {
    const locales = APP_LOCALES.filter(locale => locale !== "ko" && locale !== "en");
    expect(Object.keys(messages).sort()).toEqual(Object.keys(roomHubSource).sort());
    for (const key of Object.keys(roomHubSource)) for (const locale of locales) expect((messages as Record<string, Record<string, string>>)[key][locale]?.trim(), `${key}/${locale}`).toBeTruthy();
  });
  it("reads ko and en from the source and the rest from the catalog", () => {
    expect(roomHubText("ko", "enter")).toBe("들어가기");
    expect(roomHubText("en", "otherRooms")).toBe("Other rooms");
    expect(roomHubText("ja", "viewConditions")).toBe("条件を見る");
  });
});
