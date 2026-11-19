import { expect, it, vi } from "vitest";
import { POST } from "./route";

const { chemiMaintenanceRoute } = vi.hoisted(() => ({ chemiMaintenanceRoute: vi.fn() }));
vi.mock("@/server/chemi-mail/maintenance", () => ({ chemiMaintenanceRoute }));

it("dispatches the maintenance POST with its authentication headers", () => {
  const request = new Request("https://example.test/api/internal/chemi/maintenance", { method: "POST" });
  POST(request);
  expect(chemiMaintenanceRoute).toHaveBeenCalledWith(request);
});
