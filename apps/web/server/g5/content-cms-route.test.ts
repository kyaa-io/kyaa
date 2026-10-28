import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { quizHandlers, type CmsRouteDeps } from "./content-cms-route";

const celebrityId = "55555555-5555-4555-8555-555555555555";
const payload = {
  quizId: "44444444-4444-4444-8444-444444444444",
  questions: [{ position: 1, promptKo: "질문", promptEn: "Question", active: true,
    options: [1, 2, 3, 4].map(position => ({ position, labelKo: "선택지", labelEn: "Option", isCorrect: position === 1, active: true, preserveOriginal: position === 1 })),
  }],
};
function setup() {
  const saveQuiz = vi.fn().mockResolvedValue([]);
  const deps: CmsRouteDeps = {
    authorize: vi.fn().mockResolvedValue({ email: "admin@example.test", role: "operator", appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222" }),
    repository: { saveQuiz } as never,
    invalidatePublicContent: vi.fn(),
  };
  return { handler: quizHandlers(deps).POST, saveQuiz };
}
function request(value: unknown) {
  return new Request("https://byus.test/api/admin/celebrities/creator/quiz", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify({ action: "save", payload: value }),
  });
}
describe("quiz CMS option policy write boundary", () => {
  it.each([undefined, null, "true"])("rejects an omitted or invalid policy (%s) without overwriting existing classifications", async value => {
    const { handler, saveQuiz } = setup();
    const body = structuredClone(payload);
    Object.assign(body.questions[0].options[1], { preserveOriginal: value });
    const response = await handler(request(body), celebrityId);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("INVALID_REQUEST");
    expect(saveQuiz).not.toHaveBeenCalled();
  });
  it("preserves an explicit false policy through the HTTP boundary", async () => {
    const { handler, saveQuiz } = setup();
    const response = await handler(request(payload), celebrityId);
    expect(response.status).toBe(200);
    expect(saveQuiz).toHaveBeenCalledWith(expect.anything(), expect.any(String), celebrityId,
      expect.objectContaining({ questions: [expect.objectContaining({ options: expect.arrayContaining([expect.objectContaining({ position: 2, preserveOriginal: false })]) })] }));
  });
});
