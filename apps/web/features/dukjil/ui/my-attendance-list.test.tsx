import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const page = (slug: string, celebrityId: string) => ({ id: `p-${slug}`, kind: "fan", celebrityId, slug, name: slug.toUpperCase(), description: "d", imageUrl: null, question: null, memberCount: 1 });
const h = vi.hoisted(() => ({ urls: [] as string[], list: undefined as unknown, status: undefined as unknown }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({
  GroupRequestError: class extends Error {},
  useGroupRequest: () => ({ request: vi.fn(), authenticated: true, ready: true, ownerKey: "u" }),
  useGroupResource: (url: string | null) => { if (url) h.urls.push(url); return { data: !url ? undefined : url.includes("/api/me/attendance") ? h.status : h.list, loading: false, error: false, retry: vi.fn() }; },
}));
vi.mock("@/features/groups/domain/contracts", async importOriginal => ({ ...(await importOriginal<object>()), groupListSchema: { parse: (v: unknown) => v } }));
import { MyAttendanceList } from "./my-attendance-list";

beforeEach(() => {
  h.urls = [];
  h.list = { items: [page("aespa", "11111111-1111-4111-8111-111111111111"), page("ive", "22222222-2222-4222-8222-222222222222")], nextCursor: null };
  h.status = { kstDate: "2026-11-05", items: [
    { celebrityId: "11111111-1111-4111-8111-111111111111", attendedToday: true, streak: 3, nextBonusIn: 4, hasPassport: true },
    { celebrityId: "22222222-2222-4222-8222-222222222222", attendedToday: false, streak: 0, nextBonusIn: 7, hasPassport: false },
  ] };
});

it("reads every row's state with one attendance request and no per-row provider", () => {
  render(<MyAttendanceList locale="ko" />);
  expect(new Set(h.urls.filter(url => url.includes("/api/me/attendance")))).toEqual(new Set(["/api/me/attendance?creators=aespa,ive"]));
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(document.querySelector("[data-earn-badge='done']")).not.toBeNull();
  expect(screen.getAllByRole("link").length).toBe(1);
});
