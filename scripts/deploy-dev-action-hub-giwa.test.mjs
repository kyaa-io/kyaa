import assert from "node:assert/strict";
import test from "node:test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { keccak256 } from "viem";
import {
  DEFAULT_RESULT_PATH,
  DEFAULT_RPC_URL,
  DEV_ENVIRONMENT_ID,
  DEV_ENVIRONMENT_LABEL,
  DEV_RELAYER,
  KEY_ENV_NAME,
  ROLE_HOLDER,
  assertChain,
  isLoopback,
  run,
  validateRpc,
  waitForVisible,
} from "./deploy-dev-action-hub-giwa.mjs";

test("only chain 91342 passes", () => {
  assertChain(91342);
  for (const id of [1, 31337, 91341, 0]) assert.throws(() => assertChain(id), /REJECTED/);
});

test("loopback detection", () => {
  assert.equal(isLoopback("http://127.0.0.1:8545"), true);
  assert.equal(isLoopback("http://localhost:8545"), true);
  assert.equal(isLoopback("https://sepolia-rpc.giwa.io"), false);
  assert.equal(isLoopback("not a url"), false);
});

test("rpc validation", () => {
  validateRpc(DEFAULT_RPC_URL, false);
  validateRpc("http://127.0.0.1:8545", true);
  assert.throws(() => validateRpc("http://127.0.0.1:8545", false), /--local-test/);
  assert.throws(() => validateRpc(DEFAULT_RPC_URL, true), /loopback/);
  assert.throws(() => validateRpc("http://example.com", false), /https/);
});

test("pinned constants", () => {
  assert.equal(DEV_ENVIRONMENT_ID, keccak256(new TextEncoder().encode(DEV_ENVIRONMENT_LABEL)));
  assert.equal(KEY_ENV_NAME, "DEV_RELAYER_PRIVATE_KEY");
  assert.notEqual(DEV_RELAYER.toLowerCase(), ROLE_HOLDER.toLowerCase());
  assert.match(DEFAULT_RESULT_PATH, /91342/);
});

test("waitForVisible waits a bounded number of times for lagging code", async () => {
  const plan = { addresses: { timelock: "0x0000000000000000000000000000000000000001" } };
  let calls = 0;
  const client = {
    getBytecode: async () => (++calls < 3 ? "0x" : "0x6080"),
    readContract: async () => 172800n,
  };
  const slept = [];
  const attempt = await waitForVisible(client, plan, 1, { attempts: 5, delayMs: 1, sleep: async (ms) => slept.push(ms) });
  assert.equal(attempt, 3);
  assert.equal(slept.length, 2);
  const never = { getBytecode: async () => "0x", readContract: async () => 0n };
  await assert.rejects(() => waitForVisible(never, plan, 1, { attempts: 3, delayMs: 1, sleep: async () => {} }), /still not visible/);
});

const ANVIL = (() => {
  const found = spawnSync(process.platform === "win32" ? "where" : "which", ["anvil"], { encoding: "utf8" });
  return found.status === 0 ? found.stdout.split("\n")[0].trim() : null;
})();
const ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // public anvil test key
const OUT_ROOT = resolve(import.meta.dirname, "..");

