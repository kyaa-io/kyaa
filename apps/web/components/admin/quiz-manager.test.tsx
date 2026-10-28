import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuizManager } from "./quiz-manager";

const getAccessToken = vi.hoisted(() => vi.fn(async () => "token"));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ getAccessToken }) }));
vi.mock("./use-admin-session", () => ({
  useAdminSession: () => ({ status: "authorized", admin: { role: "operator" } }),
}));
vi.mock("./operations-shell", () => ({ AdminOperationsShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("quiz manager answer controls", () => {
  it("wraps each native correct-answer radio in a visible explicit hit label", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      items: [{
        id: "quiz-1", version: 1, status: "draft", publishedAt: null, everPublishedAt: null, retiredAt: null,
        questions: [{
          id: "question-1", position: 1, promptKo: "질문", promptEn: "Question", active: true,
          options: [1, 2, 3, 4].map((position) => ({ position, labelKo: `${position}번`, labelEn: `Option ${position}`, isCorrect: position === 1, active: true })),
        }],
      }],
    })));
    render(<QuizManager celebrityId="celebrity-1" />);
    const radio = await screen.findByLabelText("1번 선택지 정답");
    expect(radio).toHaveAttribute("type", "radio");
    expect(radio.closest("label")).toHaveTextContent("정답");
    expect(screen.getByLabelText("1번 선택지 원문 유지")).toBeChecked();
    fireEvent.click(screen.getByLabelText("1번 선택지 원문 유지"));
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ method: "POST" })));
    const save = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(save?.[1]?.body)).payload.questions[0].options.map((option: { preserveOriginal: boolean }) => option.preserveOriginal)).toEqual([false, true, true, true]);
    await screen.findByText("저장했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "문항 추가" }));
    await waitFor(() => expect(screen.getAllByLabelText("1번 선택지 원문 유지")).toHaveLength(2));
    expect(screen.getAllByLabelText("1번 선택지 원문 유지")[1]).not.toBeChecked();
  });
});
