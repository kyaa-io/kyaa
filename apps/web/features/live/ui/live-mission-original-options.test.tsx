import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ArtMissionPlay } from "./art-mission-play";
import { LiveMissionScreen } from "./live-mission-screen";
import { liveMissionSchema } from "../domain/live-mission";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "mission-original-owner" }, getAccessToken: async () => "token", login: vi.fn() }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "mission-original-owner", generation: 947 }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mission = liveMissionSchema.parse({
  id: "10000000-0000-4000-8000-000000000001", type: "quiz", version: 1, title: "작품 퀴즈", description: "작품을 선택해 주세요", attendanceRequired: false, completed: false,
  visibleFrom: "2026-09-10T00:00:00Z", visibleUntil: "2026-09-11T00:00:00Z",
  questions: [{ id: "20000000-0000-4000-8000-000000000001", text: "어떤 작품인가요?", media: null, options: [
    { id: "30000000-0000-4000-8000-000000000001", label: "Love Rat", preserveOriginal: true, displayMode: "text", media: null },
    { id: "30000000-0000-4000-8000-000000000002", label: "Girl with Balloon", preserveOriginal: true, displayMode: "text", media: null },
  ] }],
});
function mockFetch() {
  const translated: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/display-translations") {
      const { text } = JSON.parse(String(init?.body)); translated.push(text);
      return Response.json({ translatedText: `translated: ${text}`, cached: false });
    }
    return url.includes("/missions?") ? Response.json([mission]) : new Response(null, { status: 404 });
  }));
  return translated;
}
it("keeps mission choices out of automatic translation while translating questions", async () => {
  const translated = mockFetch();
  render(<LiveMissionScreen slug="original-options" locale="ru" />);
  expect(await screen.findByRole("radio", { name: "Love Rat" })).toBeVisible();
  await screen.findByText("translated: 어떤 작품인가요?");
  expect(screen.getByText("Love Rat")).toHaveAttribute("translate", "no");
  expect(screen.getByText("Girl with Balloon")).toHaveAttribute("translate", "no");
  expect(translated).not.toContain("Love Rat");
  expect(translated).not.toContain("Girl with Balloon");
});
it("keeps artwork names intact in choices, preview, selection and completion", async () => {
  const translated = mockFetch();
  const vote = { ...mission, type: "vote" as const, questions: [{ ...mission.questions[0], options: mission.questions[0].options.map(option => ({ ...option, displayMode: "text_media" as const, media: { type: "image" as const, url: "https://example.com/artwork.webp" } })) }] };
  const props = { missions: [vote], locale: "ru" as const, answers: {}, submissions: {}, errors: {}, onAnswer: vi.fn(), onSubmit: vi.fn() };
  const view = render(<ArtMissionPlay {...props} />);
  expect(await screen.findByRole("heading", { name: "translated: 어떤 작품인가요?" })).toBeVisible();
  const protectedNames = () => screen.getAllByText("Love Rat").forEach(node => expect(node).toHaveAttribute("translate", "no"));
  protectedNames();
  view.rerender(<ArtMissionPlay {...props} answers={{ [vote.questions[0].id]: vote.questions[0].options[0].id }} />);
  protectedNames();
  expect(screen.getByRole("heading", { name: "Love Rat" })).toBeVisible();
  view.rerender(<ArtMissionPlay {...props} missions={[{ ...vote, completed: true }]} answers={{ [vote.questions[0].id]: vote.questions[0].options[0].id }} />);
  await waitFor(() => expect(screen.getByText("Love Rat")).toHaveAttribute("translate", "no"));
  expect(translated).not.toContain("Love Rat");
  expect(translated).not.toContain("Girl with Balloon");
});

it("translates explicitly ordinary mission choices and protects unclassified legacy choices", async () => {
  const translated = mockFetch();
  const choices = structuredClone(mission);
  choices.questions[0].options[0] = { ...choices.questions[0].options[0], label: "다음 무대", preserveOriginal: false };
  delete choices.questions[0].options[1].preserveOriginal;
  const fetcher = globalThis.fetch;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => String(input).includes("/missions?") ? Promise.resolve(Response.json([choices])) : fetcher(input, init)));
  render(<LiveMissionScreen slug="mixed-policy-options" locale="ru" />);
  expect(await screen.findByRole("radio", { name: "translated: 다음 무대" })).toBeVisible();
  expect(screen.getByText("Girl with Balloon")).toHaveAttribute("translate", "no");
  expect(translated).toContain("다음 무대");
  expect(translated).not.toContain("Girl with Balloon");
});
