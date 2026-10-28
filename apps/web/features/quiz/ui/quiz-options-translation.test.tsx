import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { QuizQuestionsScreen } from "./quiz-questions-screen";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "quiz-policy-owner" }, getAccessToken: vi.fn(async () => "token") }));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "quiz-policy-owner", generation: 761 }) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("translates ordinary options while preserving titles, legacy labels and submitted answer IDs", async () => {
  const translations: string[] = [], saved: unknown[] = [];
  const questions = [1, 2, 3].map(position => ({
    id: `a1500000-0000-4000-8000-00000000000${position}`, position,
    prompt: position === 1 ? "가장 좋아하는 순간은?" : "다음 질문", responseKind: "choice", selectedOptionId: null as string | null, freeText: null,
    options: [
      { id: `b1500000-0000-4000-800${position}-000000000001`, position: 1, label: "Dear Moon", preserveOriginal: true },
      { id: `b1500000-0000-4000-800${position}-000000000002`, position: 2, label: "오프닝", preserveOriginal: false },
      { id: `b1500000-0000-4000-800${position}-000000000003`, position: 3, label: "Killing Me Slowly" },
    ],
  }));
  const attempt = { attempt: { id: "c1500000-0000-4000-8000-000000000001", status: "open", score: null, submittedAt: null }, questions };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (String(input) === "/api/display-translations") {
      translations.push(body.text);
      return Response.json({ translatedText: body.text === "오프닝" ? "Начало" : "Какой момент вам нравится?" });
    }
    if (String(input).includes("/answers?")) {
      saved.push(body);
      questions[0].selectedOptionId = body.selectedOptionId;
      return Response.json({ attempt });
    }
    return Response.json({ result: { kind: "attempt", ...attempt } });
  }));
  render(<QuizQuestionsScreen slug="quiz-policy" locale="ru" />);
  const answer = await screen.findByRole("radio", { name: "Начало" });
  expect(screen.getByText("Dear Moon")).toHaveAttribute("translate", "no");
  expect(screen.getByText("Killing Me Slowly")).toHaveAttribute("translate", "no");
  expect(translations).toContain("오프닝");
  expect(translations).not.toContain("Dear Moon");
  expect(translations).not.toContain("Killing Me Slowly");
  fireEvent.click(answer);
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]).toEqual({ questionId: questions[0].id, selectedOptionId: questions[0].options[1].id });
});