test("stop after step 1, then --resume completes with all read-backs OK", { skip: !ANVIL }, async () => {
  const port = 18570 + Math.floor(Math.random() * 20);
  const node = spawn(ANVIL, ["--chain-id", "91342", "--port", String(port), "--silent"], { stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const dir = await mkdtemp(join(tmpdir(), "hub-resume-"));
    await mkdir(join(dir, "contracts", "deployments"), { recursive: true });
    await cp(join(OUT_ROOT, "contracts", "out"), join(dir, "contracts", "out"), { recursive: true });
    const base = { execute: true, localTest: true, rpc: `http://127.0.0.1:${port}`, result: "contracts/deployments/r.json" };
    const env = { DEV_RELAYER_PRIVATE_KEY: ANVIL_KEY };
    const lines = [];
    const log = (m) => lines.push(m);
    await assert.rejects(() => run(base, { cwd: dir, log, env, sleep: async () => {}, stopAfterSteps: 1 }), /test stop/);
    const partial = JSON.parse(await readFile(join(dir, "contracts/deployments/r.json.partial"), "utf8"));
    assert.equal(partial.steps.length, 1);
    assert.equal(partial.steps[0].status, "confirmed");
    // default behavior without --resume still stops
    await assert.rejects(() => run(base, { cwd: dir, log, env }), /partial file exists/);
    // dry-run resume (local anvil deployer is the test key, so pass it)
    const dry = await run({ ...base, execute: false, resume: true }, { cwd: dir, log, env, sleep: async () => {} });
    assert.equal(dry.dryRun, true);
    // real resume
    const done = await run({ ...base, resume: true }, { cwd: dir, log, env, sleep: async () => {} });
    assert.equal(done.dryRun, false);
    assert.equal(done.result.transactions.length, 5);
    assert.equal(done.result.transactions[0].txHash, partial.steps[0].txHash); // timelock not redeployed
    assert.ok(Object.values(done.result.readback).every(Boolean));
    assert.equal(existsSync(join(dir, "contracts/deployments/r.json.partial")), false);
    assert.equal(lines.join("\n").includes(ANVIL_KEY), false);
    // resume with no partial -> stop
    await assert.rejects(() => run({ ...base, resume: true }, { cwd: dir, log, env }), /result file exists/);
  } finally {
    node.kill();
  }
});

test("--resume with all 5 steps confirmed only verifies: no transaction, no key, result written, partial removed", { skip: !ANVIL }, async () => {
  const port = 18600 + Math.floor(Math.random() * 20);
  const node = spawn(ANVIL, ["--chain-id", "91342", "--port", String(port), "--silent"], { stdio: "ignore" });
  const rpcCall = async (method) => (await (await fetch(`http://127.0.0.1:${port}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "eth_getTransactionCount" ? ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", "latest"] : [] }) })).json()).result;
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const dir = await mkdtemp(join(tmpdir(), "hub-finalize-"));
    await mkdir(join(dir, "contracts", "deployments"), { recursive: true });
    await cp(join(OUT_ROOT, "contracts", "out"), join(dir, "contracts", "out"), { recursive: true });
    const base = { execute: true, localTest: true, rpc: `http://127.0.0.1:${port}`, result: "contracts/deployments/f.json" };
    const log = () => {};
    const first = await run(base, { cwd: dir, log, env: { DEV_RELAYER_PRIVATE_KEY: ANVIL_KEY }, sleep: async () => {} });
    // simulate: all steps confirmed in the journal, but the result file was never written
    const resultPath = join(dir, "contracts/deployments/f.json");
    await writeFile(`${resultPath}.partial`, JSON.stringify({ chainId: 91342, deployer: first.result.deployer, startNonce: "0", steps: first.result.transactions }));
    const { rm } = await import("node:fs/promises");
    await rm(resultPath);
    const nonceBefore = await rpcCall("eth_getTransactionCount");
    const blockBefore = await rpcCall("eth_blockNumber");
    // dry-run: writes nothing
    const dry = await run({ ...base, execute: false, resume: true }, { cwd: dir, log, env: {}, sleep: async () => {} });
    assert.equal(dry.finalizeOnly, true);
    assert.equal(existsSync(resultPath), false);
    // execute without any key
    const done = await run({ ...base, resume: true }, { cwd: dir, log, env: {}, sleep: async () => {} });
    assert.equal(done.dryRun, false);
    assert.ok(Object.values(done.result.readback).every(Boolean));
    assert.ok(Object.keys(done.result.readback).includes("timelockProposerIsRelayer"));
    assert.equal(await rpcCall("eth_getTransactionCount"), nonceBefore);
    assert.equal(await rpcCall("eth_blockNumber"), blockBefore);
    assert.equal(existsSync(resultPath), true);
    assert.equal(existsSync(`${resultPath}.partial`), false);
    assert.equal(done.result.transactions.length, 5);
  } finally {
    node.kill();
  }
});
