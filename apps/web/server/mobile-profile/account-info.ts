import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { AuthError } from "../../features/auth/domain/auth-errors";
import type { AuthorizedFan } from "../fan-auth/fan-auth-gate";
import type { FanLoginProvider } from "../g5/fan-account-info";

const accountInfoSchema = z.object({
  email: z.email(),
  loginProviders: z.array(z.enum(["google", "apple", "email"])).nullable(),
  lastAuthenticatedAt: z.iso.datetime({ offset: true }).nullable(),
  publicAddress: z.string().regex(/^0x[0-9a-f]{40}$/).nullable(),
  passportCount: z.number().int().nonnegative(),
  activityCount: z.number().int().nonnegative(),
}).strict();

type AccountRow = {
  verifiedEmail: string;
  privyUserId: string;
  lastAuthenticatedAt: string | null;
  publicAddress: string | null;
  passportCount: number;
  activityCount: number;
};

export interface MobileAccountInfoRepository {
  find(appUserId: string): Promise<AccountRow | null>;
}

type ProviderReader = (ids: string[]) => Promise<Map<string, FanLoginProvider[] | null>>;

export function createMobileAccountInfoHandler(dependencies: {
  authorize(authorization: string): Promise<AuthorizedFan>;
  repository: MobileAccountInfoRepository;
  readProviders: ProviderReader;
}) {
  return async function GET(request: Request): Promise<Response> {
    const headers = { "cache-control": "private, no-store", vary: "Authorization" } as const;
    try {
      const fan = await dependencies.authorize(request.headers.get("authorization") ?? "");
      const account = await dependencies.repository.find(fan.appUserId);
      if (!account) {
        return Response.json({ error: { code: "NOT_FOUND" } }, { status: 404, headers });
      }
      const providers = await dependencies.readProviders([account.privyUserId]);
      return Response.json({
        account: accountInfoSchema.parse({
          email: account.verifiedEmail,
          loginProviders: providers.get(account.privyUserId) ?? null,
          lastAuthenticatedAt: account.lastAuthenticatedAt,
          publicAddress: account.publicAddress,
          passportCount: account.passportCount,
          activityCount: account.activityCount,
        }),
      }, { headers });
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json(
          { error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } },
          { status: error.status === 401 ? 401 : 403, headers },
        );
      }
      return Response.json(
        { error: { code: "ACCOUNT_INFO_UNAVAILABLE" } },
        { status: 503, headers },
      );
    }
  };
}

export function createMobileAccountInfoRepository(
  database: Pick<SupabaseClient, "from">,
): MobileAccountInfoRepository {
  return {
    async find(appUserId) {
      const [userResult, walletResult, passportResult, activityResult] = await Promise.all([
        database
          .from("app_users")
          .select("verified_email,privy_user_id,last_authenticated_at")
          .eq("id", appUserId)
          .maybeSingle(),
        database
          .from("user_wallets")
          .select("address")
          .eq("app_user_id", appUserId)
          .eq("chain_id", 91342)
          .maybeSingle(),
        database
          .from("fan_passports")
          .select("id", { count: "exact", head: true })
          .eq("app_user_id", appUserId)
          .eq("business_status", "issued"),
        database
          .from("fan_activities")
          .select("id", { count: "exact", head: true })
          .eq("app_user_id", appUserId),
      ]);
      if (
        userResult.error ||
        walletResult.error ||
        passportResult.error ||
        activityResult.error ||
        passportResult.count === null ||
        activityResult.count === null
      ) {
        throw new Error("Account info lookup failed");
      }
      if (!userResult.data) return null;
      return {
        verifiedEmail: userResult.data.verified_email,
        privyUserId: userResult.data.privy_user_id,
        lastAuthenticatedAt: userResult.data.last_authenticated_at,
        publicAddress: walletResult.data?.address ?? null,
        passportCount: passportResult.count,
        activityCount: activityResult.count,
      };
    },
  };
}
