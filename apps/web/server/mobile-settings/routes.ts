import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { AuthorizedFan } from "@/server/fan-auth/fan-auth-gate";
import type { MobileSettingsRepository } from "./repository";

const locale = z.enum([
  "ko",
  "en",
  "ja",
  "zh-Hans",
  "zh-Hant",
  "es",
  "id",
  "vi",
  "th",
  "pt",
  "fr",
]);
const topics = z
  .object({
    schedule: z.boolean().optional(),
    benefit: z.boolean().optional(),
    community: z.boolean().optional(),
    marketing: z.boolean().optional(),
    participation: z.boolean().optional(),
    favoriteNews: z.boolean().optional(),
    social: z.boolean().optional(),
    activity: z.boolean().optional(),
    friendActivity: z.boolean().optional(),
  })
  .strict();
const patch = z
  .object({
    expectedRevision: z.number().int().positive(),
    preferredLocale: locale.optional(),
    regionCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
    qrVisible: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    topics: topics.optional(),
  })
  .strict();
const installation = z
  .object({
    installationId: z.uuid(),
    expectedInstallationVersion: z.number().int().nonnegative(),
    platform: z.enum(["ios", "android"]),
    pushToken: z.string().min(8).max(4096).optional(),
    permission: z.enum(["authorized", "provisional", "denied"]),
    appVersion: z.string().min(1).max(80),
    locale,
    requestId: z.uuid(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.permission === "denied" && v.pushToken !== undefined)
      c.addIssue({ code: "custom", message: "denied token" });
    if (v.permission !== "denied" && v.pushToken === undefined)
      c.addIssue({ code: "custom", message: "token required" });
  });
const unlinkInstallation = z
  .object({
    expectedInstallationVersion: z.number().int().positive(),
    requestId: z.uuid(),
  })
  .strict();
const unlinkedInstallation = z
  .object({
    installationId: z.uuid(),
    installationVersion: z.number().int().positive(),
    linkVersion: z.number().int().positive(),
    accountVersion: z.number().int().positive(),
    status: z.literal("disabled"),
    replayed: z.boolean(),
  })
  .strict();
const category = z.enum([
  "schedule",
  "benefit",
  "community",
  "participation",
  "account",
  "activity",
  "relationships",
  "info",
]);
const headers = { "cache-control": "private, no-store", vary: "Authorization" };

export interface MobileSettingsRouteDependencies {
  authorize(value: string): Promise<AuthorizedFan>;
  repository: MobileSettingsRepository;
}
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}
function fail(error: unknown): Response {
  if (error instanceof AuthError)
    return json(
      {
        error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" },
      },
      error.status,
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return json({ error: { code: "INVALID_REQUEST" } }, 400);
  const message = error instanceof Error ? error.message : "";
  if (
    message.includes("MOBILE_SETTINGS_REVISION_CONFLICT") ||
    message.includes("MOBILE_INSTALLATION_REVISION_CONFLICT")
  )
    return json({ error: { code: "REVISION_CONFLICT" } }, 409);
  if (message.includes("IDEMPOTENCY_CONFLICT"))
    return json({ error: { code: "REQUEST_CONFLICT" } }, 409);
  if (message.includes("INVALID"))
    return json({ error: { code: "INVALID_REQUEST" } }, 400);
  return json({ error: { code: "MOBILE_SETTINGS_UNAVAILABLE" } }, 503);
}
async function body(request: Request) {
  return JSON.parse(await boundedText(request, 70_000));
}
export function createMobileSettingsHandlers(
  deps: MobileSettingsRouteDependencies,
) {
  const owner = (r: Request) =>
    deps.authorize(r.headers.get("authorization") ?? "");
  return {
    async getSettings(r: Request) {
      try {
        return json({
          settings: await deps.repository.getSettings(
            (await owner(r)).appUserId,
          ),
        });
      } catch (e) {
        return fail(e);
      }
    },
    async patchSettings(r: Request) {
      try {
        const u = await owner(r),
          v = patch.parse(await body(r));
        const { expectedRevision, ...changes } = v;
        return json({
          settings: await deps.repository.patchSettings(
            u.appUserId,
            expectedRevision,
            changes,
          ),
        });
      } catch (e) {
        return fail(e);
      }
    },
    async registerInstallation(r: Request) {
      try {
        const u = await owner(r);
        return json(
          {
            installation: await deps.repository.registerInstallation(
              u.appUserId,
              installation.parse(await body(r)),
            ),
          },
          201,
        );
      } catch (e) {
        return fail(e);
      }
    },
    async getInstallation(r: Request, installationId: string) {
      try {
        const u = await owner(r);
        return json({
          installation: await deps.repository.getInstallationVersion(
            u.appUserId,
            z.uuid().parse(installationId),
          ),
        });
      } catch (e) {
        return fail(e);
      }
    },
    async disableInstallation(r: Request, installationId: string) {
      try {
        const u = await owner(r),
          v = unlinkInstallation.parse(await body(r)),
          result = unlinkedInstallation.parse(
            await deps.repository.disableInstallation(
              u.appUserId,
              z.uuid().parse(installationId),
              v.expectedInstallationVersion,
              v.requestId,
            ),
          ),
          { replayed, ...installation } = result;
        return json({ installation, replayed });
      } catch (e) {
        return fail(e);
      }
    },
    async notifications(r: Request) {
      try {
        const u = await owner(r),
          q = new URL(r.url).searchParams;
        const cursorAt = q.get("cursorAt"),
          cursorId = q.get("cursorId");
        if (Boolean(cursorAt) !== Boolean(cursorId)) throw new z.ZodError([]);
        const requestedLocale = locale.parse(q.get("locale") ?? "ko");
        return json(
          await deps.repository.listNotifications(u.appUserId, {
            locale: requestedLocale === "ko" ? "ko" : "en",
            category: q.has("category")
              ? category.parse(q.get("category"))
              : null,
            limit: z.coerce
              .number()
              .int()
              .min(1)
              .max(100)
              .parse(q.get("limit") ?? 30),
            cursorAt: cursorAt
              ? z.iso.datetime({ offset: true }).parse(cursorAt)
              : null,
            cursorId: cursorId ? z.uuid().parse(cursorId) : null,
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
    async notification(r: Request, id: string) {
      try {
        const u = await owner(r),
          requestedLocale = locale.parse(
            new URL(r.url).searchParams.get("locale") ?? "ko",
          ),
          item = await deps.repository.getNotification(
            u.appUserId,
            z.uuid().parse(id),
            requestedLocale === "ko" ? "ko" : "en",
          );
        return item
          ? json({ notification: item })
          : json({ error: { code: "NOT_FOUND" } }, 404);
      } catch (e) {
        return fail(e);
      }
    },
    async markRead(r: Request, id: string) {
      try {
        const u = await owner(r),
          changed = await deps.repository.markNotificationRead(
            u.appUserId,
            z.uuid().parse(id),
          );
        return changed
          ? json({ read: true })
          : json({ error: { code: "NOT_FOUND" } }, 404);
      } catch (e) {
        return fail(e);
      }
    },
    async markAllRead(r: Request) {
      try {
        const u = await owner(r);
        await deps.repository.markNotificationRead(u.appUserId, null);
        return json({ read: true });
      } catch (e) {
        return fail(e);
      }
    },
  };
}
