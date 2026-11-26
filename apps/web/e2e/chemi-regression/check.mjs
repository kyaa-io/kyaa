import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const base = new URL(process.argv[2]);
assert.match(base.protocol, /^https?:$/);
const baseline = process.env.CHEMI_BASELINE_DIR ?? new URL("./baseline/", import.meta.url).pathname;
const captureOnly = process.argv.includes("--capture-only");
const capture = captureOnly && process.env.CHEMI_CAPTURE_DIR;
assert.ok(!captureOnly || capture, "--capture-only requires CHEMI_CAPTURE_DIR");
const locales = ["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "id", "vi", "th", "pt", "fr", "ru", "mn"];
const routes = {
  entry: "/chemi",
  fortune: "/chemi/fortune?c=elina",
  saju: "/chemi/saju",
  star: "/chemi/star",
  tarot: "/chemi/tarot",
  ask: process.env.CHEMI_ASK_PATH ?? "/chemi/saju?step=result&ask=topic",
  growth: "/chemi?tab=growth",
  match: "/chemi/games/match",
  run: "/chemi/games/run",
  guide: "/guide/chemi",
};
// CHEMI_SCREENS=ask,guide 처럼 쉼표로 주면 그 화면만 돈다(느린 로컬 개발 서버에서 한 화면씩 확인할 때).
const only = process.env.CHEMI_SCREENS?.split(",").map(name => name.trim()).filter(Boolean);
assert.ok(!only || only.every(name => name in routes), `CHEMI_SCREENS must name screens from: ${Object.keys(routes).join(", ")}`);
const onlyLocales = process.env.CHEMI_LOCALES?.split(",").map(name => name.trim()).filter(Boolean);
assert.ok(!onlyLocales || onlyLocales.every(name => locales.includes(name)), `CHEMI_LOCALES must name locales from: ${locales.join(", ")}`);
const activities = ["fortune", "saju", "zodiac", "tarot", "pair", "run"];
const browser = await chromium.launch();
let failures = 0;
async function gate(screen, locale, name, check) {
  try {
    await check();
  } catch (error) {
    failures++;
    console.error(`FAIL ${screen} ${locale} ${name} ${error.message.split("\n")[0]}`);
  }
}

/** 한 단계를 해 보고, 실패하면 잠시 뒤 recover(없으면 같은 단계)로 두 번까지 다시 한다. */
async function retry(step, page, recover = step) {
  try {
    await step();
  } catch (error) {
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.waitForTimeout(10000);
      try {
        await recover();
        if (recover !== step) await step();
        return;
      } catch (next) {
        if (attempt === 1) throw next;
      }
    }
  }
}

async function open(page, path, locale) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, "screen URL must stay on target origin");
  url.searchParams.set("locale", locale);
  // 로컬 개발 서버는 메모리 한도로 다시 뜨는 동안 연결을 거절한다. 그때만 잠시 뒤 두 번까지 다시 연다.
  let response;
  for (let attempt = 0; ; attempt++) {
    try {
      response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: Number(process.env.CHEMI_NAV_TIMEOUT ?? 12000) });
      break;
    } catch (error) {
      if (attempt >= 2 || !/ERR_CONNECTION_(REFUSED|RESET)/.test(error.message)) throw error;
      await page.waitForTimeout(15000);
    }
  }
  assert.ok(response?.ok(), `HTTP ${response?.status()}`);
  assert.equal(new URL(page.url()).pathname, url.pathname, "unexpected redirect");
  await page.locator("main").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const paragraphs = page => page.locator("main p, main h1, main h2, main h3, main [data-fan-text=\"body\"]")
  .evaluateAll(nodes => nodes.filter(node => node.checkVisibility())
    .map(node => node.innerText.replace(/\s+/g, " ").trim()).filter(Boolean));

async function catalogChecks() {
  const flatten = (value, prefix = "") => typeof value === "string" ? [[prefix, value]]
    : Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
  const catalog = async locale => new Map(flatten(JSON.parse(await readFile(
    new URL(`../../features/chemi/i18n/locales/${locale}/chemi.json`, import.meta.url), "utf8"))));
  const english = await catalog("en");
  for (const locale of locales) {
    await gate("catalog", locale, "dictionary", async () => {
      const translated = await catalog(locale);
      const missing = [...english].filter(([key]) => !translated.get(key)?.trim());
      assert.ok(!missing.length, `missing or empty: ${missing.map(([key]) => key).join(", ")}`);
    });
  }
}

