import { expect, it, vi } from "vitest";
vi.mock("@/server/schedules/routes", () => ({ participationRoute: vi.fn(async () => new Response(null, { status: 204 })) }));
import { participationRoute } from "@/server/schedules/routes";
import { PATCH } from "./route";

it("hands the page switch of one approved request to the admin participation route", async () => {
  const request = new Request("https://kyaa.test/api/admin/fanpage-requests/x/verification", { method: "PATCH", body: "{}" });
  expect((await PATCH(request, { params: Promise.resolve({ id: "7e570000-0000-4000-8000-000000002126" }) })).status).toBe(204);
  expect(participationRoute).toHaveBeenCalledWith("admin-page-verification", request, { id: "7e570000-0000-4000-8000-000000002126" });
});
