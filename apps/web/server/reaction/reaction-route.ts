import "server-only";

import { AuthError } from "../../features/auth/domain/auth-errors";
import { FanAuthUnavailableError } from "../fan-auth/fan-auth-gate";
import { awardDukjilAction } from "../dukjil/award";
import { ReactionRepositoryError, type ReactionRepository } from "./reaction-repository";

export type ReactionRouteDependencies = {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  repository: ReactionRepository;
  // Optional: fan activity reward call (contract §11-B). Absent means no reward call.
  rpc?(name: string, args: Record<string, unknown>): Promise<unknown>;
};

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "private, no-store", vary: "Authorization" } });

export function createPostReactionHandler(deps: ReactionRouteDependencies) {
  return async (request: Request, input: { celebritySlug: string }): Promise<Response> => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.celebritySlug)) return json({ error: { code: "CREATOR_NOT_FOUND" } }, 404);
    let owner;
    try { owner = await deps.authorize(request.headers.get("authorization")); }
    catch (error) {
      if (error instanceof FanAuthUnavailableError) return json({ error: { code: "REACTION_UNAVAILABLE" } }, 503);
      if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
      return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
    }
    try {
      const result = await deps.repository.react({ appUserId: owner.appUserId, celebritySlug: input.celebritySlug });
      // One reward call per creator per KST day; the reward policy decides the amount (nothing while the policy is draft).
      if (deps.rpc) await awardDukjilAction({ rpc: deps.rpc }, { appUserId: owner.appUserId, creatorSlug: input.celebritySlug, actionKey: "reaction", sourceKey: `creator-reaction:${input.celebritySlug}:${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)}` });
      return json(result, 200);
    }
    catch (error) {
      if (error instanceof ReactionRepositoryError) {
        const status = error.code === "CREATOR_NOT_FOUND" ? 404 : error.code === "WALLET_NOT_READY" ? 409 : error.code === "USER_UNAVAILABLE" ? 403 : 503;
        return json({ error: { code: error.code } }, status);
      }
      return json({ error: { code: "REACTION_UNAVAILABLE" } }, 503);
    }
  };
}

export function createGetReactionHandler(deps: ReactionRouteDependencies) {
  return async (request: Request, input: { celebritySlug: string }): Promise<Response> => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.celebritySlug)) return json({ error: { code: "CREATOR_NOT_FOUND" } }, 404);
    let owner;
    try { owner = await deps.authorize(request.headers.get("authorization")); }
    catch (error) {
      if (error instanceof FanAuthUnavailableError) return json({ error: { code: "REACTION_UNAVAILABLE" } }, 503);
      if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
      return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, 401);
    }
    try { return json({ reaction: await deps.repository.find({ appUserId: owner.appUserId, celebritySlug: input.celebritySlug }) }, 200); }
    catch { return json({ error: { code: "REACTION_UNAVAILABLE" } }, 503); }
  };
}
