import { chemiTopupEnabled } from "@/features/chemi/domain/availability";
import { dayCardKind } from "@/app/chemi/fortune/deep/copy";
import { isFortuneResult } from "@/app/chemi/fortune/reading";
import { shareSummary } from "./share-summary";
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
  scoreDay,
  birthMoonSigns,
} from "@/server/chemi-engine/star";
import { synastryConnections } from "@/server/chemi-engine/star/synastry";
import { drawGuestTarot, drawMemberTarot, readGuestTarot, signGuestTarot } from "@/server/chemi-engine/tarot";

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
  /** 비회원 때 뽑은 오늘의 타로 카드 증표(signGuestTarot). 로그인한 뒤 그날 첫 카드로 저장한다. */
  claim: z.string().max(80).optional(),
});
const share = z.object({ readingId: z.string().uuid(), character });
const birth = z.object({
  birthDate: z.string(),
  birthTime: z.string().nullable(),
  calendar: z.string(),
  gender: z.enum(["male", "female"]).nullable(),
  timePrecision: z.enum(["exact", "band", "unknown"]).optional(),
});
type Birth = z.infer<typeof birth>;
/** 시간을 적었는데 정밀도가 없으면(구형 행) 정확한 시각으로 본다. */
function timePrecision(b: Birth) {
  return b.birthTime ? (b.timePrecision ?? "exact") : "unknown";
}
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

function birthInstant(b: z.infer<typeof birth>) {
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
  return { local, instant: toZoned(local, "Asia/Seoul").toDate() };
}

// Geocentric planets need no birthplace. Never infer houses from a missing location.
function natalChart(b: z.infer<typeof birth>) {
  return calculateChart({
    instant: birthInstant(b).instant,
    timeKnown: false,
    latitude: 0,
    longitude: 0,
  });
}

function signsBetween(start: Date, endExclusive: Date) {
  const sunSign = (instant: Date) =>
    calculateChart({ instant, timeKnown: false, latitude: 0, longitude: 0 })
      .planets[0]!.sign;
  return {
    sun: [
      ...new Set([
        sunSign(start),
        sunSign(new Date(endExclusive.getTime() - 1)),
      ]),
    ],
    moon: birthMoonSigns(start, endExclusive),
  };
}

// 태어난 시각을 아는 만큼만 좁힌다: 정확하면 그 순간, 시진이면 앞뒤 1시간, 모르면 한국 달력의 그날 하루.
// 하루의 끝은 다음 날 자정을 따로 변환해 얻는다(24시간을 더하면 과거 시차 전환일에 어긋난다).
export function birthWindow(b: Birth) {
  const { local } = birthInstant(b);
  const precision = timePrecision(b);
  if (precision === "exact") {
    const at = toZoned(local, "Asia/Seoul").toDate();
    return { start: at, endExclusive: new Date(at.getTime() + 1) };
  }
  if (precision === "band") {
    const at = toZoned(local, "Asia/Seoul").toDate().getTime();
    return {
      start: new Date(at - 3600000),
      endExclusive: new Date(at + 3600000),
    };
  }
  const day = new CalendarDateTime(local.year, local.month, local.day);
  return {
    start: toZoned(day, "Asia/Seoul").toDate(),
    endExclusive: toZoned(day.add({ days: 1 }), "Asia/Seoul").toDate(),
  };
}

function birthDaySigns(b: Birth) {
  const { start, endExclusive } = birthWindow(b);
  return signsBetween(start, endExclusive);
}

/** 별자리 오늘 풀이(daily) 결과. 새로 만들 때와 구형 저장분을 다시 읽을 때 같은 식을 쓴다. */
export function starDailyResult(b: Birth, day: string) {
  const chart = natalChart(b);
  const scored = scoreDay(chart, day);
  return {
    natal: chart.planets.map(({ body, longitude, sign }) => ({
      body,
      longitude,
      sign,
    })),
    timeKnown: timePrecision(b) === "exact",
    signs: birthDaySigns(b),
    stars: scored.stars,
    reasons: scored.reasons.map(
      ({ body, target, angle, hour, applying, score, exitDate }) => ({
        body,
        target,
        angle,
        hour,
        applying,
        score,
        exitDate,
      }),
    ),
    distributionVersion: scored.distributionVersion,
  };
}

/**
 * 별자리 오늘 풀이가 별점 없는 구형 모양({natal, sky})으로 저장돼 있으면, 저장된 날짜와 지금 프로필로
 * 같은 식을 다시 계산해 새 모양으로 돌려준다(저장된 행은 건드리지 않는다).
 */
