import { z } from "zod";
import { AuthError } from "@/features/auth/domain/auth-errors";
import { chemiClosedResponse } from "@/server/chemi/dependencies";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { resolveCreatorId } from "@/server/dukjil/creator-id";
import { calculateSaju } from "@/server/chemi-engine/saju";
import {
  computeDailyFortune,
  FORTUNE_TABLE_VERSION,
} from "@/server/chemi-engine/fortune";
import { lunarToSolar } from "manseryeok";
import { CalendarDateTime, toZoned } from "@internationalized/date";
import {
  BRANCH_COMBINATIONS,
  BRANCH_CLASHES,
} from "@/server/chemi-engine/saju/tables";
import {
  calculateChart,
  separation,
  dailySky,
} from "@/server/chemi-engine/star";
import { drawGuestTarot, drawMemberTarot } from "@/server/chemi-engine/tarot";

const character = z.enum(["changha", "elina", "yuna", "dosa"]);
const content = z.enum(["fortune", "saju", "star", "tarot"]);
const reading = z.object({
  content,
  kind: z.enum([
    "daily",
    "first",
    "compat",
    "friend_today",
    "topic",
    "tarot3",
    "date",
    "goodday",
    "month",
    "calendar",
  ]),
  character,
  partnerId: z.string().uuid().optional(),
  position: z.number().int().min(0).max(77).default(0),
  targetKey: z.string().max(120).optional(),
});
const share = z.object({ readingId: z.string().uuid(), character });
const birth = z.object({
  birthDate: z.string(),
  birthTime: z.string().nullable(),
  calendar: z.string(),
  gender: z.enum(["male", "female"]).nullable(),
});
function birthInput(b: z.infer<typeof birth>) {
  const [year, month, day] = b.birthDate.split("-").map(Number);
  const [hour, minute] = (b.birthTime?.split(":") ?? []).map(Number);
  return {
    year,
    month,
    day,
    hour,
    minute,
    isLunar: b.calendar !== "solar",
    isLeapMonth: b.calendar === "lunar_leap",
    gender: b.gender ?? undefined,
  };
}

function natalPlanets(b: z.infer<typeof birth>) {
  const input = birthInput(b);
  const { year, month, day } = input.isLunar
    ? lunarToSolar(input.year, input.month, input.day, input.isLeapMonth)
    : input;
  const local = new CalendarDateTime(
    year,
    month,
    day,
    input.hour ?? 12,
    input.minute ?? 0,
  );
  const instant = toZoned(local, "Asia/Seoul").toDate();
  // Geocentric planets need no birthplace. Never infer houses from a missing location.
  return calculateChart({
    instant,
    timeKnown: false,
    latitude: 0,
    longitude: 0,
  }).planets;
}

const statuses: Record<string, number> = {
  CHEMI_INVALID: 400,
  CHEMI_CONTENT_OFF: 409,
  CHEMI_ACCOUNT_CLOSED: 403,
  CHEMI_BIRTH_REQUIRED: 409,
  CHEMI_LIMIT: 409,
  CHEMI_PAYMENT_REQUIRED: 402,
  CHEMI_NOT_FOUND: 404,
  CHEMI_UNAVAILABLE: 503,
};
type Operation =
  "visit" | "createReading" | "list" | "detail" | "share" | "card" | "done";
