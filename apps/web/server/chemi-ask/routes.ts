import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedJson } from "@/server/certification/certification-http";
import { chemiAuthenticatedHandler } from "@/server/chemi-profile/handlers";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { answerAsk, answerFollowup, ASK_TOPICS } from "./answer";
import { classifyAsk, guardReply } from "./guard";

// 케미 질문하기 API. 차감·한도·중복 판단은 SQL(chemi_ask_*)이 사용자 잠금 아래에서 한다.
const character = z.enum(["changha", "elina", "yuna", "dosa"]);
const content = z.enum(["saju", "fortune", "star", "tarot"]);
const question = z.string().trim().min(1).max(100);
const submit = z.strictObject({
  threadId: z.string().uuid(), readingId: z.string().uuid(), character, content, topic: z.enum(ASK_TOPICS), question,
});
const followup = z.strictObject({ threadId: z.string().uuid(), question });
const saved = z.object({ result: z.unknown() });
const thread = z.object({
  character, content, readingId: z.string().uuid().nullable(), topic: z.enum(ASK_TOPICS).nullable(),
});

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const STATUS: Record<string, number> = { CHEMI_LIMIT: 409, CHEMI_NOT_FOUND: 404, CHEMI_ASK_PAUSED: 429 };
/** SQL 이 돌려준 거절은 화면이 구분해 그리므로 코드 그대로 내보낸다. */
function refusal(error: unknown) {
  const code = error instanceof Error && Object.hasOwn(STATUS, error.message) ? error.message : null;
  if (!code) throw error;
  return Response.json({ error: { code } }, { status: STATUS[code], headers });
}

export function askRoute(op: "state" | "submit" | "followup", request: Request) {
  return chemiAuthenticatedHandler(async (input, deps, p_user) => {
    try {
      if (op === "state") {
        const params = new URL(input.url).searchParams;
        return Response.json(await deps.rpc("chemi_ask_state", {
          p_user,
          p_reading: z.string().uuid().nullable().parse(params.get("r")),
          p_character: character.nullable().parse(params.get("c")),
        }), { headers });
      }
      if (op === "followup") {
        const body = followup.parse(await boundedJson(input, 2048));
        const found = await deps.rpc("chemi_ask_thread", { p_user, p_id: body.threadId });
        if (!found) throw Error("CHEMI_NOT_FOUND");
        const asked = thread.parse(found);
        const klass = classifyAsk(body.question);
        if (klass) return Response.json({ blocked: { klass, answer: guardReply(klass, asked.character) } }, { headers });
        const reading = asked.readingId
          ? saved.parse(await deps.rpc("chemi_reading_detail", { p_user, p_id: asked.readingId, p_character: asked.character }))
          : { result: null };
        return Response.json(await deps.rpc("chemi_ask_followup", {
          p_user, p_id: body.threadId, p_question: body.question,
          p_answer: answerFollowup({ ...asked, topic: asked.topic ?? "free", question: body.question, result: reading.result }),
        }), { headers });
      }
      const body = submit.parse(await boundedJson(input, 2048));
      const klass = classifyAsk(body.question);
      const reading = klass ? null
        : saved.parse(await deps.rpc("chemi_reading_detail", { p_user, p_id: body.readingId, p_character: body.character }));
      return Response.json(await deps.rpc("chemi_ask_submit", {
        p_user, p_id: body.threadId, p_character: body.character, p_content: body.content, p_reading: body.readingId,
        p_topic: body.topic, p_question: body.question,
        p_hash: createHash("sha256").update(JSON.stringify([body.readingId, body.character, body.topic, body.question])).digest("hex"),
        p_klass: klass,
        p_answer: klass ? guardReply(klass, body.character) : answerAsk({ ...body, result: reading!.result }),
      }), { headers });
    } catch (error) {
      return refusal(error);
    }
  })(createFanpageDependencies())(request);
}
