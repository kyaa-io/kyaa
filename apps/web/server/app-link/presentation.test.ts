import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveAppLinkDestination } from "./destination";
import { resolveAppLinkPresentation } from "./presentation";

const creator = {
  slug: "nchive", locale: "ko" as const, name: "NCHIVE", summary: "오늘의 활동과 팬 이야기",
  image: { url: "/nchive.jpg", alt: "NCHIVE", position: "50% 50%" }, roles: ["artist" as const], themes: [], socialLinks: [], displayOrder: 1, fanCount: 10,
};

function loaders(overrides: Partial<Parameters<typeof resolveAppLinkPresentation>[2]> = {}) {
  return {
    creator: vi.fn(async () => creator),
    live: vi.fn(async () => null),
    benefit: vi.fn(async () => null),
    passport: vi.fn(async () => null),
    ...overrides,
  } as Parameters<typeof resolveAppLinkPresentation>[2];
}

describe("app-link presentation", () => {
  it("shows only published creator presentation data", async () => {
    await expect(resolveAppLinkPresentation(resolveAppLinkDestination("/c/nchive"), "ko", loaders())).resolves.toMatchObject({
      state: "available", title: "NCHIVE", subtitle: "오늘의 활동과 팬 이야기", image: { src: "/nchive.jpg" }, status: "creator", parentHref: "/nchive",
    });
  });

  it("does not expose metadata for a missing, private, or deleted target", async () => {
    const result = await resolveAppLinkPresentation(resolveAppLinkDestination("/c/private-artist"), "en", loaders({ creator: vi.fn(async () => null) }));
    expect(result).toEqual({ state: "unavailable", reason: "unavailable", parentHref: "/celebrities" });
    expect(JSON.stringify(result)).not.toContain("private-artist");
  });

  it("does not expose expired benefit metadata", async () => {
    const result = await resolveAppLinkPresentation(resolveAppLinkDestination("/benefits/10000000-0000-4000-8000-000000000001"), "ko", loaders({ benefit: vi.fn(async () => ({ title: "비공개 제목", summary: "비공개 설명", imageUrl: "/secret.jpg", state: "expired" })) }));
    expect(result).toEqual({ state: "unavailable", reason: "expired", parentHref: "/benefits" });
    expect(JSON.stringify(result)).not.toContain("비공개");
  });

  it("uses a generic presentation during a repository outage", async () => {
    const result = await resolveAppLinkPresentation(resolveAppLinkDestination("/live/nchive-live"), "ko", loaders({ live: vi.fn(async () => { throw new Error("offline"); }) }));
    expect(result).toEqual({ state: "generic" });
  });
});