async function layout(page, width, screen, locale) {
  await gate(screen, locale, `overflow-${width}`, async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.equal(overflow, 0, `${overflow}px horizontal overflow`);
  });
  await gate(screen, locale, `hit-area-${width}`, async () => {
    const buttons = page.locator('main button:enabled:visible, main [role="button"]:visible');
    const issues = await buttons.evaluateAll(nodes => nodes.flatMap(node => {
      const rect = node.getBoundingClientRect();
      const label = node.getAttribute("aria-label") || node.textContent.trim();
      if (node.closest('[aria-hidden="true"], [inert]') || node.getAttribute("aria-disabled") === "true") return [];
      if (rect.width < 44 || rect.height < 44) return [`${label} ${rect.width}×${rect.height}`];
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      // 스크롤 목록 안에서 잘려 보이는 항목은 가운데가 목록 밖이라 가려진 것처럼 잡힌다. 목록을 굴려 닿으므로 뺀다.
      const clipped = (element => {
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflow === "visible") continue;
          const box = parent.getBoundingClientRect();
          if (x < box.left || x >= box.right || y < box.top || y >= box.bottom) return true;
        }
        return false;
      })(node);
      if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && !clipped &&
          !node.contains(document.elementFromPoint(x, y))) return [`${label} intercepted`];
      return [];
    }));
    assert.ok(!issues.length, issues.join(", "));
  });
}

async function still(page, selector) {
  const region = page.locator(selector).first();
  await region.waitFor();
  await region.evaluate(root => {
    for (const img of root.querySelectorAll("img")) img.loading = "eager";
  });
  await region.scrollIntoViewIfNeeded();
  await region.locator("img").evaluateAll(images => Promise.race([
    Promise.all(images.map(img => img.decode())),
    new Promise((_, reject) => setTimeout(() => reject(new Error("image decode timeout")), 5000)),
  ]));
  return region.screenshot({ animations: "disabled" });
}

const pixels = image => sharp(image).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });

async function snapshot(page, id, selector) {
  const image = await still(page, selector);
  if (capture) {
    await mkdir(capture, { recursive: true });
    await writeFile(join(capture, id + ".test.png"), image, { flag: "wx" });
    return;
  }
  const expected = await pixels(await readFile(join(baseline, id + ".test.png")));
  const actual = await pixels(image);
  assert.deepEqual(actual.info, expected.info, "capture dimensions changed");
  let changed = 0;
  for (let i = 0; i < actual.data.length; i += 3) {
    if ([0, 1, 2].some(n => Math.abs(actual.data[i + n] - expected.data[i + n]) > 24)) changed++;
  }
  const ratio = changed / (actual.info.width * actual.info.height);
  assert.ok(ratio <= 0.01, `${(ratio * 100).toFixed(2)}% changed (limit 1%)`);
}

const linear = value => value / 255 <= 0.04045 ? value / 255 / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4;
const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

async function contrast(page, id) {
  const art = page.locator(`[data-content="${id}"]`);
  const title = art.locator("h1");
  const color = await title.evaluate(node => getComputedStyle(node).color);
  assert.equal(color, "rgb(255, 255, 255)", "banner title color");
  const ink = await pixels(await title.screenshot());
  await title.evaluate(node => node.style.opacity = "0");
  try {
    const background = await pixels(await title.screenshot());
    let samples = 0;
    let minimum = Infinity;
    for (let i = 0; i < ink.data.length; i += 3) {
      if (Math.min(...ink.data.subarray(i, i + 3)) < 248 ||
          Math.max(...ink.data.subarray(i, i + 3).map((v, n) => Math.max(0, v - background.data[i + n]))) < 8) continue;
      samples++;
      minimum = Math.min(minimum, 1.05 / (luminance(...background.data.subarray(i, i + 3)) + 0.05));
    }
    assert.ok(samples && minimum >= 4.5, `contrast ${minimum.toFixed(2)}:1 (${samples} glyph pixels)`);
  } finally {
    await title.evaluate(node => node.style.removeProperty("opacity"));
  }
}

async function selectBanner(page, index) {
  await page.locator('main button[aria-pressed]').filter({ has: page.locator('span[aria-hidden="true"]') }).nth(index).click();
  await page.locator(`[data-content="${activities[index]}"]`).waitFor();
  await page.mouse.move(0, 0);
}

