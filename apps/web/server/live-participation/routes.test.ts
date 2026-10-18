import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "../../features/auth/domain/auth-errors";
import { createGetParticipationHandler, createPostParticipationHandler, createGetParticipationSummaryHandler, createGetPublicLiveDashboardHandler } from "./routes";
import { LiveParticipationError, LiveParticipationRepository } from "./repository";
import { participationSubmitSchema } from "./domain";
const id = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const repository = { catalog: vi.fn(), submit: vi.fn(), summary: vi.fn(), dashboard: vi.fn() };
const deps = { repository: repository as unknown as LiveParticipationRepository, authorize: vi.fn(async () => ({appUserId: "verified-owner"})), authorizeAdmin: vi.fn(), readOnchain: vi.fn() };
beforeEach(() => vi.clearAllMocks());
it("allows a public catalog while deriving optional owner only from verified authorization", async () => {
  repository.catalog.mockResolvedValue({missions: []});
  const read = createGetParticipationHandler(deps);
  expect((await read(new Request("https://byus.test/api?phase=during&appUserId=attacker"), {slug: "real-live"})).status).toBe(200);
  expect(deps.authorize).not.toHaveBeenCalled(); expect(repository.catalog).toHaveBeenLastCalledWith("real-live", "during", null);
  await read(new Request("https://byus.test/api?phase=after", {headers:{authorization:"Bearer token"}}), {slug:"real-live"});
  expect(repository.catalog).toHaveBeenLastCalledWith("real-live", "after", "verified-owner");
});
it("preserves authorization failures instead of silently downgrading to guest", async () => {
  deps.authorize.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED",401,"no"));
  expect((await createGetParticipationHandler(deps)(new Request("https://byus.test/api",{headers:{authorization:"bad"}}),{slug:"real-live"})).status).toBe(401);
  expect(repository.catalog).not.toHaveBeenCalled();
});
it("rejects reward/owner fields and malformed kind-specific payloads before the RPC", async () => {
  const submit = createPostParticipationHandler(deps);
  for (const body of [{missionId:id,requestKey:key,payload:{kind:"reservation"},owner:"attacker"}, {missionId:id,requestKey:key,payload:{kind:"image",uploadIds:[]}}, {missionId:id,requestKey:key,payload:{kind:"url",url:"javascript:alert(1)"}}, {missionId:id,requestKey:key,payload:{kind:"bonus"}}]) {
    expect((await submit(new Request("https://byus.test/api",{method:"POST",body:JSON.stringify(body)}),{slug:"real-live"})).status).toBe(422);
  }
  expect(repository.submit).not.toHaveBeenCalled();
});
it("uses the whole validated payload and lets incorrect quizzes retry without claiming an award", async () => {
  repository.submit.mockRejectedValueOnce(new LiveParticipationError("LIVE_PARTICIPATION_QUIZ_INCORRECT"));
  const payload={kind:"quiz",answers:[{questionId:id,optionIds:[key]}]};
  const response=await createPostParticipationHandler(deps)(new Request("https://byus.test/api",{method:"POST",body:JSON.stringify({missionId:id,requestKey:key,payload})}),{slug:"real-live"});
  expect(response.status).toBe(409);expect(await response.json()).toEqual({error:{code:"LIVE_PARTICIPATION_QUIZ_INCORRECT"}});
  expect(repository.submit).toHaveBeenCalledWith("verified-owner","real-live",{missionId:id,requestKey:key,payload});
});
it("requires a verified owner for summary and never accepts one from the query", async () => {
  repository.summary.mockResolvedValue({});
  await createGetParticipationSummaryHandler(deps)(new Request("https://byus.test/api?creator=real-creator&owner=attacker"));
  expect(repository.summary).toHaveBeenCalledWith("verified-owner","real-creator");
});
it("keeps DB and GIWA availability independent and allowlists business metrics only", async () => {
  repository.dashboard.mockRejectedValueOnce(new Error("private database url"));
  deps.readOnchain.mockResolvedValueOnce({state:"available",snapshot:{generatedAt:"2026-10-19T00:00:00.000Z",blockTimestamp:"2026-10-19T00:00:00.000Z",business:{uniqueActiveWallets:1,actionCounts:{2:3},passportCredentials:1,mintedCredentials:1,lifecycleTransactions:1,currentActionTransactions:1},actions:[{wallet:"SECRET"}],raw:{uniqueActiveWallets:999}}});
  const result=await(await createGetPublicLiveDashboardHandler(deps)()).json();
  expect(result.database).toEqual({state:"unavailable"});expect(result.onchain.state).toBe("available");expect(JSON.stringify(result)).not.toMatch(/SECRET|"raw"|"actions"|999|private database/);
  repository.dashboard.mockResolvedValueOnce({approvedParticipation:2});deps.readOnchain.mockRejectedValueOnce(new Error("rpc url"));
  expect(await(await createGetPublicLiveDashboardHandler(deps)()).json()).toEqual({database:{state:"available",approvedParticipation:2},onchain:{state:"unavailable"}});
});
it("accepts only the three approved zero-reward crew roles", () => {
  for(const role of ["recording","guidance","highlights"])expect(participationSubmitSchema.safeParse({missionId:id,requestKey:key,payload:{kind:"crew",role}}).success).toBe(true);
  expect(participationSubmitSchema.safeParse({missionId:id,requestKey:key,payload:{kind:"crew",role:"chat-volume",points:20}}).success).toBe(false);
});
