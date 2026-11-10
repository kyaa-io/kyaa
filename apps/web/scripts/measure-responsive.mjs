#!/usr/bin/env node
// 반응형 시스템 측정(DESIGN.md "Responsive system" R12). 로그인 없이 공개 경로를 390·1024·1440에서 잰다.
// 실행: BASE_URL=https://dev.kyaa.io node apps/web/scripts/measure-responsive.mjs [--routes /,/rankings] [--routes-file routes.json] [--out out.json] [--widths 390,1024,1440]
// 경로 목록: --routes > --routes-file(JSON 문자열 배열) > ROUTES 환경변수(쉼표) > 기본값. 실패(가로 넘침·본문 줄 길이·행 빈 간격·좌우 여백 차)가 있으면 종료 코드 1, 측정 오류는 2.
import fs from "node:fs";
import { evaluate, summarize, collectInPage, WIDTHS } from "./responsive-metrics.mjs";

const DEFAULT_ROUTES = ["/", "/rankings", "/notices"];
const HEIGHT = { 390: 844, 1024: 768, 1440: 900 };

function parseArgs(argv, env) {
  const o = { base: env.BASE_URL ?? "", routes: null, routesFile: "", out: "", widths: WIDTHS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const v = argv[i + 1];
    if (a === "--base") { o.base = v; i++; }
    else if (a === "--routes") { o.routes = v.split(",").map((s) => s.trim()).filter(Boolean); i++; }
    else if (a === "--routes-file") { o.routesFile = v; i++; }
    else if (a === "--out") { o.out = v; i++; }
    else if (a === "--widths") { o.widths = v.split(",").map(Number).filter(Boolean); i++; }
  }
  if (!o.routes && o.routesFile) o.routes = JSON.parse(fs.readFileSync(o.routesFile, "utf8"));
  if (!o.routes && env.ROUTES) o.routes = env.ROUTES.split(",").map((s) => s.trim()).filter(Boolean);
  if (!o.routes) o.routes = DEFAULT_ROUTES;
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2), process.env);
  if (!o.base) { console.error("BASE_URL(또는 --base)이 필요합니다. 예: BASE_URL=https://dev.kyaa.io"); process.exit(2); }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const results = [];
  try {
    for (const width of o.widths) {
      const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 800 }, locale: "ko-KR" });
      const page = await ctx.newPage();
      for (const route of o.routes) {
        const url = new URL(route, o.base).toString();
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
          const raw = await page.evaluate(collectInPage);
          const { failures, warnings } = evaluate(raw, width);
          results.push({ route, url, width, failures, warnings, margins: raw.margins });
        } catch (e) {
          results.push({ route, url, width, failures: [], warnings: [], error: String(e.message ?? e).split("\n")[0] });
        }
      }
      await ctx.close();
    }
  } finally { await browser.close(); }
  const { text, failed } = summarize(results);
  const json = JSON.stringify({ base: o.base, measuredAt: new Date().toISOString(), failed, results }, null, 2);
  if (o.out) fs.writeFileSync(o.out, json + "\n"); else console.log(json);
  console.error(text);
  process.exit(results.some((r) => r.error) ? 2 : failed ? 1 : 0);
}
main();
