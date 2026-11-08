import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Viewer = import("./ui/use-guide-viewer").GuideViewer;
const viewerState: { current: Viewer } = { current: { status: "guest" } };
vi.mock("./ui/use-guide-viewer", () => ({ useGuideViewer: () => viewerState.current }));

import { dukjilCatalogResponseSchema, passportClaimResultSchema } from "@/features/passport/domain/dukjil-types";
import { APP_LOCALES } from "@/i18n/locales";
import { JJINFAN_CHALLENGE_TARGET } from "@/features/rankings/domain/types";
import { createDukjilHandlers } from "@/server/dukjil/routes";
import { buildGuideModel } from "./domain/guide-model";
import { PROOF_TYPES } from "@/features/passport/domain/proof-types";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { messages as detailMessages } from "@/i18n/catalogs/features__dukjil-guide__ui__guide-detail";
import { GROUP_WALLET_POINT_COST } from "@/server/group-wallet/domain";
import { dukjilGuideDetailSource } from "./ui/guide-detail-source";
import { DukjilGuideContent, HEARTS_PER_PAGE, JjinfanGuideContent } from "./ui/guide-content";

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

  it("marks the stamp step as coming soon only while the active policy has no proof rule", async () => {
    const open = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={buildGuideModel(await fetchCatalog(rawPolicy()))} />);
    // Only the kyaa_payment card is marked while proof is open (its sentence plus its badge); the stamp step and the proof section are not.
    expect(open.split("준비 중").length - 1).toBe(2);
    const withoutProof = rawPolicy();
    delete (withoutProof.rules.actions as Record<string, unknown>).proof;
    const closedModel = buildGuideModel(await fetchCatalog(withoutProof));
    expect(closedModel?.proofOpen).toBe(false);
    const closed = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={closedModel} />);
    expect(closed.split("준비 중").length - 1).toBeGreaterThanOrEqual(2);
    expect(closed).not.toContain("data-proof-kind");
    expect(closed).not.toContain('id="jjinfan-faq"');
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
    const proof = model?.activities.find((activity) => activity.key === "proof");
    expect(ko).toContain(`처음 ${proof?.firstPoints}P`);
    expect(ko).toContain(`${proof?.points}P`);
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
  it("shows the heart, ranking and challenge figures from the catalog and shared constants", async () => {
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    const ko = renderToStaticMarkup(<DukjilGuideContent locale="ko" model={model} />);
    expect(ko).toContain("미션북 한 장의 5칸을 모두 채우고 받으면 하트 1개가 쌓여요.");
    expect(ko).toContain(`찐팬 ${JJINFAN_CHALLENGE_TARGET}명`);
    expect(ko).toContain('href="/rankings?locale=ko"');
    for (const locale of APP_LOCALES) {
      const html = renderToStaticMarkup(<DukjilGuideContent locale={locale} model={model} />);
      expect(html).toContain('id="dukjil-heart"');
      expect(html).toContain('id="dukjil-rank"');
      expect(html).toContain(`${JJINFAN_CHALLENGE_TARGET}`);
      expect(html).not.toMatch(/\{\d\}/);
    }
  });

  it("follows a changed mission book size and shows per-slot points on /guide/jjinfan", async () => {
    const raw = rawPolicy();
    (raw.missionBook.pages[0].slots as Array<Record<string, unknown>>).push({ slot: 6, action: "comment" });
    const model = buildGuideModel(await fetchCatalog(raw));
    expect(model?.slots).toHaveLength(6);
    expect(renderToStaticMarkup(<DukjilGuideContent locale="ko" model={model} />)).toContain("6칸을 모두 채우고");
    const jj = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={model} />);
    expect(jj).toContain("25P");
    expect(jj).toContain("35P");
  });

  it("renders the sticky CTA by sign-in state and hides it while loading", async () => {
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    const id = "11111111-1111-4111-8111-111111111111";
    const cta = (kind: "jjinfan" | "dukjil") => renderToStaticMarkup(kind === "jjinfan" ? <JjinfanGuideContent locale="ko" model={model} /> : <DukjilGuideContent locale="ko" model={model} />);
    viewerState.current = { status: "loading" };
    expect(cta("jjinfan")).not.toContain("data-guide-cta");
    expect(cta("dukjil")).not.toContain("data-guide-cta");
    viewerState.current = { status: "guest" };
    expect(cta("jjinfan")).toContain("로그인하고 시작하기");
    expect(cta("jjinfan")).toContain("returnTo=%2Fguide%2Fjjinfan%3Flocale%3Dko");
    expect(cta("dukjil")).toContain("returnTo=%2Fguide%2Fdukjil%3Flocale%3Dko");
    viewerState.current = { status: "member", creator: null, progress: null };
    expect(cta("jjinfan")).toContain('data-guide-cta="mission-book" href="/celebrities?locale=ko"');
    viewerState.current = { status: "member", creator: { slug: "kyaa-star", name: "카야", passportId: id }, progress: { filled: 6, total: 9 } };
    const jj = cta("jjinfan");
    expect(jj).toContain("내 미션북 보기");
    expect(jj).toContain(`/passports/${id}?locale=ko#mission-book`);
    expect(jj).toContain("미션북 6/9");
    expect(jj).not.toContain("카야 미션북");
    const dk = cta("dukjil");
    expect(dk).toContain("오늘의 덕질 시작하기");
    expect(dk).toContain('href="/kyaa-star?locale=ko"');
    viewerState.current = { status: "member", creator: { slug: "kyaa-star", name: "카야", passportId: id }, progress: null };
    expect(cta("jjinfan")).not.toContain("미션북 6/9");
    viewerState.current = { status: "guest" };
  });

  it("keeps the heart count in code equal to the claim contract literal", () => {
    const sample = { pageNo: 1, jjinfanConfirmed: false, cheerStampId: null, replayed: false };
    expect(passportClaimResultSchema.safeParse({ ...sample, hearts: HEARTS_PER_PAGE }).success).toBe(true);
    expect(passportClaimResultSchema.safeParse({ ...sample, hearts: HEARTS_PER_PAGE + 1 }).success).toBe(false);
  });

  it("renders one card per proof type with a coming-soon mark only on kyaa_payment", async () => {
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    for (const locale of APP_LOCALES) {
      const html = renderToStaticMarkup(<JjinfanGuideContent locale={locale} model={model} />);
      expect(html.match(/data-proof-kind="/g)).toHaveLength(PROOF_TYPES.length);
      expect(PROOF_TYPES).toHaveLength(7);
      for (const type of PROOF_TYPES) expect(html).toContain(`data-proof-kind="${type}"`);
      const auto = html.slice(html.indexOf('data-proof-kind="kyaa_payment"'), html.indexOf("</li>", html.indexOf('data-proof-kind="kyaa_payment"')));
      expect(auto).not.toContain("<dl>");
      expect(html.match(/<dl>/g)).toHaveLength(6);
      expect(html).not.toMatch(/dkg[A-Z]|\{\d\}/);
    }
  });

  it("shows synthetic capture examples, benefits from the catalog, and FAQ answers without invented numbers", async () => {
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    const ko = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={model} />);
    expect(ko.match(/합성 예시/g)).toHaveLength(2);
    expect(ko).toContain("010-0000-0000");
    const benefits = ko.slice(ko.indexOf('id="jjinfan-benefit"'), ko.indexOf('id="jjinfan-faq"')).replace(/<[^>]+>/g, " ");
    expect(benefits).toContain("120P");
    expect(benefits).toContain("처음 520P");
    expect(benefits).toContain("찐팬 n번째");
    const faq = ko.slice(ko.indexOf('id="jjinfan-faq"'));
    expect(faq.match(/<li>/g)).toHaveLength(3);
    expect(faq).not.toMatch(/48|90일|시간/);
    expect(ko).not.toContain("채널 구독도 인증이 되나요?");
    const withSub = rawPolicy({ subscription: { points: 9, stamp: { kind: "subscription" } } });
    const subHtml = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={buildGuideModel(await fetchCatalog(withSub))} />);
    expect(subHtml).toContain("채널 구독도 인증이 되나요?");
  });

  it("pins the privacy answer to the memo-only check and the kyaa payment card to a not-yet-open message", async () => {
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    const text = (locale: "ko" | "en") =>
      renderToStaticMarkup(<JjinfanGuideContent locale={locale} model={model} />).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const ko = text("ko");
    expect(ko).toContain("메모에 전화번호·이메일·주민등록번호·카드번호 같은 개인정보가 있으면 올릴 수 없어요.");
    expect(ko).toContain("이미지 속 정보는 올리기 전에 직접 가려 주세요.");
    expect(ko).not.toMatch(/자동으로 (걸러|가려|감지|확인해요)|이미지[^.]*(자동|걸러)/);
    expect(ko).not.toContain("전화번호 같은 개인정보가 보이면");
    expect(ko).toContain("준비 중이에요. 준비되면 캡처 없이 확인돼요.");
    expect(ko).not.toContain("시스템이 자동으로 확인해요");
    const en = text("en");
    expect(en).toContain("A note containing personal details");
    expect(en).toContain("cover any details inside the image yourself");
    expect(en).not.toMatch(/Images showing|automatically (filter|detect|blur)/i);
    expect(en).toContain("Coming soon. Once it is ready, it will be checked without a screenshot.");
    expect(en).not.toContain("checks this automatically");
  });

  it("keeps the CTA copy in every locale without missing keys", () => {
    viewerState.current = { status: "guest" };
    for (const locale of APP_LOCALES) {
      for (const node of [<JjinfanGuideContent key="j" locale={locale} model={null} />, <DukjilGuideContent key="d" locale={locale} model={null} />]) {
        const html = renderToStaticMarkup(node);
        expect(html).not.toMatch(/dkg[A-Z]/);
        expect(html).toContain("data-guide-cta");
      }
    }
  });

  it("fills the detail copy in every locale with the same placeholders as the source", () => {
    const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
    expect(Object.keys(detailMessages).sort()).toEqual(Object.keys(dukjilGuideDetailSource).sort());
    for (const [key, source] of Object.entries(dukjilGuideDetailSource)) {
      for (const locale of APP_LOCALES.filter((value) => value !== "ko" && value !== "en")) {
        const text = (detailMessages as Record<string, Record<string, string>>)[key][locale];
        expect(text?.trim(), `${key}/${locale}`).toBeTruthy();
        expect(placeholders(text), `${key}/${locale}`).toEqual(placeholders(source.en));
      }
    }
  });

  it("builds /guide/jjinfan as a hero, key figures, five numbered pictured sections, questions and a closing action", async () => {
    viewerState.current = { status: "guest" };
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    for (const locale of APP_LOCALES) {
      const html = renderToStaticMarkup(<JjinfanGuideContent locale={locale} model={model} />);
      expect(html).not.toMatch(/dkg[A-Z]|\{\d\}/);
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain("jjinfan-head.webp");
      for (const number of ["01", "02", "03", "04", "05"]) expect(html).toContain(`aria-hidden="true">${number}</span>`);
      expect(new Set(html.match(/step-[a-z]+\.webp/g)).size).toBe(5);
      expect(html.match(/data-guide-cta=/g)).toHaveLength(2);
      expect(html).toContain("<details");
    }
    const ko = renderToStaticMarkup(<JjinfanGuideContent locale="ko" model={model} />);
    expect(ko).toContain("팬페이지에서 팬 인증을 마치고 미션북 5칸을 채우면 찐팬 스탬프를 받아요.");
    expect(ko).toContain("미션북 5칸으로 받는 찐팬 스탬프");
    for (const name of ["jjinfan-head", "step-passport", "step-calendar", "step-stamp", "step-ticket", "step-gift"]) {
      expect(existsSync(join(process.cwd(), "public/images/home-banners/261107", `${name}.webp`)), name).toBe(true);
    }
  });

  it("builds /guide/dukjil with figures from the catalog, the wallet exchange rate and a closing action", async () => {
    viewerState.current = { status: "guest" };
    const model = buildGuideModel(await fetchCatalog(rawPolicy()));
    const ko = renderToStaticMarkup(<DukjilGuideContent locale="ko" model={model} />);
    expect(ko).toContain(`${GROUP_WALLET_POINT_COST}P가 모이면 응모권 1장으로 바꿀 수 있어요. 바꿀 때 광고를 봐요.`);
    expect(ko).toContain("덕질 7가지로 포인트를 모아요");
    for (const name of ["dukjil-head", "step-coin", "step-ticket"]) expect(existsSync(join(process.cwd(), "public/images/home-banners/261107", `${name}.webp`)), name).toBe(true);
    for (const locale of APP_LOCALES) {
      const html = renderToStaticMarkup(<DukjilGuideContent locale={locale} model={model} />);
      expect(html).not.toMatch(/dkg[A-Z]|\{\d\}/);
      expect(new Set(html.match(/step-[a-z]+\.webp/g)).size).toBe(5);
      expect(html).toContain(`${GROUP_WALLET_POINT_COST}P`);
      expect(html.match(/data-guide-cta=/g)).toHaveLength(2);
    }
  });
});
