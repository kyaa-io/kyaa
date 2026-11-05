import "server-only";
import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { boundedText } from "@/server/auth/apple-notifications/reauthentication-provider";
import type { RewardedExchangeDecision } from "@/features/group-wallet/rewarded-config";
import { walletSchema, exchangeInputSchema, exchangeSchema, adSessionInputSchema, adSessionReportInputSchema, adSessionSchema, checkInSchema, requestSchema, historySchema, supportInputSchema, supportSchema } from "./domain";

export interface GroupWalletDependencies {
  authorize(authorization: string | null): Promise<{ appUserId: string }>;
  rpc(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** Ticket conversion stays closed (fail closed) unless the single rewarded-exchange decision is enabled. */
  rewardedExchange?: RewardedExchangeDecision;
}
const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const codes = { NOT_FOUND: 404, UNAVAILABLE: 503, WRITE_FENCED: 503, INVALID: 400, REQUEST_CONFLICT: 409, POLICY_CHANGED: 409, INSUFFICIENT_BALANCE: 409, BALANCE_INVALID: 503, REWARDS_NOT_STARTED: 409, TARGET_UNAVAILABLE: 404, AD_GATE_CLOSED: 403, AD_CONFIG_MISSING: 503, AD_SESSION_REQUIRED: 400, AD_SESSION_INVALID: 409, AD_DAILY_LIMIT: 429, AD_RATE_LIMITED: 429 } as const;
export function groupWalletFailure(error: unknown): Response {
  if (error instanceof AuthError) return Response.json({ error: { code: error.status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN" } }, { status: error.status, headers });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return Response.json({ error: { code: "GROUP_WALLET_INVALID" } }, { status: 400, headers });
  const message = error instanceof Error ? error.message : "";
  const code = (Object.keys(codes) as (keyof typeof codes)[]).find(key => message.includes(`GROUP_WALLET_${key}`));
  return Response.json({ error: { code: `GROUP_WALLET_${code ?? "UNAVAILABLE"}` } }, { status: code ? codes[code] : 503, headers });
}
export function createGroupWalletHandlers(deps: GroupWalletDependencies) {
  async function run<T>(request: Request, schema: z.ZodType<T>, name: string, args: () => Promise<Record<string, unknown>> | Record<string, unknown>) {
    try {
      const owner = await deps.authorize(request.headers.get("authorization"));
      const raw = await deps.rpc(name, { p_app_user_id: owner.appUserId, ...await args() });
      const result = schema.safeParse(raw);
      if (!result.success) throw new Error("GROUP_WALLET_UNAVAILABLE");
      return Response.json(result.data, { headers });
    } catch (error) { return groupWalletFailure(error); }
  }
  /** Closed decisions never reach the wallet: no session, no ad, no exchange. */
  function openExchange() {
    const decision = deps.rewardedExchange;
    if (decision?.enabled === true) return decision;
    throw new Error(decision?.reason === "config_missing" ? "GROUP_WALLET_AD_CONFIG_MISSING" : "GROUP_WALLET_AD_GATE_CLOSED");
  }
  const body = async <T>(request: Request, schema: z.ZodType<T>) => schema.parse(JSON.parse(await boundedText(request, 2048)));
  return {
    wallet: (r: Request) => run(r, walletSchema, "read_owned_group_wallet", () => ({})),
    exchange: (r: Request) => run(r, exchangeSchema, "exchange_owned_group_wallet", async () => {
      const input = await body(r, exchangeInputSchema);
      // Hearts and tickets share one gate: closed or unconfigured ad settings refuse both before the database is called.
      const open = openExchange();
      if (input.units !== 1) throw new Error("GROUP_WALLET_INVALID");
      if (!input.adSessionId) throw new Error("GROUP_WALLET_AD_SESSION_REQUIRED");
      return { p_request_key: input.requestKey, p_policy_version: input.policyVersion, p_target: input.target, p_units: input.units, p_ad_session_id: input.adSessionId, p_daily_cap: open.session.dailyCap };
    }),
    adSession: (r: Request) => run(r, adSessionSchema, "issue_owned_group_wallet_ad_session", async () => {
      await body(r, adSessionInputSchema);
      const { session } = openExchange();
      return { p_ttl_seconds: session.ttlSeconds, p_issue_limit: session.issueLimit, p_issue_window_seconds: session.issueWindowSeconds, p_daily_cap: session.dailyCap };
    }),
    adSessionReport: (r: Request) => run(r, adSessionSchema, "report_owned_group_wallet_ad_session", async () => {
      const input = await body(r, adSessionReportInputSchema);
      const { session } = openExchange();
      return { p_session_id: input.sessionId, p_event: input.event, p_min_watch_seconds: session.minWatchSeconds };
    }),
    support: (r: Request) => run(r, supportSchema, "send_owned_group_wallet_support", async () => {
      const input = await body(r, supportInputSchema);
      return { p_request_key: input.requestKey, p_policy_version: input.policyVersion, p_celebrity_slug: input.celebritySlug, p_units: input.units };
    }),
    checkIn: (r: Request) => run(r, checkInSchema, "check_in_owned_group_wallet", async () => ({ p_request_key: (await body(r, z.object({ requestKey: z.uuid() }).strict())).requestKey })),
    request: (r: Request, key: string) => run(r, requestSchema, "read_owned_group_wallet_request", () => ({ p_request_key: z.uuid().parse(key) })),
    history: (r: Request) => run(r, historySchema, "read_owned_group_wallet_history", () => {
      const values = new URL(r.url).searchParams.getAll("limit");
      if (values.length > 1) throw new SyntaxError("duplicate query");
      return { p_limit: z.coerce.number().int().min(1).max(100).parse(values[0] ?? 30) };
    }),
  };
}
