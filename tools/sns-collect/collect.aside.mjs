// Draft: run with `aside repl --file tools/sns-collect/collect.aside.mjs` on the collector Mac.
// Not verified against a live Aside REPL yet (Aside is not installed on the machine this was written on).
// Assumed REPL globals, kept in this one function: openTab(url) -> tab, tab.evaluate(fn), closeTab(tab).
// Rules: a dedicated new tab per page, never the user's tabs (no listBrowserTabs/attach*), close only our tab.
//
// Environment (set by launchd, never written to a file here):
//   SNS_INGEST_ENDPOINT  e.g. https://dev.kyaa.io/api/internal/sns-ingest
//   SNS_INGEST_SECRET    the dedicated ingest secret
//   SNS_COLLECT_SOURCES  path to a JSON array of { celebritySlug, platform, accountUrl }
//   SNS_COLLECT_OUT      directory for this run's evidence (originals and server results)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectSource, sendIngest } from "./collect-core.mjs";

const browser = {
  async read(url) {
    /* global openTab, closeTab */
    const tab = await openTab(url);
    try {
      return await tab.evaluate(() => ({
        finalUrl: location.href,
        hrefs: [...document.querySelectorAll("a[href]")].map(anchor => anchor.getAttribute("href")),
        scripts: [...document.querySelectorAll('script[type="application/json"]')].map(script => script.textContent ?? ""),
        rehydration: document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent ?? null,
      }));
    } finally {
      await closeTab(tab);
    }
  },
};

const sources = JSON.parse(readFileSync(process.env.SNS_COLLECT_SOURCES, "utf8"));
const out = process.env.SNS_COLLECT_OUT;
mkdirSync(out, { recursive: true });
const summary = [];
for (const source of sources) {
  const name = `${source.celebritySlug}-${source.platform}`;
  try {
    const { request, unread } = await collectSource(browser, source);
    writeFileSync(join(out, `${name}.request.json`), JSON.stringify({ request, unread }, null, 2));
    const result = await sendIngest(fetch, process.env.SNS_INGEST_ENDPOINT, process.env.SNS_INGEST_SECRET, request);
    writeFileSync(join(out, `${name}.result.json`), JSON.stringify(result, null, 2));
    summary.push({ source: name, collectorError: request.collectorError ?? null, sent: request.posts.length, unread: unread.length,
      statuses: Object.fromEntries(Object.entries(Object.groupBy(result.items, item => item.status)).map(([key, items]) => [key, items.length])) });
  } catch (error) {
    // One broken source must not stop the others; the server's stale alert covers what is never sent.
    summary.push({ source: name, error: String(error?.message ?? error) });
  }
}
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
