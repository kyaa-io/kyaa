// PRIVY-EXIT-0005: export every Privy user (GET /v1/users, 100 per page) for backfill.mjs.
// Operator tool. Reads PRIVY_APP_ID and PRIVY_APP_SECRET from the environment, writes OUTPUT with mode 0600 and
// refuses to overwrite. The file contains personal identifiers: keep it outside Git and delete it after the import.
// Docs: https://docs.privy.io/api-reference/users/get-all
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function exportPrivyUsers({ appId, appSecret, fetcher = fetch, pageLimit = 1000, baseUrl = "https://auth.privy.io" }) {
  if (!appId || !appSecret) throw new Error("PRIVY_APP_ID and PRIVY_APP_SECRET are required");
  const headers = { authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`, "privy-app-id": appId };
  const users = [], seen = new Set();
  let cursor;
  for (let page = 0; page < pageLimit; page += 1) {
    const url = new URL("/api/v1/users", baseUrl);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Privy export failed at page ${page + 1}: HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error("Unexpected Privy users response");
    for (const user of body.data) {
      if (typeof user?.id !== "string" || !user.id.startsWith("did:privy:") || !Array.isArray(user.linked_accounts)) throw new Error("Unexpected Privy user record");
      if (seen.has(user.id)) throw new Error("Privy export repeated a user; restart the export");
      seen.add(user.id);
      users.push({ id: user.id, linked_accounts: user.linked_accounts });
    }
    cursor = body.next_cursor ?? undefined;
    if (!cursor) return users;
  }
  throw new Error("Privy export exceeded the page limit");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output] = process.argv.slice(2);
  if (!output) throw new Error("Usage: node export-privy-users.mjs OUTPUT.json");
  const users = await exportPrivyUsers({ appId: process.env.PRIVY_APP_ID, appSecret: process.env.PRIVY_APP_SECRET });
  writeFileSync(output, JSON.stringify({ exportedAt: new Date().toISOString(), users }), { flag: "wx", mode: 0o600 });
  console.log(`Exported ${users.length} Privy users. No database changes performed.`);
}
