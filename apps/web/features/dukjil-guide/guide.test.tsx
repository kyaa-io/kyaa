import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { dukjilCatalogResponseSchema } from "@/features/passport/domain/dukjil-types";
import { APP_LOCALES } from "@/i18n/locales";
import { createDukjilHandlers } from "@/server/dukjil/routes";
import { buildGuideModel } from "./domain/guide-model";
import { DukjilGuideContent, JjinfanGuideContent } from "./ui/guide-content";

// The guide must show exactly what /api/dukjil/catalog serves. The fixture below is the DB shape read_dukjil_catalog returns;
// it goes through the real catalog route handler, and the rendered guide is compared with that response, not with constants in the UI.
// The numbers are deliberately different from the dev seed so a figure written in the UI code could not pass.
function rawPolicy(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    version: 7,
    rules: {
      actions: {
        checkin: { points: 3, streakEvery: 5, streakBonus: 12, stamp: { kind: "daily_checkin" } },
        post: { points: 35, pointCap: { per: "user_day", max: 4 }, stamp: { kind: "post" } },
        comment: { points: 4, pointCap: { per: "user_day", max: 11 }, stamp: { kind: "comment" } },
        invite: { points: 210, pointCap: { per: "user_month", max: 6 }, stamp: { kind: "invite" } },
        quiz: { points: 25, stamp: { kind: "quiz" } },
        mission: { pointsMin: 55, pointsMax: 310, stamp: { kind: "mission" } },
        proof: { points: 120, firstPoints: 520, pointCap: { per: "creator_month", max: 3 }, stamp: { kind: "proof" } },
        ...overrides,
      },
    },
    missionBook: {
      pages: [{ pageNo: 1, slots: [
        { slot: 1, action: "quiz" }, { slot: 2, action: "checkin" }, { slot: 3, action: "post" },
        { slot: 4, action: "steady_checkin", days: 4 }, { slot: 5, action: "proof", required: true },
      ] }],
    },
  };
}

async function fetchCatalog(raw: unknown) {
  const handlers = createDukjilHandlers({ rpc: async () => raw, authorize: async () => ({ appUserId: "u" }) } as never);
  const response = await handlers.catalog(new Request("http://localhost/api/dukjil/catalog?locale=ko"));
  expect(response.status).toBe(200);
  return dukjilCatalogResponseSchema.parse(await response.json());
}

function ruleBlock(html: string, key: string) {
  const start = html.indexOf(`data-activity="${key}"`);
  expect(start, `${key} block`).toBeGreaterThan(-1);
  const end = html.indexOf("</li>", start);
  return html.slice(start, end).replace(/<[^>]+>/g, " ");
}

describe("dukjil guide figures match /api/dukjil/catalog", () => {
  it("renders every catalog figure on /guide/dukjil in every locale", async () => {
    const catalog = await fetchCatalog(rawPolicy());
    if (catalog.version === null) throw new Error("catalog should be active");
    const model = buildGuideModel(catalog);
    expect(model?.activities.map((a) => a.key)).toEqual(["checkin", "post", "comment", "invite", "quiz", "mission", "proof"]);

    for (const locale of APP_LOCALES) {
      const html = renderToStaticMarkup(<DukjilGuideContent locale={locale} model={model} />);
      const text = (key: string) => ruleBlock(html, key);
      const rules = catalog.rules as Record<string, Record<string, unknown>>;
      expect(text("post")).toContain(`${rules.post.points}`);
      expect(text("post")).toContain(`${rules.post.dailyLimit}`);
      expect(text("comment")).toContain(`${rules.comment.points}`);
      expect(text("comment")).toContain(`${rules.comment.dailyLimit}`);
      expect(text("invite")).toContain(`${rules.invite.points}`);
      expect(text("quiz")).toContain(`${rules.quiz.points}`);
      expect(text("checkin")).toContain(`${rules.checkin.streakEvery}`);
      expect(text("checkin")).toContain(`${rules.checkin.streakBonus}`);
      expect(text("mission")).toContain(`${rules.mission.pointsMin}`);
      expect(text("mission")).toContain(`${rules.mission.pointsMax}`);
      expect(text("proof")).toContain(`${rules.proof.points}`);
      expect(text("proof")).toContain(`${rules.proof.firstPoints}`);
    }
  });

  it("states the exact Korean figures", async () => {
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    const html = renderToStaticMarkup(<DukjilGuideContent locale="ko" model={model} />);
    expect(ruleBlock(html, "post")).toMatch(/35P[\s\S]*하루 4번/);
    expect(ruleBlock(html, "mission")).toContain("55~310P");
    expect(ruleBlock(html, "checkin")).toContain("5일 연속이면 +12P");
    expect(ruleBlock(html, "proof")).toContain("처음 520P");
  });

  it("follows a changed catalog value instead of a figure in code", async () => {
    const before = renderToStaticMarkup(<DukjilGuideContent locale="ko" model={buildGuideModel(await fetchCatalog(rawPolicy()))} />);
    const changed = rawPolicy({ post: { points: 41, pointCap: { per: "user_day", max: 9 }, stamp: { kind: "post" } } });
    const after = renderToStaticMarkup(<DukjilGuideContent locale="ko" model={buildGuideModel(await fetchCatalog(changed))} />);
    expect(ruleBlock(before, "post")).toContain("35P");
    expect(ruleBlock(after, "post")).toContain("41P");
    expect(ruleBlock(after, "post")).toContain("하루 9번");
    expect(ruleBlock(after, "post")).not.toContain("35P");
  });

  it("lists the mission book slots and counts from the catalog on /guide/jjinfan", async () => {
    const catalog = await fetchCatalog(rawPolicy());
    const model = buildGuideModel(catalog);
    expect(model?.slots).toHaveLength(5);
    const ko = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={model} />);
    expect(ko).toContain("미션북 5칸");
    expect(ko).toContain("인증 칸을 뺀 4칸");
    expect(ko).toContain("출석 4일 달성");
    expect(ko).toContain("필수");
    for (const locale of APP_LOCALES) {
      const html = renderToStaticMarkup(<JjinfanGuideContent locale={locale} model={model} />);
      expect(html).toContain("4");
      expect(html.match(/<li><span class="[^"]*">\d+<\/span>/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    }
  });

  it("drops rules and slots the catalog does not carry", async () => {
    const catalog = await fetchCatalog({ ...rawPolicy(), rules: { actions: { post: { points: 9, stamp: { kind: "post" } } } } });
    const model = buildGuideModel(catalog);
    expect(model?.activities.map((a) => a.key)).toEqual(["post"]);
    expect(model?.slots.find((s) => s.action === "quiz")?.activity).toBeNull();
  });

  it("shows only the empty notice when no policy is active", async () => {
    const catalog = await fetchCatalog({ active: false });
    expect(catalog.version).toBeNull();
    const model = buildGuideModel(catalog);
    expect(model).toBeNull();
    for (const node of [<DukjilGuideContent key="d" locale="ko" model={model} />, <JjinfanGuideContent key="j" locale="ko" model={model} />]) {
      const html = renderToStaticMarkup(node);
      expect(html).toContain("보여 드릴 덕질 정보가 없어요");
      expect(html).not.toMatch(/\d+P/);
    }
  });
});
