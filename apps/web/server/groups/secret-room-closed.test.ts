import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: vi.fn() }));
import { groupRoute } from "./dependencies";
import { groupPublicRoomsRoute } from "@/server/group-members/dependencies";

describe("secret rooms closed", () => {
 it.each(["rooms", "room", "room-state", "messages", "message", "room-read"] as const)("rejects %s", async operation => {
  const response = await groupRoute(operation, new Request("https://example.test"));
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe("SECRET_ROOM_COMING_SOON");
 });
 it("rejects the public room list", async () => {
  expect((await groupPublicRoomsRoute(new Request("https://example.test"), "id")).status).toBe(503);
 });
});
