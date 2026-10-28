import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SupabaseLiveSurveyRepository } from "./live-survey-repository";
import { SupabaseLiveMissionRepository } from "./live-mission-repository";

const owner = "11111111-1111-4111-8111-111111111111";
const input = { appUserId: owner, slug: "mixed-options", locale: "en" as const };
const survey = { survey: { id: owner, version: 1, questions: [] }, eligibility: { completedAttendance: true }, response: null, completion: null };

describe("option translation projection compatibility", () => {
  it("keeps legacy repository callers on the original RPCs", async () => {
    const surveyRpc = vi.fn().mockResolvedValue({ data: survey, error: null });
    const missionRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await new SupabaseLiveSurveyRepository({ rpc: surveyRpc }).get(input);
    await new SupabaseLiveMissionRepository({ rpc: missionRpc } as never).list(input);
    expect(surveyRpc).toHaveBeenCalledWith("get_owned_live_survey", expect.objectContaining({ p_app_user_id: owner }));
    expect(missionRpc).toHaveBeenCalledWith("get_owned_live_missions", expect.objectContaining({ p_app_user_id: owner }));
  });

  it.each(["survey", "missions"] as const)("falls back only when the new %s RPC itself is absent", async kind => {
    const modern = `get_owned_live_${kind}_v2`, legacy = `get_owned_live_${kind}`;
    const rpc = vi.fn().mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: `Could not find the function public.${modern}` } })
      .mockResolvedValueOnce({ data: kind === "survey" ? survey : [], error: null });
    const repository = kind === "survey" ? new SupabaseLiveSurveyRepository({ rpc }) : new SupabaseLiveMissionRepository({ rpc } as never);
    const args = { ...input, optionTranslationPolicy: true };
    await (repository instanceof SupabaseLiveSurveyRepository ? repository.get(args) : repository.list(args));
    expect(rpc.mock.calls.map(call => call[0])).toEqual([modern, legacy]);
  });

  it.each([
    { code: "42501", message: "permission denied" },
    { code: "42883", message: "internal function missing" },
    { code: "PGRST202", message: "get_another_function is absent" },
  ])("does not hide RPC failure $code by falling back", async error => {
    for (const kind of ["survey", "missions"] as const) {
      const rpc = vi.fn().mockResolvedValue({ data: null, error });
      const repository = kind === "survey" ? new SupabaseLiveSurveyRepository({ rpc }) : new SupabaseLiveMissionRepository({ rpc } as never);
      const args = { ...input, optionTranslationPolicy: true };
      await expect(repository instanceof SupabaseLiveSurveyRepository ? repository.get(args) : repository.list(args)).rejects.toThrow();
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
});

import { createGetLiveMissionsHandler } from "./live-mission-route";
import { createGetLiveSurveyHandler } from "./live-survey-route";
it.each([false, true])("uses versioned HTTP projections only for an explicit opt-in: %s", async modern => {
  const suffix = modern ? "&optionTranslationPolicy=1" : "";
  const surveyRpc = vi.fn().mockResolvedValue({ data: survey, error: null });
  const missionRpc = vi.fn().mockResolvedValue({ data: [], error: null });
  const authorize = async () => ({ appUserId: owner });
  const surveyHandler = createGetLiveSurveyHandler({ authorize, repository: new SupabaseLiveSurveyRepository({ rpc: surveyRpc }) });
  const missionHandler = createGetLiveMissionsHandler({ authorize, repository: new SupabaseLiveMissionRepository({ rpc: missionRpc } as never) });
  expect((await surveyHandler(new Request(`https://byus.test/api?locale=en${suffix}`), { slug: input.slug })).status).toBe(200);
  expect((await missionHandler(new Request(`https://byus.test/api?locale=en${suffix}`), { slug: input.slug })).status).toBe(200);
  expect(surveyRpc.mock.calls[0][0]).toBe(`get_owned_live_survey${modern ? "_v2" : ""}`);
  expect(missionRpc.mock.calls[0][0]).toBe(`get_owned_live_missions${modern ? "_v2" : ""}`);
});