export async function rewardRoute(
  op: Operation,
  request: Request,
  id?: string,
) {
  const closed = chemiClosedResponse();
  if (closed) return closed;
  const headers = { "cache-control": "private, no-store" };
  try {
    const auth = request.headers.get("authorization");
    const body =
      request.method === "POST" && op !== "visit" ? await request.json() : null;
    const params = new URL(request.url).searchParams;
    const run = async () => {
      if (
        op === "createReading" &&
        !auth &&
        body?.content === "tarot" &&
        body.kind === "daily"
      ) {
        reading.parse(body);
        return {
          readingId: null,
          result: drawGuestTarot(),
          reward: {},
          styled: null,
          chain: null,
          replayed: false,
        };
      }
      const deps = createFanpageDependencies();
      if (op === "card") return deps.rpc("chemi_get_share", { p_share: id });
      const { appUserId: p_user } = await deps.authorize(auth);
      if (op === "visit") return deps.rpc("chemi_visit", { p_user });
      if (op === "list")
        return deps.rpc("chemi_reading_list", {
          p_user,
          p_content: content.nullable().parse(params.get("content")),
          p_from: z.string().date().nullable().parse(params.get("from")),
          p_to: z.string().date().nullable().parse(params.get("to")),
        });
      if (op === "detail")
        return deps.rpc("chemi_reading_detail", {
          p_user,
          p_id: z.string().uuid().parse(id),
          p_character: character.nullable().parse(params.get("c")),
        });
      if (op === "share") {
        const input = share.parse(body);
        return deps.rpc("chemi_create_share", {
          p_user,
          p_reading: input.readingId,
          p_character: input.character,
        });
      }
      if (op === "done")
        return deps.rpc("chemi_share_done", {
          p_user,
          p_share: id,
          p_via: z.enum(["save", "copy", "send"]).parse(body?.via),
        });
      const input = reading.parse(body);
      const paired =
        (input.kind === "compat" &&
          (input.content === "saju" || input.content === "star")) ||
        (input.kind === "friend_today" && input.content === "fortune");
      if (paired && !input.partnerId) throw Error("CHEMI_INVALID");
      if (
        !paired &&
        input.kind !== (input.content === "saju" ? "first" : "daily")
      )
        throw Error("CHEMI_PAYMENT_REQUIRED");
      const celebrity = await resolveCreatorId(input.character);
      if (input.character !== "dosa" && !celebrity)
        throw Error("CHEMI_UNAVAILABLE");
      const context = z
        .object({
          day: z.string(),
          saved: z.record(z.string(), z.unknown()).nullable(),
        })
        .parse(
          await deps.rpc("chemi_reading_context", {
            p_user,
            p_content: input.content,
            p_kind: input.kind,
            p_target: paired ? input.partnerId : "",
            p_character: input.character,
            p_celebrity: celebrity,
          }),
        );
      if (context.saved) return context.saved;
      const day = context.day;
      let result: unknown;
      let version: string;
      if (input.content === "tarot") {
        version = "tarot-v1";
        result = {
          cards: drawMemberTarot({
            userId: p_user,
            kstDate: day,
            deckVersion: version,
            position: input.position,
            salt: process.env.CHEMI_TAROT_SALT,
          }),
        };
      } else {
        const profile = z
          .object({
            birth: birth.nullable(),
            partners: z.array(birth.extend({ id: z.string() })),
          })
          .parse(await deps.rpc("chemi_read_profile", { p_user }));
        if (!profile.birth) throw Error("CHEMI_BIRTH_REQUIRED");
        const b = profile.birth;
        const partner = paired
          ? profile.partners.find((p) => p.id === input.partnerId)
          : undefined;
        if (paired && !partner) throw Error("CHEMI_NOT_FOUND");
        const chart = calculateSaju(birthInput(b));
        if (input.content === "fortune") {
          const self = computeDailyFortune(
            { ...chart, gender: b.gender ?? undefined },
            day,
          );
          result = partner
            ? {
                self,
                partner: computeDailyFortune(
                  {
                    ...calculateSaju(birthInput(partner)),
                    gender: partner.gender ?? undefined,
                  },
                  day,
                ),
              }
            : self;
          version = FORTUNE_TABLE_VERSION;
        } else if (input.content === "star") {
          const natal = natalPlanets(b);
          if (partner) {
            const other = natalPlanets(partner);
            result = {
              angles: natal.flatMap((a) =>
                other.map((b) => ({
                  self: a.body,
                  partner: b.body,
                  degrees: separation(a.longitude, b.longitude),
                })),
              ),
            };
          } else result = { natal, sky: dailySky(day) };
          version = "astronomy-engine@2.1.19";
        } else {
          if (partner) {
            const other = calculateSaju(birthInput(partner));
            const mine = Object.values(chart.pillars).map(
              (p) => p?.earthlyBranch,
            );
            const theirs = Object.values(other.pillars).map(
              (p) => p?.earthlyBranch,
            );
            const across = ([a, b]: readonly [
              (typeof mine)[number],
              (typeof mine)[number],
            ]) =>
              (mine.includes(a) && theirs.includes(b)) ||
              (mine.includes(b) && theirs.includes(a));
            result = {
              dayStems: [
                chart.pillars.day.heavenlyStem,
                other.pillars.day.heavenlyStem,
              ],
              combinations: BRANCH_COMBINATIONS.filter(across),
              clashes: BRANCH_CLASHES.filter(across),
            };
          } else result = chart;
          version = chart.tableVersion;
        }
      }
      return deps.rpc("chemi_save_reading", {
        p_day: day,
        p_user,
        p_content: input.content,
        p_kind: input.kind,
        p_character: input.character,
        p_target: paired ? input.partnerId : "",
        p_celebrity: celebrity,
        p_result: result,
        p_engine: version,
        p_table: version,
      });
    };
    return Response.json(await run(), { headers });
  } catch (error) {
    const code =
      error instanceof AuthError
        ? error.code
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? "CHEMI_INVALID"
          : error instanceof Error && Object.hasOwn(statuses, error.message)
            ? error.message
            : "CHEMI_UNAVAILABLE";
    return Response.json(
      { error: { code } },
      {
        headers,
        status:
          error instanceof AuthError ? error.status : (statuses[code] ?? 503),
      },
    );
  }
}
