// Run with node; Aside REPL cannot import Node modules.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { collectSource, followersEndpoint, sendCollectedSource, sendIngest } from "./collect-core.mjs";

const exec = promisify(execFile);
const browser = {
  async read(url) {
    const code = `const tab = await openTab(${JSON.stringify(url)});
      try {
        const view = await snapshot(tab);
        const data = await tab.evaluate(() => ({
          finalUrl: location.href,
          hrefs: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")),
          scripts: [...document.querySelectorAll('script[type="application/json"]')].map(s => s.textContent ?? ""),
          rehydration: document.getElementById("__UNIVERSAL_DATA_FOR_REHYDRATION__")?.textContent ?? null,
          // The profile header's follower element: TikTok's count, or Instagram's "팔로워 428.3만" link (its title holds the number).
          followerText: (() => {
            const tiktok = document.querySelector('[data-e2e="followers-count"]');
            if (tiktok) return tiktok.textContent;
            const link = [...document.querySelectorAll('a, [role="link"], button')].find(e => /^팔로워\\s|\\sfollowers$/i.test((e.innerText ?? "").trim()));
            return link ? (link.querySelector("[title]")?.getAttribute("title") ?? link.innerText) : null;
          })()
        }));
        data.emptyProfile = /heading.*게시물 없음/.test(view.tree) && /게시물\\s+0(?:[^0-9]|$)/.test(view.tree);
        console.log("SNS_RESULT:" + JSON.stringify(data));
      } finally { await closeTab(tab); }`;
    const { stdout } = await exec("aside", ["repl", "--account", "u0", "--json", code],
      { timeout: 130000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, SNS_INGEST_SECRET: "", SNS_INGEST_SECRET_2: "" } });
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
const followerReadings = [];
async function runSource(source) {
  const name = `${source.celebritySlug}-${source.platform}`;
  try {
    const { request, unread, followers } = await collectSource(browser, source);
    if (followers) followerReadings.push({ celebritySlug: source.celebritySlug, platform: source.platform, accountUrl: source.accountUrl, text: followers });
    writeFileSync(join(out, `${name}.request.json`), JSON.stringify({ request, unread }, null, 2));
    const result = await sendCollectedSource(fetch, process.env.SNS_INGEST_ENDPOINT, process.env.SNS_INGEST_SECRET, request,
      partial => writeFileSync(join(out, `${name}.result.json`), JSON.stringify(partial, null, 2)));
    writeFileSync(join(out, `${name}.result.json`), JSON.stringify(result, null, 2));
    // The same collected request also goes to a second target (production) when configured; collect once, send twice.
    let second = null;
    if (process.env.SNS_INGEST_ENDPOINT_2) {
      try {
        const r2 = await sendCollectedSource(fetch, process.env.SNS_INGEST_ENDPOINT_2, process.env.SNS_INGEST_SECRET_2, request,
          partial => writeFileSync(join(out, `${name}.t2.result.json`), JSON.stringify(partial, null, 2)));
        writeFileSync(join(out, `${name}.t2.result.json`), JSON.stringify(r2, null, 2));
        second = { sent: request.posts.length - r2.unsubmitted, failed: r2.items.filter(item => item.reason === "IMAGE_FAILED" || item.status === "failed").length };
      } catch (error) { second = { error: String(error?.message ?? error) }; }
    }
    const statuses = {};
    for (const item of result.items) statuses[item.status] = (statuses[item.status] ?? 0) + 1;
    summary.push({ source: name, collectorError: request.collectorError ?? null, sent: request.posts.length - result.unsubmitted, deferred: result.unsubmitted, unread: unread.length, failed: result.items.filter(item => item.reason === "IMAGE_FAILED" || item.status === "failed").length,
      statuses, ...(second ? { second } : {}) });
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
// Weekly follower counts: run.py sets a target's stamp path only when its last success is 7+ days old.
// Unread profiles are left out (not 0); a failed send leaves the stamp so the next run retries.
for (const suffix of ["", "_2"]) {
  const stamp = process.env[`SNS_FOLLOWERS_STAMP${suffix}`];
  if (!stamp || !followerReadings.length) continue;
  try {
    const result = await sendIngest(fetch, followersEndpoint(process.env[`SNS_INGEST_ENDPOINT${suffix}`]), process.env[`SNS_INGEST_SECRET${suffix}`], { items: followerReadings });
    writeFileSync(join(out, `followers${suffix}.result.json`), JSON.stringify(result, null, 2));
    writeFileSync(stamp, "");
  } catch (error) {
    writeFileSync(join(out, `followers${suffix}.result.json`), JSON.stringify({ error: String(error?.message ?? error) }, null, 2));
  }
}
writeFileSync(join(out, "followers.request.json"), JSON.stringify(followerReadings, null, 2));
console.log(JSON.stringify(summary));
if (summary.some(s => s.error || s.collectorError || s.unread || s.failed || s.second?.error || s.second?.failed)) process.exitCode = 1;
