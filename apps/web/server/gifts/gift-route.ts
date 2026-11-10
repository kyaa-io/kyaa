import "server-only";
import { z } from "zod";
import { AuthError } from "../../features/auth/domain/auth-errors";
import { FanAuthUnavailableError } from "../fan-auth/fan-auth-gate";
import type { GiftRepository } from "./gift-repository";

export interface GiftRouteDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  repository: GiftRepository;
}

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "cache-control": "private, no-store", vary: "Authorization" } });
export const giftUnavailable = () => json({ error: { code: "GIFTS_UNAVAILABLE" } }, 503);
const notFound = () => json({ error: { code: "GIFT_NOT_FOUND" } }, 404);
const localeSchema = z.enum(["ko", "en"]).default("ko");
const readLocale = (request: Request) => localeSchema.safeParse(new URL(request.url).searchParams.get("locale") ?? "ko");

async function authorize(request: Request, dependencies: GiftRouteDependencies) {
  try { return await dependencies.authorize(request.headers.get("authorization")); }
  catch (error) {
    if (error instanceof FanAuthUnavailableError) return giftUnavailable();
    if (error instanceof AuthError) return json({ error: { code: "AUTHENTICATION_REQUIRED" } }, error.status);
    return giftUnavailable();
  }
}

export function createListGiftsHandler(dependencies: GiftRouteDependencies) {
  return async (request: Request) => {
    const locale = readLocale(request);
    if (!locale.success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const owner = await authorize(request, dependencies);
    if (owner instanceof Response) return owner;
    try { return json({ gifts: await dependencies.repository.list({ appUserId: owner.appUserId, locale: locale.data }) }); }
    catch { return giftUnavailable(); }
  };
}

/** Another fan's gift, a result that was not a win and an unknown id all answer the same 404. */
export function createGetGiftHandler(dependencies: GiftRouteDependencies) {
  return async (request: Request, input: { rewardResultId: string }) => {
    if (!z.uuid().safeParse(input.rewardResultId).success) return notFound();
    const locale = readLocale(request);
    if (!locale.success) return json({ error: { code: "INVALID_REQUEST" } }, 400);
    const owner = await authorize(request, dependencies);
    if (owner instanceof Response) return owner;
    try {
      const gift = await dependencies.repository.find({ appUserId: owner.appUserId, rewardResultId: input.rewardResultId, locale: locale.data });
      return gift ? json({ gift }) : notFound();
    } catch { return giftUnavailable(); }
  };
}

export function createReadGiftHandler(dependencies: GiftRouteDependencies) {
  return async (request: Request, input: { rewardResultId: string }) => {
    if (!z.uuid().safeParse(input.rewardResultId).success) return notFound();
    const owner = await authorize(request, dependencies);
    if (owner instanceof Response) return owner;
    try {
      const unread = await dependencies.repository.markRead({ appUserId: owner.appUserId, rewardResultId: input.rewardResultId });
      return unread ? json(unread) : notFound();
    } catch { return giftUnavailable(); }
  };
}
