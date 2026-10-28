import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SurveyBuilder } from "./survey-builder";
const token = vi.hoisted(() => vi.fn(async () => "token"));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ getAccessToken: token }) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("./use-admin-session", () => ({ useAdminSession: () => ({ status: "authorized", admin: { role: "operator" } }) }));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("protects unclassified saved options and sends explicit policies for saved and new choices", async () => {
  const document = { liveEvent: { id: "live", slug: "live", status: "draft" }, versions: [{ id: "survey", version: 1, revision: 2, status: "draft", publishedAt: null, closedAt: null, archivedAt: null, sourceSurveyId: null, questions: [{ id: "question", type: "single_choice", commonKey: null, required: false, position: 1, text: { ko: "어떤 작품인가요?", en: "Choose a work" }, options: [
    { position: 1, label: { ko: "Love Rat", en: "Love Rat" } },
    { position: 2, label: { ko: "다음 작품", en: "Next artwork" }, preserveOriginal: false },
  ] }] }] };
  const writes: Array<{ questions: Array<{ options: Array<{ preserveOriginal: boolean }> }> }> = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    if (init?.method === "POST") writes.push(JSON.parse(String(init.body)));
    return Response.json({ data: document });
  }));
  render(<SurveyBuilder liveEventId="live" />);
  const policies = await screen.findAllByRole("checkbox", { name: "곡명·작품명 원문 유지" });
  expect(policies[0]).toBeChecked();
  expect(policies[1]).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: /^Option$/ }));
  expect(screen.getAllByRole("checkbox", { name: "곡명·작품명 원문 유지" })[2]).not.toBeChecked();
  fireEvent.click(policies[1]);
  fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
  await waitFor(() => expect(writes).toHaveLength(1));
  expect(writes[0].questions[0].options.map(option => option.preserveOriginal)).toEqual([true, true, false]);
});
