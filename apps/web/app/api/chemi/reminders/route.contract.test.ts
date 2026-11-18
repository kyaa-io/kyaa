import { expect, it, vi } from "vitest";
import { DELETE, POST } from "./route";

const { reminderRoute } = vi.hoisted(() => ({ reminderRoute: vi.fn() }));
vi.mock("@/server/chemi-mail/reminders", () => ({ reminderRoute }));

it("routes POST to subscribe and DELETE to cancel", () => {
  const request = new Request("https://example.test/api/chemi/reminders");
  POST(request);
  DELETE(request);
  expect(reminderRoute.mock.calls).toEqual([[request, true], [request, false]]);
});
