import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { stems, branches, type Chart, type Stem } from "./chart";
import { firstReading, monthReading, pairJudgments, pairReading, yearReading } from "./copy";
import { sajuBasis, sajuDomains } from "./depth";
import { dayLine, elementView, natureRows, relationRows, scopeLabel, sheetColumns, sheetDetail, sheetLabel, strengthView, tenGodView, termNote, yearFlowView } from "./first";
import { sajuCharacters, sajuOpening, sajuReactIntl, sajuTalkLine } from "./lines";
import { SajuResult, type ResultView } from "./result";
import { pillarLabel } from "./terms-i18n";
import { sajuTx, type SajuPack } from "./tx";
import { SajuTxProvider } from "./tx-context";

vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnBadge: () => <b>+3</b> }));

/**
 * 한국어 밖 12개 언어로 저장 사주 결과를 처음부터 끝까지 만들었을 때 한글·빈 자리표시가 남지 않는지 본다.
 * 일간 10개 × 명식 3종(여덟 글자 · 시간 모름 · 절기 날 잠김) × 시각 2개로 문장 틀과 표를 모두 지난다.
 */
const hangul = /[가-힣]/;
const pack = (locale: string): SajuPack =>
  JSON.parse(readFileSync(resolve(__dirname, "../../../features/chemi/i18n/locales", locale, "saju.json"), "utf8"));

const stages = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"];
const spirits = ["겁살", "재살", "천살", "지살", "년살", "월살", "망신살", "장성살", "반안살", "역마살", "육해살", "화개살"];
function charts(stem: Stem, shift: number): Chart[] {
  const at = (index: number) => ({ heavenlyStem: stems[(stems.indexOf(stem) + index) % 10], earthlyBranch: branches[(shift + index * 5) % 12] });
  const detail = (index: number) => ({ lifeStage: stages[(shift + index) % 12], spirit: spirits[(shift + index * 3) % 12] });
  const full: Chart = {
    pillars: { hour: at(3), day: { heavenlyStem: stem, earthlyBranch: branches[shift % 12] }, month: at(1), year: at(2) },
    details: { hour: detail(0), day: detail(1), month: detail(2), year: detail(3) },
    timeKnown: true,
    termBoundary: false,
    locked: [],
    lockReason: null,
    solarTerm: null,
  } as Chart;
  return [
    full,
    { ...full, pillars: { ...full.pillars, hour: null }, timeKnown: false } as Chart,
    {
      ...full,
      pillars: { ...full.pillars, hour: null, month: null },
      timeKnown: false,
      termBoundary: true,
      locked: ["month"],
      solarTerm: { name: "입춘", at: "2000-02-04T11:40:00Z" },
    } as Chart,
  ];
}
const times = [Date.parse("2026-11-19T03:00:00Z"), Date.parse("2027-01-20T03:00:00Z")];

function texts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (value && typeof value === "object") return Object.values(value).flatMap(texts);
  return [];
}

