import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: vi.fn() }));
import { groupRoute } from "./dependencies";
import { groupPublicRoomsRoute } from "@/server/group-members/dependencies";

const url = "https://example.test";

describe("secret rooms closed", () => {
 it.each([["rooms", "GET"], ["messages", "GET"]] as const)("answers the %s list with 200 and an empty closed list", async (operation, method) => {
  const response = await groupRoute(operation, new Request(url, { method }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ closed: true, roomCount: 0, items: [], rooms: [] });
 });
 it.each([["rooms", "POST"], ["messages", "POST"], ["room", "GET"], ["room", "PATCH"], ["room-state", "PATCH"], ["message", "DELETE"], ["room-read", "POST"]] as const)("locks %s %s with 423, never 5xx", async (operation, method) => {
  const response = await groupRoute(operation, new Request(url, { method }));
  expect(response.status).toBe(423);
  expect((await response.json()).error.code).toBe("SECRET_ROOM_COMING_SOON");
 });
 it("answers the public room list with 200 and an empty closed list", async () => {
  const response = await groupPublicRoomsRoute(new Request(url), "id");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ closed: true, roomCount: 0, items: [], rooms: [] });
 });
});
