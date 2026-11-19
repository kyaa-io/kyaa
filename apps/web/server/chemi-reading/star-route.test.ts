import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: async () => null }));

const { birthWindow, starDailyResult, rewardRoute } = await import("./routes");

const solar = (birthDate: string, birthTime: string | null, timePrecision?: "exact" | "band" | "unknown") => ({
  birthDate,
  birthTime,
  calendar: "solar",
  gender: null,
  timePrecision,
});

describe("태어난 날 경계", () => {
  it("하루 끝은 다음 날 한국 자정이다(과거 시차 전환일은 24시간이 아니다)", () => {
    const hours = (date: string) => {
      const { start, endExclusive } = birthWindow(solar(date, null));
      return (endExclusive.getTime() - start.getTime()) / 3600000;
    };
    expect(hours("1995-05-05")).toBe(24);
    expect(hours("1988-05-08")).toBe(23);
    expect(hours("1988-10-09")).toBe(25);
  });

  it("시각을 적으면 그 순간 하나로, 시진이면 앞뒤 1시간으로 좁힌다", () => {
    const exact = birthWindow(solar("1995-05-05", "14:30", "exact"));
    expect(exact.endExclusive.getTime() - exact.start.getTime()).toBe(1);
    const band = birthWindow(solar("1995-05-05", "14:00", "band"));
    expect(band.endExclusive.getTime() - band.start.getTime()).toBe(2 * 3600000);
  });

  it("음력 생일도 한국 달력의 날로 바꿔 경계를 잡는다", () => {
    const { start, endExclusive } = birthWindow({ ...solar("1995-04-06", null), calendar: "lunar" });
    expect(start.toISOString()).toBe("1995-05-04T15:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("1995-05-05T15:00:00.000Z");
  });
});

describe("별자리 오늘 풀이 모양", () => {
  it("시각이 정확하면 timeKnown 이 참이고 해·달은 한 별자리씩이다", () => {
    const result = starDailyResult(solar("1995-05-05", "14:30", "exact"), "2026-11-19");
    expect(result.timeKnown).toBe(true);
    expect(result.signs.sun).toEqual(["taurus"]);
    expect(result.signs.moon).toHaveLength(1);
    expect(result.natal).toHaveLength(10);
  });

  it("시각을 모르면 timeKnown 이 거짓이고 하루 안의 해 경계를 모두 돌려준다", () => {
    const result = starDailyResult(solar("1995-05-21", null), "2026-11-19");
    expect(result.timeKnown).toBe(false);
    expect(result.signs.sun.length).toBeGreaterThanOrEqual(1);
    for (const key of ["overall", "love", "people", "money", "work"] as const)
      expect(result.stars[key]).toBeGreaterThanOrEqual(1);
  });

  it("해가 별자리를 넘는 날은 시각 모름이면 둘, 시각을 적으면 하나다", () => {
    const unknown = starDailyResult(solar("1995-05-21", null), "2026-11-19");
    const before = starDailyResult(solar("1995-05-21", "00:05", "exact"), "2026-11-19");
    const after = starDailyResult(solar("1995-05-21", "23:55", "exact"), "2026-11-19");
    expect(unknown.signs.sun).toEqual(["taurus", "gemini"]);
    expect(before.signs.sun).toEqual(["taurus"]);
    expect(after.signs.sun).toEqual(["gemini"]);
  });
});

describe("구형 저장분({natal, sky}) 호환", () => {
  const legacy = {
    readingId: "5f1b0c1e-0000-4000-8000-000000000001",
    content: "star",
    kind: "daily",
    kstDate: "2026-11-19",
    result: { natal: [], sky: [] },
    styled: null,
  };
  const call = async (saved: unknown, op: "detail" | "createReading") => {
    vi.stubEnv("CHEMI_TAB", "true");
    const rpc = vi.fn(async (name: string) => {
      if (name === "chemi_reading_detail") return saved;
      if (name === "chemi_reading_context") return { day: "2026-11-19", saved };
      if (name === "chemi_read_profile")
        return { birth: solar("1995-05-05", "14:30", "exact"), partners: [] };
      throw Error(`unexpected ${name}`);
    });
    vi.doMock("@/server/fanpage/dependencies", () => ({
      createFanpageDependencies: () => ({ authorize: async () => ({ appUserId: "u" }), rpc }),
    }));
    vi.resetModules();
    const routes = await import("./routes");
    const request =
      op === "detail"
        ? new Request("http://x/api/chemi/readings/r?c=dosa", { headers: { authorization: "Bearer t" } })
        : new Request("http://x/api/chemi/readings", {
            method: "POST",
            headers: { authorization: "Bearer t" },
            body: JSON.stringify({ content: "star", kind: "daily", character: "dosa" }),
          });
    return (await routes.rewardRoute(op, request, "5f1b0c1e-0000-4000-8000-000000000001")).json();
  };

  it.each(["detail", "createReading"] as const)("%s 는 별점이 있는 새 모양으로 올려 준다", async (op) => {
    const body = await call(legacy, op);
    expect(body.kstDate).toBe("2026-11-19");
    expect(body.result.stars.overall).toBeGreaterThanOrEqual(1);
    expect(body.result.natal).toHaveLength(10);
  });

  it("이미 새 모양인 저장분은 그대로 둔다", async () => {
    const fresh = { ...legacy, result: { natal: [], stars: { overall: 3 } } };
    expect((await call(fresh, "detail")).result).toEqual(fresh.result);
  });

  it("rewardRoute 는 내보낸 그대로 있다", () => expect(typeof rewardRoute).toBe("function"));
});
