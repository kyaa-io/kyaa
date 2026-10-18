import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import type { PassportReadRepository } from "@/server/g4/passport-read-repository";
import {
  mobileActivityCursorSchema,
  mobileActivityPageSchema,
  mobileDefaultPassportDetailSchema,
  mobileLevelsSchema,
  mobilePassportListSchema,
  mobilePassportPresentationSchema,
  mobilePassportShareInputSchema,
  mobilePassportShareSchema,
  mobileProfileSummarySchema,
  mobileStampPresentationSchema,
  mobileStampOpportunitiesSchema,
} from "./domain";

export interface MobileProfileDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  passports: PassportReadRepository;
}

const headers = {
  "cache-control": "private, no-store",
  vary: "Authorization",
} as const;
const localeSchema = z.enum(["ko", "en"]);
const uuid = z.uuid();
async function json(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new SyntaxError("invalid json");
  }
}
function one(url: URL, name: string) {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) throw new SyntaxError("duplicate query");
  return values[0] ?? null;
}
function cursor(raw: string | null) {
  if (!raw) return null;
  try {
    return mobileActivityCursorSchema.parse(
      JSON.parse(
        Buffer.from(z.string().max(500).parse(raw), "base64url").toString(
          "utf8",
        ),
      ),
    );
  } catch {
    throw new SyntaxError("invalid cursor");
  }
}
function fail(error: unknown, parsing = false) {
  if (error instanceof AuthError)
    return Response.json(
      { error: { code: "AUTHENTICATION_REQUIRED" } },
      { status: error.status, headers },
    );
  if (parsing || error instanceof z.ZodError || error instanceof SyntaxError)
    return Response.json(
      { error: { code: "INVALID_MOBILE_PROFILE_REQUEST" } },
      { status: 400, headers },
    );
  return Response.json(
    { error: { code: "MOBILE_PROFILE_UNAVAILABLE" } },
    { status: 503, headers },
  );
}

export function createMobileProfileHandlers(deps: MobileProfileDependencies) {
  const owner = async (request: Request) =>
    (await deps.authorize(request.headers.get("authorization"))).appUserId;
  return {
    async summary(request: Request) {
      let parsing = true;
      try {
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        parsing = false;
        return Response.json(
          mobileProfileSummarySchema.parse(
            await deps.rpc("read_owned_mobile_profile", {
              p_app_user_id: await owner(request),
              p_locale: locale,
            }),
          ),
          { headers },
        );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async passportList(request: Request) {
      let parsing = true;
      try {
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        parsing = false;
        return Response.json(
          mobilePassportListSchema.parse(
            await deps.rpc("read_owned_mobile_passports", {
              p_app_user_id: await owner(request),
              p_locale: locale,
            }),
          ),
          { headers },
        );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async passport(request: Request, id: string) {
      let parsing = true;
      try {
        const parsedId = uuid.parse(id);
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        const includeStages = one(url, "tierStages") === "1";
        parsing = false;
        const appUserId = await owner(request);
        const defaultPassport = await deps.rpc(
          "read_owned_mobile_default_passport",
          {
            p_app_user_id: appUserId,
            p_passport_id: parsedId,
            p_locale: locale,
          },
        );
        if (defaultPassport !== null)
          return Response.json(
            {
              passport:
                mobileDefaultPassportDetailSchema.parse(defaultPassport),
            },
            { headers },
          );
        const [value, presentation, publicStampCount] = await Promise.all([
          deps.passports.findPassport({
            id: parsedId,
            appUserId,
            locale,
            ...(includeStages ? { includeStages: true } : {}),
          }),
          deps.rpc("read_owned_mobile_passport_presentation", {
            p_app_user_id: appUserId,
            p_passport_id: parsedId,
            p_locale: locale,
          }),
          deps.rpc("read_owned_mobile_passport_public_stamp_count", {
            p_app_user_id: appUserId,
            p_passport_id: parsedId,
          }),
        ]);
        return value
          ? Response.json(
              {
                passport: {
                  ...value,
                  kind: "favorite",
                  publicStampCount: z.number().int().nonnegative().parse(publicStampCount),
                  presentation:
                    mobilePassportPresentationSchema.parse(presentation),
                },
              },
              { headers },
            )
          : Response.json(
              { error: { code: "NOT_FOUND" } },
              { status: 404, headers },
            );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async sharePassport(request: Request, id: string) {
      let parsing = true;
      try {
        const parsedId = uuid.parse(id);
        const input = mobilePassportShareInputSchema.parse(await json(request));
        parsing = false;
        return Response.json(
          mobilePassportShareSchema.parse(
            await deps.rpc("create_mobile_passport_share_link", {
              p_app_user_id: await owner(request),
              p_passport_id: parsedId,
              p_include_nickname: input.includeNickname,
              p_include_public_stamps: input.includePublicStamps,
            }),
          ),
          { headers },
        );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async stamp(request: Request, id: string) {
      let parsing = true;
      try {
        const parsedId = uuid.parse(id);
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        parsing = false;
        const appUserId = await owner(request);
        const [value, presentation] = await Promise.all([
          deps.passports.findStamp({ id: parsedId, appUserId, locale }),
          deps.rpc("read_owned_mobile_stamp_presentation", {
            p_app_user_id: appUserId,
            p_stamp_id: parsedId,
            p_locale: locale,
          }),
        ]);
        return value
          ? Response.json(
              {
                stamp: {
                  ...value,
                  presentation:
                    mobileStampPresentationSchema.parse(presentation),
                },
              },
              { headers },
            )
          : Response.json(
              { error: { code: "NOT_FOUND" } },
              { status: 404, headers },
            );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async stampOpportunities(request: Request) {
      let parsing = true;
      try {
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        parsing = false;
        return Response.json(
          mobileStampOpportunitiesSchema.parse(
            await deps.rpc("read_owned_mobile_stamp_opportunities", {
              p_app_user_id: await owner(request),
              p_locale: locale,
            }),
          ),
          { headers },
        );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async activities(request: Request) {
      let parsing = true;
      try {
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        const favoriteSlug = one(url, "favoriteSlug");
        if (
          favoriteSlug !== null &&
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(favoriteSlug)
        )
          throw new SyntaxError("invalid favorite");
        const before = cursor(one(url, "cursor"));
        const limit = z.coerce
          .number()
          .int()
          .min(1)
          .max(30)
          .parse(one(url, "limit") ?? 20);
        parsing = false;
        const page = mobileActivityPageSchema.parse(
          await deps.rpc("read_owned_mobile_profile_activities", {
            p_app_user_id: await owner(request),
            p_locale: locale,
            p_favorite_slug: favoriteSlug,
            p_before: before?.at ?? null,
            p_before_id: before?.id ?? null,
            p_before_kind: before?.kind ?? null,
            p_limit: limit,
          }),
        );
        return Response.json(
          {
            items: page.items,
            nextCursor: page.nextCursor
              ? Buffer.from(JSON.stringify(page.nextCursor)).toString(
                  "base64url",
                )
              : null,
          },
          { headers },
        );
      } catch (error) {
        return fail(error, parsing);
      }
    },
    async levels(request: Request) {
      let parsing = true;
      try {
        const url = new URL(request.url);
        const locale = localeSchema.parse(one(url, "locale") ?? "ko");
        parsing = false;
        return Response.json(
          mobileLevelsSchema.parse(
            await deps.rpc("read_owned_mobile_profile_levels", {
              p_app_user_id: await owner(request),
              p_locale: locale,
            }),
          ),
          { headers },
        );
      } catch (error) {
        return fail(error, parsing);
      }
    },
  };
}