async function upgradeLegacyStar(
  saved: Record<string, any>,
  readProfile: () => Promise<unknown>,
) {
  if (
    saved.content !== undefined &&
    (saved.content !== "star" || saved.kind !== "daily")
  )
    return saved;
  if (saved.result?.stars || !saved.result?.natal || !saved.kstDate) return saved;
  const profile = z
    .object({ birth: birth.nullable() })
    .parse(await readProfile());
  if (!profile.birth) return saved;
  return { ...saved, result: starDailyResult(profile.birth, saved.kstDate) };
}

const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

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
  "fortuneDeep" | "tarotSpread" | "pointDate" | "datePrice" | "visit" | "createReading" | "list" | "detail" | "share" | "card" | "done";
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
        const drawn = drawGuestTarot();
        return {
          readingId: null,
          result: drawn,
          claim: signGuestTarot(drawn, kstToday(), process.env.CHEMI_TAROT_SALT),
          reward: {},
          styled: null,
          chain: null,
          replayed: false,
        };
      }
      const deps = createFanpageDependencies();
      if (op === "datePrice") return { price: z.number().int().nonnegative().parse(await deps.rpc("chemi_date_reading_price", {})) };
      if (op === "card") return deps.rpc("chemi_get_share", { p_share: id });
      const { appUserId: p_user } = await deps.authorize(auth);
      if (op === "pointDate") {
        const input = z.object({ character, day: z.iso.date(), confirm: z.boolean() }).parse(body);
        const args = { p_user, p_character: input.character, p_day: input.day, p_version: FORTUNE_TABLE_VERSION };
        const quote = z.object({ balance: z.number(), price: z.number(), readingId: z.string().optional() })
          .passthrough().parse(await deps.rpc("chemi_point_date", { ...args, p_result: null }));
        if (!input.confirm || quote.todayFree || quote.readingId || quote.balance < quote.price) {
          const topupPath = chemiTopupEnabled() ? "/chemi/points/topup" : undefined;
          return { ...quote, topupPath };
        }
        const profile = z.object({ birth: birth.nullable() }).parse(await deps.rpc("chemi_read_profile", { p_user }));
        if (!profile.birth) throw Error("CHEMI_BIRTH_REQUIRED");
        const result = computeDailyFortune({ ...calculateSaju(birthInput(profile.birth)), gender: profile.birth.gender ?? undefined }, input.day);
        if (!isFortuneResult(result)) throw Error("CHEMI_UNAVAILABLE");
        return deps.rpc("chemi_point_date", { ...args, p_result: result });
      }
      if (op === "fortuneDeep") {
        // 화면을 보는 동안은 계산만 하고, 질문을 시작할 때만 그 결과를 저장한다.
        const profile = z.object({ birth: birth.nullable() }).parse(await deps.rpc("chemi_read_profile", { p_user }));
        if (!profile.birth) throw Error("CHEMI_BIRTH_REQUIRED");
        const chart = { ...calculateSaju(birthInput(profile.birth)), gender: profile.birth.gender ?? undefined };
        const today = kstToday();
        const days = Array.from({ length: 7 }, (_, offset) => {
          const day = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
          return { day, result: computeDailyFortune(chart, day) };
        });
        if (request.method !== "POST") return { today, days };

        const input = z.object({ character, day: z.iso.date(), view: z.enum(["tomorrow", "week", "keepsake", "amulet"]) }).parse(body);
        if (input.day !== today) throw Error("CHEMI_UNAVAILABLE");
        if ((input.view === "keepsake" || input.view === "amulet")
          && (days[0].result.locked || dayCardKind(days[0].result.score) !== input.view)) {
          throw Error("CHEMI_UNAVAILABLE");
        }
        const result = input.view === "week"
          ? { days }
          : input.view === "tomorrow" ? days[1].result : days[0].result;
        return deps.rpc("chemi_save_deep_context", {
          p_user, p_character: input.character, p_kind: input.view, p_day: today,
          p_result: result, p_version: FORTUNE_TABLE_VERSION,
        });
      }
      if (op === "tarotSpread") {
        // 세 장 배열: 계정마다 첫 1번 무료. GET 은 이미 본 배열만 돌려주고, POST 는 고른 자리 세 곳으로 뽑아 저장한다.
        const version = "tarot-v1";
        if (request.method !== "POST")
          return deps.rpc("chemi_tarot_spread", { p_user, p_character: "changha", p_result: null, p_version: version });
        const input = z.object({
          character,
          positions: z.array(z.number().int().min(0).max(77)).length(3)
            .refine((positions) => new Set(positions).size === 3),
        }).parse(body);
        const cards = input.positions.flatMap((position) =>
          drawMemberTarot({ userId: p_user, kstDate: kstToday(), deckVersion: version, spread: "three", position, salt: process.env.CHEMI_TAROT_SALT }));
        return deps.rpc("chemi_tarot_spread", { p_user, p_character: input.character, p_result: { cards, positions: input.positions }, p_version: version });
      }
      if (op === "visit") return deps.rpc("chemi_visit", { p_user });
      if (op === "list")
        return deps.rpc("chemi_reading_list", {
          p_user,
          p_content: content.nullable().parse(params.get("content")),
          p_from: z.string().date().nullable().parse(params.get("from")),
          p_to: z.string().date().nullable().parse(params.get("to")),
        });
      if (op === "detail") {
        const saved = await deps.rpc("chemi_reading_detail", {
          p_user,
          p_id: z.string().uuid().parse(id),
          p_character: character.nullable().parse(params.get("c")),
        });
        return upgradeLegacyStar(saved as Record<string, any>, () =>
          deps.rpc("chemi_read_profile", { p_user }),
        );
      }
      if (op === "share") {
        const input = share.parse(body);
        // 공유 줄은 저장된 결과에서 서버가 만든다. 남의 풀이면 chemi_reading_detail 이 CHEMI_NOT_FOUND 로 막는다.
        const saved = (await deps.rpc("chemi_reading_detail", {
          p_user,
          p_id: input.readingId,
          p_character: input.character,
        })) as { result?: unknown; styled?: { share?: { line?: unknown } } | null };
        return deps.rpc("chemi_create_share", {
          p_user,
          p_reading: input.readingId,
          p_character: input.character,
          p_summary: shareSummary(input.character, saved.result, saved.styled),
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
      if (context.saved)
        return input.content === "star" && input.kind === "daily"
          ? upgradeLegacyStar(context.saved, () =>
              deps.rpc("chemi_read_profile", { p_user }),
            )
          : context.saved;
      const day = context.day;
      let result: unknown;
      let version: string;
      if (input.content === "tarot") {
        version = "tarot-v1";
        const claimed = readGuestTarot(input.claim, day, process.env.CHEMI_TAROT_SALT);
        result = {
          cards: claimed ? [claimed] : drawMemberTarot({
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
          if (partner) {
            const natal = natalChart(b).planets;
            const other = natalChart(partner).planets;
            result = {
              // 궁합 화면이 읽는 주요 각(합·육분·사각·삼각·충, 오차 6도 안). 시각을 모르는 쪽의 달은 뺀다.
              connections: synastryConnections(
                { planets: natal, moonKnown: timePrecision(b) === "exact" },
                { planets: other, moonKnown: timePrecision(partner) === "exact" },
              ),
              angles: natal.flatMap((a) =>
                other.map((b) => ({
                  self: a.body,
                  partner: b.body,
                  degrees: separation(a.longitude, b.longitude),
                })),
              ),
            };
          } else result = starDailyResult(b, day);
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
            const keys = ["day", "month", "year", "hour"] as const;
            const relations = keys.flatMap((selfKey) =>
              keys.flatMap((partnerKey) => {
                const a = chart.pillars[selfKey]?.earthlyBranch;
                const b = other.pillars[partnerKey]?.earthlyBranch;
                if (!a || !b) return [];
                const matches = ([x, y]: readonly [string, string]) =>
                  (a === x && b === y) || (a === y && b === x);
                const kind = BRANCH_COMBINATIONS.some(matches)
                  ? "합"
                  : BRANCH_CLASHES.some(matches)
                    ? "충"
                    : null;
                return kind ? [{ selfKey, partnerKey, kind }] : [];
              }),
            );
            const priority = (r: (typeof relations)[number]) =>
              r.selfKey === r.partnerKey && r.selfKey === "day"
                ? 0
                : r.selfKey === r.partnerKey && r.selfKey === "month"
                  ? 1
                  : 2;
            result = {
              charts: { self: chart.pillars, partner: other.pillars },
              relations: relations.sort((a, b) => priority(a) - priority(b)),
              dayStems: [chart.pillars.day.heavenlyStem, other.pillars.day.heavenlyStem],
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
