import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { home as copy } from "@/features/chemi/i18n/locales/ko/chemi.json";
import { GameStatusChip } from "./game-status-chip";

vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "fan" }, getAccessToken: async () => "token" }),
}));

afterEach(() => vi.unstubAllGlobals());

it.each([
  [{ freeRemaining: 2, extraRemaining: 3, extraCost: 20 }, "무료 2판 남음"],
  [{ freeRemaining: 0, extraRemaining: 3, extraCost: 20 }, "추가 판 20P"],
  [{ freeRemaining: 0, extraCost: 100 }, "추가 판 100M"],
  [{ freeRemaining: 0, extraCost: 1000 }, "추가 판 1000P"],
])("shows a short chip for the account's lobby %o", async (lobby, label) => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(lobby)));
  render(<GameStatusChip game="pair" copy={copy} />);
  expect(await screen.findByText(label)).toBeVisible();
});