// loops: the entry banner videos repeat on every visit (they are not one-time introductions), so a revisit keeps playing.
async function motion(screen, path, selector, index, loops = false) {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
    page.setDefaultTimeout(5000);
    try {
      const load = async () => {
        await open(page, path, "ko");
        if (index !== undefined) await selectBanner(page, index);
        return page.locator(selector).first();
      };
      const stopped = async video => {
        // No source is attached by the playback effect on a stopped visit.
        await video.waitFor({ state: "attached" });
        await page.clock.runFor(700);
        assert.deepEqual(await video.evaluate(node =>
          [node.paused, node.currentTime, node.hasAttribute("src")]), [true, 0, false]);
      };
      if (reducedMotion === "reduce") {
        await gate(screen, "ko", "reduced-motion", async () => {
          await page.clock.install();
          await stopped(await load());
        });
      } else {
        await gate(screen, "ko", "first-play", async () => {
          await load();
          await page.waitForFunction(selector => {
            const video = document.querySelector(selector);
            return video && !video.paused && video.currentTime > 0;
          }, selector);
        });
        if (loops) {
          await gate(screen, "ko", "revisit-playing", async () => {
            await load();
            await page.waitForFunction(selector => {
              const video = document.querySelector(selector);
              return video && !video.paused && video.currentTime > 0;
            }, selector);
          });
        } else {
          await gate(screen, "ko", "revisit-stopped", async () => {
            await page.clock.install();
            await stopped(await load());
          });
        }
      }
    } finally {
      await page.close();
    }
  }
}

/**
 * 질문 장면의 첫 선택지까지 기다린다. 계정이 다른 날 물은 질문이 있으면 최애가 그 질문부터 되묻고
 * 대답 버튼(잘됐어·아직이야·새로 물을래)이 나온다. 그 버튼 문구를 replies 에 모으고 '새로 물을래'(마지막)를 눌러 주제 칩까지 간다.
 */
async function askReady(page, replies) {
  const timeout = Number(process.env.CHEMI_NAV_TIMEOUT ?? 12000) * 2;
  const topics = page.locator('[data-ask-step] [role="group"] button').first();
  const recall = page.locator('[data-ask-step] [class*="replies"] button');
  await topics.or(recall.first()).waitFor({ timeout });
  if (!await recall.count()) return;
  replies.push(...await recall.evaluateAll(nodes => nodes.map(node => node.innerText.replace(/\s+/g, " ").trim()).filter(Boolean)));
  await recall.last().click();
  await topics.waitFor({ timeout });
}

/**
 * CHEMI_ASK_PATH 를 안 주면 로그인 상태 파일의 계정이 저장해 둔 사주 첫 풀이로 질문 주소를 만든다.
 * 세션 쿠키로 액세스 토큰을 받아 풀이 목록(최신순)에서 첫 풀이를 고른다. 계정에 저장된 풀이가 없으면 실패로 남는다.
 */
async function savedAskPath(context) {
  const apiTimeout = Number(process.env.CHEMI_NAV_TIMEOUT ?? 12000) * 2.5;
  const session = await context.request.get(new URL("/api/auth/cognito/session", base).href, { timeout: apiTimeout });
  const { accessToken } = session.ok() ? await session.json() : {};
  assert.ok(accessToken, "the saved login state has no live session; renew CHEMI_STORAGE_STATE");
  const list = await context.request.get(new URL("/api/chemi/readings?content=saju", base).href, { headers: { Authorization: `Bearer ${accessToken}` }, timeout: apiTimeout });
  assert.ok(list.ok(), `reading list returned ${list.status()}`);
  const first = (await list.json()).find(row => row.kind === "first" && row.character && row.readingId);
  assert.ok(first, "the test account has no saved Saju reading; open /chemi/saju once with it");
  return `/chemi/saju?step=result&c=${first.character}&r=${first.readingId}&ask=topic`;
}

