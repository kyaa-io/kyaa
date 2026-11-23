import "server-only";
import { z } from "zod";
import { chemiClosedResponse, chemiFeatureClosedResponse } from "@/server/chemi/dependencies";
import { boundedJson } from "@/server/certification/certification-http";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { chemiAuthenticatedHandler } from "@/server/chemi-profile/handlers";

const reminder = z.strictObject({
  kind: z.enum(["tomorrow", "free_ask", "minor_limit"]),
  content: z.enum(["", "saju", "fortune", "star", "tarot"]).default(""),
});

export function reminderRoute(request: Request, enabled: boolean) {
  // 끄기(DELETE)는 운영에서도 받는다. 새 신청만 닫는다.
  const closed = enabled ? chemiFeatureClosedResponse("reminders") : chemiClosedResponse();
  if (closed) return closed;
  return chemiAuthenticatedHandler(async (input, deps, user) => {
    const { kind, content } = reminder.parse(await boundedJson(input, 512));
    const result = await deps.rpc("chemi_reminder_set", {
      p_user: user, p_kind: kind, p_content: content, p_enabled: enabled,
    });
    return Response.json(result, { headers: { "cache-control": "private, no-store", vary: "Authorization" } });
  })(createFanpageDependencies())(request);
}
