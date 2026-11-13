// Run with node; Aside REPL cannot import Node modules.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { collectSource, sendCollectedSource } from "./collect-core.mjs";

const exec = promisify(execFile);
const browser = {
  async read(url) {
    const code = `const tab = await openTab(${JSON.stringify(url)});
      try {
        await snapshot(tab);
        console.log("SNS_RESULT:" + JSON.stringify(await tab.evaluate(() => ({
          finalUrl: location.href,
          hrefs: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")),
          scripts: [...document.querySelectorAll('script[type="application/json"]')].map(s => s.textContent ?? ""),
          rehydration: document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent ?? null
        }))));
      } finally { await closeTab(tab); }`;
    const { stdout } = await exec("aside", ["repl", "--account", "u0", "--json", code],
      { timeout: 130000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, SNS_INGEST_SECRET: "" } });
    const result = JSON.parse(stdout.split("\n").findLast(line => line.startsWith('{"run":')) ?? stdout);
    if (result.run?.error) throw new Error("ASIDE_READ_FAILED");
    const line = result.run.content.filter(c => c.type === "text").flatMap(c => c.text.split("\n")).find(l => l.startsWith("SNS_RESULT:"));
    if (!line) throw new Error("ASIDE_RESULT_MISSING");
    return JSON.parse(line.slice("SNS_RESULT:".length));
  },
};

const sources = JSON.parse(readFileSync(process.env.SNS_COLLECT_SOURCES, "utf8"));
if (!Array.isArray(sources) || !sources.length || sources.some(s =>
  !s || !/^[a-z0-9][a-z0-9.-]*$/i.test(s.celebritySlug ?? "") ||
  !["instagram", "tiktok"].includes(s.platform) || typeof s.accountUrl !== "string")) {
  throw new Error("SNS_COLLECT_SOURCES_INVALID");
}
const out = process.env.SNS_COLLECT_OUT;
mkdirSync(out, { recursive: true });
const summary = [];
async function runSource(source) {
  const name = `${source.celebritySlug}-${source.platform}`;
  try {
    const { request, unread } = await collectSource(browser, source);
    writeFileSync(join(out, `${name}.request.json`), JSON.stringify({ request, unread }, null, 2));
    const result = await sendCollectedSource(fetch, process.env.SNS_INGEST_ENDPOINT, process.env.SNS_INGEST_SECRET, request,
      partial => writeFileSync(join(out, `${name}.result.json`), JSON.stringify(partial, null, 2)));
    writeFileSync(join(out, `${name}.result.json`), JSON.stringify(result, null, 2));
    const statuses = {};
    for (const item of result.items) statuses[item.status] = (statuses[item.status] ?? 0) + 1;
    summary.push({ source: name, collectorError: request.collectorError ?? null, sent: request.posts.length - result.unsubmitted, deferred: result.unsubmitted, unread: unread.length, failed: result.items.filter(item => item.reason === "IMAGE_FAILED" || item.status === "failed").length,
      statuses });
  } catch (error) {
    // One broken source must not stop the others; the server's stale alert covers what is never sent.
    summary.push({ source: name, error: String(error?.message ?? error) });
  } finally {
    writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  }
}
// Leave one of the three allowed tabs for the user's signed-in browser.
let next = 0;
await Promise.all(Array.from({ length: Math.min(2, sources.length) }, async () => {
  while (next < sources.length) await runSource(sources[next++]);
}));
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
if (summary.some(s => s.error || s.collectorError || s.unread || s.failed)) process.exitCode = 1;
