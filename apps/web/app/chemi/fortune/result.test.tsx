import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FortuneResult } from "./result";

const { toast, celebrate, getAccessToken } = vi.hoisted(() => ({
  toast: vi.fn(),
  celebrate: vi.fn(),
  getAccessToken: vi.fn(async () => "session"),
}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({
    ready: true,
    authenticated: true,
    user: { id: "member" },
    getAccessToken,
  }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: toast }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({
  celebrateReward: celebrate,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("copies the public share URL and records completion only after a successful copy", async () => {
  const fetcher = vi.fn(async (path: string) => {
    if (path === "/api/chemi/readings")
      return Response.json({
        readingId: "reading",
        replayed: true,
        reward: {},
        result: {
          score: 82,
          grade: { name: "좋은 날" },
          fields: { fandom: 88, people: 81, money: 79, rest: 83 },
          evidence: { dayPillar: "정유" },
          luck: { color: "초록" },
        },
      });
    if (path === "/api/chemi/rewards/today")
      return Response.json({ grants: [] });
    if (path === "/api/chemi/shares")
      return Response.json({
        shareId: "card",
        url: "/chemi/fortune?from=card",
      });
    return Response.json({});
  });
  const copy = vi
    .fn()
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValue(undefined);
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), { clipboard: { writeText: copy } }),
  );
  render(<FortuneResult locale="ko" />);
  const [button] = await screen.findAllByRole("button", { name: "자랑하기" });
  expect(toast).not.toHaveBeenCalled();
  expect(celebrate).not.toHaveBeenCalled();
  fireEvent.click(button!);
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ tone: "error" }),
    ),
  );
  expect(fetcher.mock.calls.flat()).not.toContain(
    "/api/chemi/shares/card/done",
  );
  fireEvent.click(button!);
  await waitFor(() =>
    expect(fetcher.mock.calls.flat()).toContain("/api/chemi/shares/card/done"),
  );
  expect(copy).toHaveBeenLastCalledWith(
    new URL("/chemi/fortune?from=card", location.origin).href,
  );
  expect(toast).toHaveBeenLastCalledWith(
    expect.objectContaining({ tone: "success" }),
  );
});
