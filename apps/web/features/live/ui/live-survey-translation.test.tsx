import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveSurveyScreen } from "./live-survey-screen";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "survey-translation-owner" }, getAccessToken: vi.fn(async () => "token") }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "survey-translation-owner", generation: 431 }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("translates survey questions while preserving artwork names, answer IDs and free-text input", async () => {
  const single = "a1f86df9-f5e4-4ee1-b375-d18092b63e6a", free = "f4742cc2-85c2-4e16-9df1-4a05b1d21346", option = "90339735-90b4-4e85-8707-d2037a6d35f9";
  const multiple = "73dc9da5-8899-4b50-a486-bf0be805c0ed", artwork = "737ea13d-b59c-4bf6-893f-1627e32a1681";
  const translated: Record<string, string> = { "가장 좋았던 순간은?": "Какой момент понравился больше всего?", "오프닝": "Начало", "의견을 남겨 주세요": "Оставьте отзыв", "좋아하는 작품은?": "Любимые произведения?", "Love Rat": "Крыса любви" };
  const drafts: Array<{ answers: unknown[] }> = [], translations: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/display-translations") {
      const body = JSON.parse(String(init?.body)) as { text: string };
      translations.push(body.text);
      return Response.json({ translatedText: translated[body.text] ?? body.text, cached: false });
    }
    if (init?.method === "PUT") {
      const draft = JSON.parse(String(init.body)); drafts.push(draft);
      return Response.json({ response: { status: "draft", revision: 1, answers: draft.answers, updatedAt: "2026-10-26T00:00:00Z" } });
    }
    return Response.json({ survey: { id: "819b52d9-62c3-450c-b3dc-78d84d2238c6", version: 1, questions: [
      { id: single, type: "single_choice", question: "가장 좋았던 순간은?", required: true, order: 1, options: [{ id: option, label: "오프닝", preserveOriginal: false, order: 1 }] },
      { id: multiple, type: "multiple_choice", question: "좋아하는 작품은?", required: false, order: 2, options: [{ id: artwork, label: "Love Rat", preserveOriginal: true, order: 1 }] },
      { id: free, type: "free_text", question: "의견을 남겨 주세요", required: false, order: 3, options: [] },
    ] }, eligibility: { completedAttendance: true }, response: null, completion: null });
  });
  vi.stubGlobal("fetch", fetcher);
  render(<LiveSurveyScreen slug="survey-translation" locale="ru" />);
  const answer = await screen.findByRole("radio", { name: "Начало" });
  const freeText = await screen.findByRole("textbox", { name: "Оставьте отзыв" });
  expect(screen.getByText("Какой момент понравился больше всего?")).toBeVisible();
  fireEvent.click(answer);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Love Rat" }));
  fireEvent.change(freeText, { target: { value: "내가 직접 쓴 비공개 답변" } });
  await waitFor(() => expect(drafts).toHaveLength(1), { timeout: 2500 });
  expect(drafts[0].answers).toEqual(expect.arrayContaining([{ questionId: single, selectedOptionIds: [option] }, { questionId: multiple, selectedOptionIds: [artwork] }, { questionId: free, freeText: "내가 직접 쓴 비공개 답변" }]));
  expect(freeText).toHaveValue("내가 직접 쓴 비공개 답변");
  expect(translations).not.toContain("내가 직접 쓴 비공개 답변");
  expect(translations).toContain("오프닝");
  expect(translations).not.toContain("Love Rat");
  expect(screen.getByText("Love Rat")).toHaveAttribute("translate", "no");
  expect(screen.queryByText("오프닝")).not.toBeInTheDocument();
});
