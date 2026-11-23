import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { boundedJson } from "@/server/certification/certification-http";
import { chemiAuthenticatedHandler } from "@/server/chemi-profile/handlers";
import { chemiFeatureClosedResponse } from "@/server/chemi/dependencies";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { aiAnswer } from "./ai-answer";
import { askAiReady } from "./ai-provider";
import { answerAsk, answerFollowup, askBasis, askEvidence, ASK_TOPICS } from "./answer";
import { classifyAsk, guardReply } from "./guard";

// 케미 질문하기 API. 차감·한도·중복 판단은 SQL(chemi_ask_*)이 사용자 잠금 아래에서 한다.
const character = z.enum(["changha", "elina", "yuna", "dosa"]);
const content = z.enum(["saju", "fortune", "star", "tarot"]);
/** 질문 글자 수(기획 03-6 22·23). 표는 500자까지 받는다. */
export const ASK_QUESTION_MAX = 200;
const question = z.string().trim().min(1).max(ASK_QUESTION_MAX);
const submit = z.strictObject({
  threadId: z.string().uuid(), readingId: z.string().uuid(), character, content, topic: z.enum(ASK_TOPICS), question,
});
const followup = z.strictObject({ threadId: z.string().uuid(), question });
const saved = z.object({ result: z.unknown(), kind: z.string().optional() });
const thread = z.object({
  character, content, readingId: z.string().uuid().nullable(), topic: z.enum(ASK_TOPICS).nullable(),
  question: z.string().nullish(), answer: z.string().nullish(), followupAnswer: z.string().nullish(),
  status: z.string().optional(), date: z.string().optional(),
});
const room = z.object({ left: z.number(), pausedUntil: z.string().nullish() });

const headers = { "cache-control": "private, no-store", vary: "Authorization" };
const STATUS: Record<string, number> = { CHEMI_LIMIT: 409, CHEMI_NOT_FOUND: 404, CHEMI_ASK_PAUSED: 429 };
/** SQL 이 돌려준 거절은 화면이 구분해 그리므로 코드 그대로 내보낸다. */
function refusal(error: unknown) {
  const code = error instanceof Error && Object.hasOwn(STATUS, error.message) ? error.message : null;
  if (!code) throw error;
  return Response.json({ error: { code } }, { status: STATUS[code], headers });
}

const open = (state: z.infer<typeof room>) => state.left > 0 && !state.pausedUntil;

export function askRoute(op: "state" | "submit" | "followup" | "evidence", request: Request) {
  const closed = chemiFeatureClosedResponse("ask");
  if (closed) return closed;
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
      if (op === "evidence") {
        // 답 아래 '내 풀이 근거'(기획 03-6 08): 답에 쓴 풀이 값과 계산 근거. 답을 만든 날의 값으로 다시 계산한다.
        const id = z.string().uuid().parse(new URL(input.url).searchParams.get("t"));
        const found = await deps.rpc("chemi_ask_thread", { p_user, p_id: id });
        if (!found) throw Error("CHEMI_NOT_FOUND");
        const asked = thread.parse(found);
        if (asked.status === "blocked" || !asked.readingId) return Response.json({ rows: [], hourless: false }, { headers });
        const reading = saved.parse(await deps.rpc("chemi_reading_detail", { p_user, p_id: asked.readingId, p_character: asked.character }));
        const topic = asked.topic ?? "free";
        const at = asked.date ? Date.parse(`${asked.date}T12:00:00+09:00`) : Date.now();
        const why = askEvidence(asked.content, topic, reading.result, reading.kind, at);
        const result = reading.result as { timeKnown?: boolean } | null;
        return Response.json({
          rows: [
            { kind: "basis", text: askBasis(asked.content, topic, reading.result, asked.question ?? "", reading.kind).line.yo },
            ...(why ? [{ kind: "why", text: why.yo }] : []),
          ],
          hourless: asked.content === "saju" && result?.timeKnown === false,
        }, { headers });
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
          : { result: null, kind: undefined };
        const ask = { ...asked, topic: asked.topic ?? "free" as const, question: body.question, result: reading.result, kind: reading.kind };
        // 이미 이어 물은 질문은 SQL 이 저장된 답을 돌려주거나 거절하므로 AI 를 부르지 않는다.
        const written = asked.followupAnswer || !asked.question || !asked.answer ? null
          : await aiAnswer({ ...ask, before: { question: asked.question, answer: asked.answer } }, deps.rpc, p_user);
        return Response.json(await deps.rpc("chemi_ask_followup", {
          p_user, p_id: body.threadId, p_question: body.question, p_answer: written ?? answerFollowup({ ...ask, before: asked.question && asked.answer ? { question: asked.question, answer: asked.answer } : undefined }),
        }), { headers });
      }
      const body = submit.parse(await boundedJson(input, 2048));
      const klass = classifyAsk(body.question);
      const reading = klass ? null
        : saved.parse(await deps.rpc("chemi_reading_detail", { p_user, p_id: body.readingId, p_character: body.character }));
      // 다시 보낸 요청·남은 질문 없음·멈춤은 SQL 이 답을 쓰지 않으므로 AI 를 부르지 않는다.
      const written = reading && askAiReady() && !(await deps.rpc("chemi_ask_thread", { p_user, p_id: body.threadId }))
        && open(room.parse(await deps.rpc("chemi_ask_state", { p_user, p_reading: null, p_character: null })))
        ? await aiAnswer({ ...body, result: reading.result, kind: reading.kind }, deps.rpc, p_user) : null;
      return Response.json(await deps.rpc("chemi_ask_submit", {
        p_user, p_id: body.threadId, p_character: body.character, p_content: body.content, p_reading: body.readingId,
        p_topic: body.topic, p_question: body.question,
        p_hash: createHash("sha256").update(JSON.stringify([body.readingId, body.character, body.topic, body.question])).digest("hex"),
        p_klass: klass,
        p_answer: klass ? guardReply(klass, body.character) : written ?? answerAsk({ ...body, result: reading!.result, kind: reading!.kind }),
      }), { headers });
    } catch (error) {
      return refusal(error);
    }
  })(createFanpageDependencies())(request);
}
