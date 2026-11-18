import "server-only";
import { z } from "zod";
import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { chemiAuthenticatedHandler } from "@/server/chemi-profile/handlers";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { CHEMI_CHAIN_SCHEMA } from "./chain-schema";

export function recordsRoute(request: Request, id?: string) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  return chemiAuthenticatedHandler(async (_, deps, user) => {
    const query = new URL(request.url).searchParams;
    const result = z
      .object({
        records: z.array(
          z.object({
            id: z.uuid(),
            kind: z.enum(Object.keys(CHEMI_CHAIN_SCHEMA)),
            kst_date: z.iso.date(),
            status: z.enum([
              "waiting_wallet",
              "pending",
              "leased",
              "sent",
              "minted",
              "retry",
              "burn_pending",
              "burned",
              "void",
            ]),
            attempts: z.number().int().nonnegative(),
            token_no: z.string().regex(/^\d+$/).nullable(),
            tx_hash: z
              .string()
              .regex(/^0x[0-9a-f]{64}$/)
              .nullable(),
            created_at: z.iso.datetime({ offset: true }),
          }),
        ),
        nextCursor: z.string().nullable(),
        delayed: z.boolean(),
      })
      .parse(
        await deps.rpc("chemi_chain_read", {
          p_user: user,
          p_id: id === undefined ? null : z.uuid().parse(id),
          p_cursor: z.uuid().nullable().parse(query.get("cursor")),
          p_filter: z
            .enum(Object.keys(CHEMI_CHAIN_SCHEMA))
            .nullable()
            .parse(query.get("filter")),
        }),
      );
    const missing = id && !result.records.length;
    return Response.json(
      missing
        ? { error: { code: "NOT_FOUND" } }
        : id
          ? result.records[0]
          : result,
      {
        status: missing ? 404 : 200,
        headers: {
          "cache-control": "private, no-store",
          vary: "Authorization",
        },
      },
    );
  })(createFanpageDependencies())(request);
}
