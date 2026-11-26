import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { ReadingCopyProvider } from "@/features/chemi/i18n/reading-ui";
import { AskScene } from "./ask-scene";
import { askExamples, askLinesFor, askResultLine, type AskCharacter, type AskContent } from "./lines";
import { askGo, useAskLocation } from "./location";

/**
 * CHEMI-R13A-I18N-1126: 질문하기 화면을 13개 언어로 실제로 그려, 최애 대사·예시 칩·결과 칩이 그 언어로 나오고
 * 한국어·영어 문장이 남지 않았는지 본다(12회차 채점에서 en·ja·th 가 한국어였다).
 */
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, getAccessToken: async () => "session" }),
}));
vi.mock("@/components/fan-ui/fan-toast", () => ({ showFanToast: vi.fn() }));

const reading = "11111111-1111-4111-8111-111111111111";
const emptyState = { left: 3, shareBonus: { pass: true, exp: true }, reminded: false, pausedUntil: null, threads: [] };
const hangul = /[가-힣]/;
const locales = APP_LOCALES.filter((locale) => locale !== "ko");

function Host({ locale, content, character }: { locale: (typeof locales)[number]; content: AskContent; character: AskCharacter }) {
  const at = useAskLocation();
  return at ? <AskScene locale={locale} content={content} character={character} readingId={reading} at={at} result={`79 · ${locale}`} /> : null;
}

/** 화면에 보이는 글자 조각(글자 노드 하나씩)과 버튼 이름. */
function shown() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const rows: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.replace(/\s+/g, " ").trim();
    if (text) rows.push(text);
  }
  document.querySelectorAll("[aria-label]").forEach((node) => rows.push(node.getAttribute("aria-label")!));
  return rows;
}

async function open(locale: (typeof locales)[number], content: AskContent, character: AskCharacter, at: Parameters<typeof askGo>[0]) {
  const catalog = (await import(`../i18n/locales/${locale}/chemi.json`)).default;
  history.replaceState(null, "", `/chemi/${content}?step=result`);
  render(<ReadingCopyProvider value={catalog}><Host locale={locale} content={content} character={character} /></ReadingCopyProvider>);
  askGo(at);
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(emptyState)));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function leaks(locale: string, rows: string[]) {
  const korean = rows.filter((row) => hangul.test(row));
  // 영어 문장이 그대로 남았는지: 글자가 영어가 아닌 언어(라틴 글자를 안 쓰는 언어)에서만 본다.
  const english = ["ja", "zh-Hans", "zh-Hant", "th", "ru", "mn"].includes(locale) ? rows.filter((row) => /(?:[A-Za-z]+\s+){2}[A-Za-z]+/.test(row)) : [];
  return { korean, english };
}

describe("ask scene in every language", () => {
  for (const locale of locales) {
    it(`${locale}: topic, write and result steps speak the reader's language with each idol's own opening line`, async () => {
      const cases: [AskContent, AskCharacter][] = [["saju", "changha"], ["fortune", "elina"], ["star", "yuna"], ["tarot", "changha"]];
      for (const [content, character] of cases) {
        const lines = askLinesFor(character, locale);

        await open(locale, content, character, { step: "topic" });
        await waitFor(() => expect(shown()).toContain(lines.topic));
        let rows = shown();
        expect(screen.getAllByRole("button").length).toBeGreaterThan(5);
        expect(leaks(locale, rows), `${locale} ${character} topic`).toEqual({ korean: [], english: [] });
        document.body.innerHTML = "";

        await open(locale, content, character, { step: "write", topic: "love" });
        await waitFor(() => expect(shown()).toContain(lines.reask.love));
        rows = shown();
        for (const example of askExamples("love", character, locale)) expect(rows, `${locale} ${character} example`).toContain(example);
        expect(leaks(locale, rows), `${locale} ${character} write`).toEqual({ korean: [], english: [] });
        document.body.innerHTML = "";

        await open(locale, content, character, { step: "result" });
        await waitFor(() => expect(shown()).toContain(askResultLine(content, character, locale)));
        rows = shown();
        expect(rows.some((row) => row.includes(`79 · ${locale}`))).toBe(true);
        expect(leaks(locale, rows), `${locale} ${character} ${content} result`).toEqual({ korean: [], english: [] });
        document.body.innerHTML = "";
      }
    }, 60000);
  }
});
