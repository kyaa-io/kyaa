import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { celebrityHandlers, quizHandlers, type CmsRouteDeps } from "./content-cms-route";
import { AuthError } from "../../features/auth/domain/auth-errors";

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

describe("platform follower counts write boundary", () => {
  const admin = { email: "admin@example.test", role: "operator", appUserId: "11111111-1111-4111-8111-111111111111", allowlistId: "22222222-2222-4222-8222-222222222222" };
  const make = () => {
    const savePlatformFollowers = vi.fn().mockResolvedValue([]);
    const platformFollowers = vi.fn().mockResolvedValue([{ celebrityId, platform: "instagram", count: 12000 }]);
    const celebrities = vi.fn().mockResolvedValue([]);
    const authorize = vi.fn().mockResolvedValue(admin);
    const deps: CmsRouteDeps = { authorize, repository: { savePlatformFollowers, platformFollowers, celebrities } as never, invalidatePublicContent: vi.fn() };
    return { handlers: celebrityHandlers(deps), savePlatformFollowers, platformFollowers, authorize };
  };
  const post = (items: unknown) => new Request("https://byus.test/api/admin/celebrities", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer token" },
    body: JSON.stringify({ action: "save_platform_followers", celebrityId, items }),
  });

  it("turns what was typed into the stored count, rounding and wording, and keeps unconfirmed (empty) and zero apart", async () => {
    const { handlers, savePlatformFollowers } = make();
    const response = await handlers.POST(post([
      { platform: "instagram", text: "1.2만" }, { platform: "tiktok", text: "0" }, { platform: "youtube", text: "" }, { platform: "chzzk", text: "1,088" },
    ]));
    expect(response.status).toBe(200);
    expect(savePlatformFollowers).toHaveBeenCalledWith(expect.anything(), expect.any(String), celebrityId, [
      { platform: "instagram", count: 12000, digits: 2, sourceText: "1.2만" },
      { platform: "tiktok", count: 0, digits: null, sourceText: null },
      { platform: "youtube", count: null, digits: null, sourceText: null },
      { platform: "chzzk", count: 1088, digits: null, sourceText: null },
    ]);
  });

  it.each([
    ["not a count", [{ platform: "instagram", text: "많음" }]],
    ["a platform nobody supports", [{ platform: "facebook", text: "5" }]],
    ["the same platform twice", [{ platform: "tiktok", text: "5" }, { platform: "tiktok", text: "6" }]],
    ["nothing to save", []],
  ])("rejects %s without writing", async (_name, items) => {
    const { handlers, savePlatformFollowers } = make();
    const response = await handlers.POST(post(items));
    expect(response.status).toBe(400);
    expect(savePlatformFollowers).not.toHaveBeenCalled();
  });

  it("does not write when the caller is not an administrator", async () => {
    const { handlers, savePlatformFollowers, authorize } = make();
    authorize.mockRejectedValue(new AuthError("ADMIN_NOT_ALLOWLISTED", 403, "forbidden"));
    const response = await handlers.POST(post([{ platform: "tiktok", text: "5" }]));
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(savePlatformFollowers).not.toHaveBeenCalled();
  });

  it("the list read carries the counts next to the creators", async () => {
    const { handlers } = make();
    const body = await (await handlers.GET(new Request("https://byus.test/api/admin/celebrities", { headers: { authorization: "Bearer token" } }))).json();
    expect(body.platformFollowers).toEqual([{ celebrityId, platform: "instagram", count: 12000 }]);
  });
});
