import { expect, test } from "@playwright/test";
import { guardWrites } from "./guard";

// Negative control for the read-only guard. It never touches a real site: the origin is a reserved `.invalid` name that cannot resolve,
// and the page itself is served by the test. A POST that got past the guard would fail with ERR_NAME_NOT_RESOLVED; a POST stopped by the
// guard fails with ERR_BLOCKED_BY_CLIENT, which only the route abort produces — so zero network reach is shown by the error name.
const ORIGIN = "http://smoke-guard.invalid";

test("@smoke the read-only guard aborts writes before the network", async ({ page, context }) => {
  const guard = await guardWrites(context, ORIGIN);
  await context.route(`${ORIGIN}/`, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>guard</title>" }));
  const failures: string[] = [];
  page.on("requestfailed", (request) => failures.push(`${request.method()} ${new URL(request.url()).host}${new URL(request.url()).pathname} ${request.failure()?.errorText}`));
  await page.goto(`${ORIGIN}/`);

  const outcomes = await page.evaluate(async () => {
    const send = async (url: string, method: string) => { try { await fetch(url, { method, mode: "no-cors" }); return "sent"; } catch { return "aborted"; } };
    return [
      await send("/api/me/dukjil/cheer", "POST"),
      await send("/api/me/wallet/exchange", "POST"),
      await send("/api/events", "POST"),
      await send("https://auth.privy.io/cdn-cgi/challenge-platform/x", "POST"),
      await send("https://auth.privy.io.evil.invalid/api/v1/sessions", "POST"),
    ];
  });

  // The two business writes, the lookalike host and the non-listed Privy path are aborted; the analytics beacon is the one let through (it then fails on the unresolvable name).
  expect(outcomes.slice(0, 2)).toEqual(["aborted", "aborted"]);
  expect(guard.blocked).toEqual([`POST ${ORIGIN}/api/me/dukjil/cheer`, `POST ${ORIGIN}/api/me/wallet/exchange`]);
  expect(guard.externalAborted).toEqual(["POST auth.privy.io/cdn-cgi/challenge-platform/x", "POST auth.privy.io.evil.invalid/api/v1/sessions"]);
  const reachedDns = failures.filter((entry) => !entry.includes("net::ERR_BLOCKED_BY_CLIENT"));
  expect(reachedDns, "only the allowed analytics beacon may get past the guard").toEqual([`POST smoke-guard.invalid/api/events net::ERR_NAME_NOT_RESOLVED`]);
});