describe("saved saju reading in every language", () => {
  for (const locale of APP_LOCALES.filter((value) => value !== "ko")) {
    it(`${locale}: every block is written in the chosen language`, () => {
      const tx = sajuTx(locale, pack(locale))!;
      const seen: string[] = [];
      stems.forEach((stem, index) => {
        for (const chart of charts(stem, index)) {
          for (const at of times) {
            const year = yearReading(chart, at, tx);
            const { stem: _stem, pillar: _pillar, trait: _trait, strengthR, strengthN, cautionR, cautionN, fandomR, rows: _rows, flow: _flow, flowTitle: _flowTitle, keywords, ...first } = firstReading(chart, at, tx);
            void [strengthR, strengthN, cautionR, cautionN, fandomR];
            seen.push(
              ...texts([
                first,
                keywords.map(({ label, name, act }) => [label, name, act]),
                dayLine(chart, tx).read,
                sheetColumns(chart, tx).map((column) => (column.known ? [column.name, column.stemGod, column.branchGod, column.lifeStage, column.spirit] : column.name)),
                sheetLabel(chart, tx),
                termNote(chart, tx),
                scopeLabel(chart, tx),
                natureRows(chart, tx),
                yearFlowView(chart, at, tx).rows,
                { ...year, months: null, basis: null },
                { ...monthReading(chart, at, tx), weeks: null },
                (["first", "year", "month"] as const).map((view) => [sajuBasis(chart, at, view, tx), sajuDomains(chart, at, view, tx).map(({ levelName, basis, sentences }) => [levelName, basis, sentences])]),
                sajuCharacters.map(({ id }) => [
                  sajuOpening(id, stem, tx),
                  sajuReactIntl(tx, id, stem, year.title),
                  ([1, 2, 3, 4] as const).map((talk) => sajuTalkLine(id, talk, { image: "", trait: "", strengthN: "", cautionN: "", bond: "", yearTitle: year.title }, tx, stem)),
                ]),
              ]),
            );
            if (chart.pillars.month)
              seen.push(
                ...texts([
                  sheetDetail(chart, tx),
                  elementView(chart, tx),
                  { ...strengthView(chart, tx), class: null },
                  tenGodView(chart, tx).rows,
                  tenGodView(chart, tx).groups.map((group) => [group.name, group.plain]),
                  relationRows(chart, tx).map(({ kindName, where, tag, plain }) => [kindName, where, tag, plain]),
                ]),
              );
          }
        }
        for (const other of stems) {
          const reading = pairReading(stem, other, index % 2, (index + 1) % 2, tx);
          seen.push(...texts([reading.title, reading.rows.map((row) => [row.label, row.levelName]), reading.notes, reading.powers, reading.clash, reading.together, reading.line("Mina")]));
          seen.push(...texts(pairJudgments(stem, other, 1, index % 2, tx)));
        }
      });
      expect(seen.length).toBeGreaterThan(2000);
      expect([...new Set(seen.filter((text) => hangul.test(text)))], "Korean").toEqual([]);
      expect([...new Set(seen.filter((text) => /\{\w*\}|undefined|NaN/.test(text)))], "unfilled").toEqual([]);
    });
  }

  it("names a day pillar from the shared terms table", () => {
    expect(pillarLabel("갑진", "ko")).toBe("갑진");
    expect(pillarLabel("갑진", "en")).toBe("Gap-jin");
    expect(pillarLabel("갑진", "mn")).toBe("Gap-jin");
    expect(pillarLabel("갑진", "ja")).toBe("甲辰");
    expect(pillarLabel("갑진", "vi")).toBe("Giáp Thìn");
  });
});

const handlers = { onBack: vi.fn(), onShare: vi.fn(), onAsk: vi.fn(), onTopics: vi.fn(), onGo: vi.fn(), onScene: vi.fn(), onPair: vi.fn(), onBirthTime: vi.fn() };
const [saved] = charts("병", 6);
const partner = charts("신", 2)[0];

describe("saved saju result screen", () => {
  for (const locale of ["en", "ja", "th", "ru"] as const) {
    for (const view of ["first", "year", "month", "pair"] as ResultView[]) {
      it(`${locale} ${view}: no Korean left outside the shared screen copy`, async () => {
        const catalog = JSON.parse(readFileSync(resolve(__dirname, "../../../features/chemi/i18n/locales", locale, "chemi.json"), "utf8"));
        const { ReadingCopyProvider } = await import("@/features/chemi/i18n/reading-ui");
        const { container } = render(
          <ReadingCopyProvider value={catalog}>
            <SajuTxProvider locale={locale} pack={pack(locale)}>
              <SajuResult
                locale={locale}
                character="elina"
                view={view}
                chart={saved}
                at={times[0]}
                points={0}
                exp={0}
                sharing={false}
                pair={
                  view === "pair"
                    ? {
                        id: "p1",
                        name: "Mina",
                        timeKnown: true,
                        result: {
                          dayStems: ["병", "신"],
                          combinations: ["병신"],
                          clashes: [],
                          charts: { self: saved.pillars, partner: partner.pillars },
                          relations: [{ selfKey: "day", partnerKey: "day", kind: "충" }],
                        } as never,
                      }
                    : undefined
                }
                {...handlers}
              />
            </SajuTxProvider>
          </ReadingCopyProvider>,
        );
        container.querySelectorAll("details").forEach((node) => node.setAttribute("open", ""));
        expect((container.textContent ?? "").match(/[가-힣]+[^가-힣]{0,12}/g) ?? []).toEqual([]);
        expect(container.innerHTML).not.toMatch(/aria-label="[^"]*[가-힣]/);
      });
    }
  }
});