try {
  if (!captureOnly && !only) await catalogChecks();
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: "reduce",
      timezoneId: "Asia/Seoul",
    });
    page.setDefaultTimeout(5000);
    try {
      const askPage = !captureOnly && process.env.CHEMI_STORAGE_STATE ? await browser.newPage({
        viewport: page.viewportSize(), reducedMotion: "reduce", timezoneId: "Asia/Seoul",
        storageState: process.env.CHEMI_STORAGE_STATE,
      }) : page;
      askPage.setDefaultTimeout(5000);
      let askPath = process.env.CHEMI_ASK_PATH;
      if (askPage !== page && !askPath) await gate("ask", "-", `seed-${width}`, () => retry(async () => { askPath = await savedAskPath(askPage.context()); }, askPage));
      for (const [screen, route] of Object.entries(routes)) {
        const path = screen === "ask" && askPath ? askPath : route;
        const scenePage = screen === "ask" ? askPage : page;
        if (captureOnly && !["entry", "match", "run"].includes(screen)) continue;
        if (only && !only.includes(screen)) continue;
        let english = [];
        for (const locale of captureOnly ? ["ko"] : ["en", ...locales.filter(locale => locale !== "en")].filter(locale => !onlyLocales || onlyLocales.includes(locale))) {
          let loaded = false;
          const replies = [];
          await gate(screen, locale, `screen-${width}`, async () => {
            if (screen === "ask") {
              assert.ok(askPath && process.env.CHEMI_STORAGE_STATE,
                "set CHEMI_STORAGE_STATE (kyaa-t3 chemi-check fills it for DEV) for a seeded test account");
            }
            await open(scenePage, path, locale);
            // 질문 장면은 저장된 풀이를 불러온 뒤에야 최애 대사와 칩이 나온다. 칩까지 기다린 뒤 검사한다.
            // 불러오기가 끊기면(서버가 다시 뜨는 중) 같은 주소를 두 번까지 다시 연다.
            if (screen === "ask") await retry(() => { replies.length = 0; return askReady(scenePage, replies); },
              scenePage, () => open(scenePage, path, locale));
            if (screen === "growth") {
              await scenePage.locator('main [data-chemi-hide-dm]:not([aria-busy="true"])').first().waitFor();
            }
            loaded = true;
          });
          if (!loaded) continue;
          if (!captureOnly) await gate(screen, locale, `language-${width}`, async () => {
            const copy = await paragraphs(scenePage);
            // 질문 장면의 칩(주제·예시 질문)은 문단이 아니라 버튼이라 따로 모은다. 지난 질문 줄은 회원이 쓴 글이라 뺀다.
            if (screen === "ask") copy.push(...replies, ...await scenePage.locator('[data-ask-step] [role="group"] button')
              .evaluateAll(nodes => nodes.filter(node => node.checkVisibility()).map(node => node.innerText.replace(/\s+/g, " ").trim()).filter(Boolean)));
            assert.ok(copy.length, "no visible paragraphs or headings");
            if (locale === "en") english = copy.filter(line => /(?:[A-Za-z]+\s+){3}[A-Za-z]+/.test(line));
            const leaked = copy.filter(line => (locale !== "ko" && /[가-힣]/.test(line))
              || (locale !== "en" && english.some(paragraph => line.includes(paragraph))));
            assert.ok(!leaked.length, `${leaked.length} visible text blocks contain fallback copy`);
          });
          if (!captureOnly) await layout(scenePage, width, screen, locale);
          if (locale !== "ko") continue;
          if (screen === "entry") {
            for (const [index, id] of captureOnly ? [] : activities.entries()) {
              await gate(screen, locale, `contrast-${id}-${width}`, async () => {
                await selectBanner(page, index);
                await still(page, `[data-content="${id}"]`);
                await contrast(page, id);
              });
            }
            await gate(screen, locale, `pixels-${width}`, async () => {
              await selectBanner(page, 0);
              await snapshot(page, `entry-${width}`, '[data-content="fortune"]');
            });
          }
          if (screen === "match" || screen === "run") {
            const target = screen === "match" ? 'ol[class*="levelList"]' : "dl[data-layout]:visible";
            await gate(screen, locale, `pixels-${width}`, () => snapshot(page, `${screen}-${width}`, target));
          }
        }
      }
      if (askPage !== page) await askPage.close();
    } finally {
      await page.close();
    }
  }
  if (!captureOnly && !only) {
    await motion("entry", routes.entry, '[data-content="zodiac"] video', 2, true);
    await motion("first-transformation-elina", routes.fortune, "video[data-once]");
    await motion("first-transformation-yuna", "/chemi/fortune?c=yuna", "video[data-once]");
    await motion("fortune-scene", process.env.CHEMI_FORTUNE_SCENE_PATH ?? "/chemi/fortune?c=changha", "[data-fortune-flow] video");
  }
} finally {
  await browser.close();
}
console.log(`Chemi browser gate: ${failures} failed${capture ? " (capture mode)" : ""}`);
process.exitCode = failures ? 1 : 0;
