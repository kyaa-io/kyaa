import test from "node:test";
import assert from "node:assert/strict";
import { exportPrivyUsers } from "./export-privy-users.mjs";
import { planImport, applyImport } from "./import-backfill.mjs";
import { normalizeLegacyInventory, normalizeUnownedInventory } from "../../apps/web/server/auth/cognito/backfill.mjs";

const google = (subject) => ({ type: "google_oauth", subject, email: `${subject}@example.test`, verified_at: 1 });
test("export pages through every Privy user and refuses repeats", async () => {
  const pages = [{ data: [{ id: "did:privy:a", linked_accounts: [google("a")] }], next_cursor: "c1" }, { data: [{ id: "did:privy:b", linked_accounts: [] }], next_cursor: null }];
  const calls = [];
  const users = await exportPrivyUsers({ appId: "app", appSecret: "secret", fetcher: async (url, init) => { calls.push([String(url), init.headers]); return Response.json(pages.shift()); } });
  assert.deepEqual(users.map((user) => user.id), ["did:privy:a", "did:privy:b"]);
  assert.match(calls[1][0], /cursor=c1/);
  assert.equal(calls[0][1]["privy-app-id"], "app");
  await assert.rejects(exportPrivyUsers({ appId: "app", appSecret: "secret", fetcher: async () => Response.json({ data: [{ id: "did:privy:a", linked_accounts: [] }, { id: "did:privy:a", linked_accounts: [] }] }) }), /repeated/);
  await assert.rejects(exportPrivyUsers({ appId: "app", appSecret: "secret", fetcher: async () => new Response("", { status: 401 }) }), /HTTP 401/);
});

test("dry run plan from a backfill output, including members who joined after Privy", () => {
  const users = [{ id: "did:privy:a", linked_accounts: [google("ga")] }, { id: "did:privy:orphan", linked_accounts: [google("go")] }];
  const owners = [{ id: "11111111-1111-4111-8111-111111111111", privy_user_id: "did:privy:a", status: "active" }, { id: "22222222-2222-4222-8222-222222222222", privy_user_id: "kyaa:7c9e6679-7425-40de-944b-e07fc1f90ae7", status: "active" }];
  const artifact = { artifactSha256: "a".repeat(64), expectedPrivyUserCount: users.length, expectedOwnerCount: 2, owners: normalizeLegacyInventory(users, owners), unownedUsers: normalizeUnownedInventory(users, owners) };
  const plan = planImport(artifact, 1);
  assert.deepEqual(plan.summary, { owners: 2, ownersWithSubjects: 1, subjects: 1, unownedPrivyUsers: 1, expectedPrivyUserCount: 2, artifactSha256: "a".repeat(64) });
  assert.equal(plan.ownerBatches.length, 2);
  assert.throws(() => planImport({ ...artifact, owners: [...artifact.owners, { ...artifact.owners[1], appUserId: "33333333-3333-4333-8333-333333333333", accounts: artifact.owners[0].accounts }], expectedOwnerCount: 3 }), /two owners/);
});

test("apply sends owner batches, unowned batches and optional completion with one run id", async () => {
  const artifact = { artifactSha256: "b".repeat(64), expectedPrivyUserCount: 0, expectedOwnerCount: 0, owners: [], unownedUsers: [] };
  const calls = [];
  await applyImport(artifact, { runId: "44444444-4444-4444-8444-444444444444", url: "http://127.0.0.1:33001", token: "t".repeat(40), complete: true,
    fetcher: async (url, init) => { calls.push([new URL(url).pathname, JSON.parse(init.body).p_run_id]); return new Response(null, { status: 204 }); } });
  assert.deepEqual(calls.map(([path]) => path), ["/rpc/import_cognito_legacy_inventory", "/rpc/import_cognito_unowned_inventory", "/rpc/complete_cognito_legacy_inventory"]);
  assert.ok(calls.every(([, run]) => run === "44444444-4444-4444-8444-444444444444"));
  await assert.rejects(applyImport(artifact, { runId: "bad", url: "x", token: "y" }), /run UUID/);
});

