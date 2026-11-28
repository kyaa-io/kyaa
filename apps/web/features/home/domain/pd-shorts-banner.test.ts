import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { getPdNoticeAction } from "./pd-shorts-banner";

describe("Na PD notice action", () => {
  it.each(APP_LOCALES)("opens the notice in %s with a translated action", locale => {
    const { href, label } = getPdNoticeAction(locale);
    expect(href).toBe(`/notices/kyaa-wave-na-pd-video-1117?locale=${locale}`);
    expect(label.trim()).not.toBe("");
  });

  it("uses a distinct action for each supported language", () => {
    expect(new Set(APP_LOCALES.map(locale => getPdNoticeAction(locale).label)).size).toBe(APP_LOCALES.length);
    expect(getPdNoticeAction("ko").label).toBe("영상 보고 댓글 남기기");
  });
});
