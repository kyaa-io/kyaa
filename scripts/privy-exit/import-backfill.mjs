// PRIVY-EXIT-0005: import the backfill.mjs output so Cognito sign-in can find existing members by Google/Apple subject.
// Default is a dry run: validates the artifact and prints the batches, no network or database call.
// --apply sends the batches to the service-only RPCs through PostgREST (POSTGREST_URL + POSTGREST_SERVICE_TOKEN).
// Re-running with the same --run-id is idempotent (rows are inserted with on-conflict-do-nothing).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function planImport(artifact, batchSize = 1000) {
  const { artifactSha256, expectedOwnerCount, expectedPrivyUserCount, owners, unownedUsers } = artifact ?? {};
  if (!/^[a-f0-9]{64}$/.test(artifactSha256 ?? "") || !Array.isArray(owners) || !Array.isArray(unownedUsers)
    || owners.length !== expectedOwnerCount || !Number.isInteger(expectedPrivyUserCount)) throw new Error("Not a backfill.mjs output");
  const subjects = new Map();
  for (const owner of owners) {
    if (!UUID.test(owner.appUserId) || typeof owner.privyUserId !== "string" || !Array.isArray(owner.accounts)) throw new Error("Invalid owner record");
    for (const account of owner.accounts) {
      const key = `${account.issuer}:${account.subject}`;
      if (subjects.has(key) && subjects.get(key) !== owner.appUserId) throw new Error("Provider subject belongs to two owners");
      subjects.set(key, owner.appUserId);
    }
  }
  const chunk = (items) => Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) => items.slice(index * batchSize, (index + 1) * batchSize));
  return {
    // The first owner batch creates the run row, so an empty owner list still sends one empty batch.
    ownerBatches: owners.length ? chunk(owners) : [[]], unownedBatches: unownedUsers.length ? chunk(unownedUsers) : [[]],
    summary: { owners: owners.length, ownersWithSubjects: owners.filter((owner) => owner.accounts.length > 0).length, subjects: subjects.size,
      unownedPrivyUsers: unownedUsers.length, expectedPrivyUserCount, artifactSha256 },
  };
}

export async function applyImport(artifact, { runId, url, token, fetcher = fetch, complete = false }) {
  if (!UUID.test(runId)) throw new Error("A run UUID is required");
  if (!url || !token) throw new Error("POSTGREST_URL and POSTGREST_SERVICE_TOKEN are required for --apply");
  const plan = planImport(artifact);
  const rpc = async (name, body) => {
    const response = await fetcher(new URL(`/rpc/${name}`, url), { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`${name} failed: HTTP ${response.status} ${(await response.text()).slice(0, 200)}`);
  };
  for (const batch of plan.ownerBatches) await rpc("import_cognito_legacy_inventory", { p_run_id: runId, p_artifact_sha256: artifact.artifactSha256, p_expected_owner_count: artifact.expectedOwnerCount, p_owners: batch });
  for (const batch of plan.unownedBatches) await rpc("import_cognito_unowned_inventory", { p_run_id: runId, p_expected_privy_user_count: artifact.expectedPrivyUserCount, p_users: batch });
  if (complete) await rpc("complete_cognito_legacy_inventory", { p_run_id: runId });
  return plan.summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), file = args.find((value) => !value.startsWith("--"));
  if (!file) throw new Error("Usage: node import-backfill.mjs BACKFILL.json [--apply --run-id UUID [--complete]]");
  const artifact = JSON.parse(readFileSync(file, "utf8"));
  if (!args.includes("--apply")) {
    const plan = planImport(artifact);
    console.log(JSON.stringify({ dryRun: true, ...plan.summary, ownerBatches: plan.ownerBatches.length, unownedBatches: plan.unownedBatches.length, suggestedRunId: randomUUID() }, null, 2));
  } else {
    const runId = args[args.indexOf("--run-id") + 1];
    console.log(JSON.stringify(await applyImport(artifact, { runId, url: process.env.POSTGREST_URL, token: process.env.POSTGREST_SERVICE_TOKEN, complete: args.includes("--complete") }), null, 2));
  }
}
