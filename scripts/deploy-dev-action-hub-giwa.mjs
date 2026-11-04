#!/usr/bin/env node
// Dev-only ActionHub + context registry deployment for GIWA Sepolia (chain 91342).
// Default is a dry-run (read-only). Sending needs --execute. The private key is read only from the
// DEV_RELAYER_PRIVATE_KEY environment variable and is never printed or written.
// Reuses constants/helpers from deploy-action-hub-giwa.mjs (production plan tool) and the compiled
// contracts in contracts/out (run `forge build` inside contracts/ first).

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  formatEther,
  getAddress,
  getContractAddress,
  http,
  keccak256,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  GIWA_CHAIN_ID,
  PINNED_TARGETS,
  TIMELOCK_DELAY_SECONDS,
  ZERO_ADDRESS,
  computeSchemaUID,
  hubRoleStorageSlot,
} from "./deploy-action-hub-giwa.mjs";

export const DEV_ENVIRONMENT_LABEL = "byus:dev:giwa-sepolia:action-ledger:v1";
export const DEV_ENVIRONMENT_ID = keccak256(new TextEncoder().encode(DEV_ENVIRONMENT_LABEL));
export const KEY_ENV_NAME = "DEV_RELAYER_PRIVATE_KEY";
export const DEFAULT_RPC_URL = "https://sepolia-rpc.giwa.io";
export const DEV_RELAYER = PINNED_TARGETS.deployer; // public address, see STAGING-DEV-READ
export const ROLE_HOLDER = PINNED_TARGETS.governanceAdmin; // public; migrator/corrector/pauser of the dev hub
export const DEFAULT_RESULT_PATH = "contracts/deployments/dev-hub-91342.result.json";
export const MIN_BALANCE_AFTER_WEI = 2_000_000_000_000_000n; // runbook stop threshold 0.002 ETH
const roleId = (name) => keccak256(new TextEncoder().encode(name));
const WRITER_ROLE = roleId("WRITER_ROLE");
const DEFAULT_ADMIN_ROLE = `0x${"00".repeat(32)}`;
const GAS_MARGIN_NUM = 12n;
const GAS_MARGIN_DEN = 10n;
const VISIBILITY_ATTEMPTS = 20; // bounded wait for earlier contracts to be visible on the RPC
const VISIBILITY_DELAY_MS = 3000;
const ESTIMATE_ATTEMPTS = 6;
const L1_ORACLE = "0x420000000000000000000000000000000000000F";
const ARTIFACTS = Object.freeze({
  timelock: "contracts/out/TimelockController.sol/TimelockController.json",
  registry: "contracts/out/ByUsPublicContextRegistryV3.sol/ByUsPublicContextRegistryV3.json",
  codec: "contracts/out/ByUsActionCodec.sol/ByUsActionCodec.json",
  implementation: "contracts/out/ByUsActionHub.sol/ByUsActionHub.json",
  proxy: "contracts/out/ERC1967Proxy.sol/ERC1967Proxy.json",
});

const READ_ABI = parseAbi([
  "function getMinDelay() view returns (uint256)",
  "function registrar() view returns (address)",
  "function admin() view returns (address)",
  "function environmentId() view returns (bytes32)",
  "function eas() view returns (address)",
  "function getSchema(uint16 schemaVersion) view returns (bytes32)",
  "function getAssetBinding(uint32 bindingVersion,uint8 kind) view returns (address)",
  "function hasRole(bytes32 role,address account) view returns (bool)",
]);
const SCHEMA_READ_ABI = parseAbi([
  "function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))",
]);
const ORACLE_ABI = parseAbi(["function getL1Fee(bytes data) view returns (uint256)"]);

export function isLoopback(url) {
  try {
    const host = new URL(url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function assertChain(chainId) {
  if (chainId !== GIWA_CHAIN_ID) {
    throw new Error(`REJECTED: RPC chain ID is ${chainId}; only ${GIWA_CHAIN_ID} is allowed. Nothing was sent.`);
  }
}

export function validateRpc(rpcUrl, localTest) {
  if (isLoopback(rpcUrl)) {
    if (!localTest) throw new Error("REJECTED: loopback RPC is only allowed with --local-test");
    return;
  }
  if (localTest) throw new Error("REJECTED: --local-test requires a loopback RPC URL");
  if (!rpcUrl.startsWith("https://")) throw new Error("REJECTED: rpc url must be https");
}

export function planFor({ deployer, startNonce, artifacts, edgeEas, roleHolder = ROLE_HOLDER }) {
  const at = (n) => getContractAddress({ from: deployer, nonce: BigInt(n) });
  const base = BigInt(startNonce);
  const addr = {
    timelock: at(base),
    registry: at(base + 1n),
    codec: at(base + 2n),
    implementation: at(base + 3n),
    hubProxy: at(base + 4n),
  };
  const schemaUID = computeSchemaUID();
  const init = {
    admin: addr.timelock,
    writer: deployer,
    migrator: roleHolder,
    corrector: roleHolder,
    pauser: roleHolder,
    easAddress: edgeEas,
    environmentId: DEV_ENVIRONMENT_ID,
    schemaUID,
    passport: PINNED_TARGETS.passport,
    stamp: PINNED_TARGETS.stamp,
    collectible: ZERO_ADDRESS,
    codec: addr.codec,
    contextRegistry: addr.registry,
  };
  const deploy = (id, artifact, args = []) => ({
    id,
    data: encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args }),
  });
  const steps = [
    deploy("deploy-timelock", artifacts.timelock, [BigInt(TIMELOCK_DELAY_SECONDS), [deployer], [deployer], ZERO_ADDRESS]),
    deploy("deploy-context-registry", artifacts.registry, [addr.timelock, deployer]),
    deploy("deploy-codec", artifacts.codec),
    deploy("deploy-hub-implementation", artifacts.implementation),
    deploy("deploy-hub-proxy", artifacts.proxy, [
      addr.implementation,
      encodeFunctionData({ abi: artifacts.implementation.abi, functionName: "initialize", args: [init] }),
    ]),
  ];
  return { addresses: addr, schemaUID, initialization: init, steps, startNonce: base.toString() };
}

async function loadArtifacts(root) {
  const out = {};
  for (const [name, rel] of Object.entries(ARTIFACTS)) {
    try {
      out[name] = JSON.parse(await readFile(resolve(root, rel), "utf8"));
    } catch {
      throw new Error(`artifact missing: ${rel} (run forge build in contracts/)`);
    }
  }
  return out;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function json(value) {
  return JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2);
}

// Gas estimate per step. Later steps depend on earlier contracts, so earlier runtime code is
// injected through a state override (the real chain is not touched).
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The RPC may answer from nodes that lag behind the node that returned the receipt. Before a
// dependent step, wait (bounded) until every earlier contract is visible and the timelock reads back.
export async function waitForVisible(client, plan, uptoIndex, { attempts = VISIBILITY_ATTEMPTS, delayMs = VISIBILITY_DELAY_MS, sleep = defaultSleep, log = () => {} } = {}) {
  const order = ["timelock", "registry", "codec", "implementation", "hubProxy"];
  const needed = order.slice(0, uptoIndex).map((name) => ({ name, address: plan.addresses[name] }));
  let lastMissing = "";
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const missing = [];
    for (const { name, address } of needed) {
      const code = await client.getBytecode({ address });
      if (!code || code === "0x") missing.push(name);
    }
    if (!missing.length && needed.some((n) => n.name === "timelock")) {
      try {
        const delay = await client.readContract({ address: plan.addresses.timelock, abi: READ_ABI, functionName: "getMinDelay" });
        if (delay !== BigInt(TIMELOCK_DELAY_SECONDS)) missing.push("timelock.getMinDelay");
      } catch { missing.push("timelock.getMinDelay"); }
    }
    if (!missing.length) return attempt;
    lastMissing = missing.join(",");
    log(`WAIT earlier contracts not visible yet (${lastMissing}) attempt ${attempt}/${attempts}`);
    if (attempt < attempts) await sleep(delayMs);
  }
  throw new Error(`STOP: earlier contracts still not visible on the RPC after ${attempts} checks (${lastMissing}); rerun with --resume later`);
}

async function estimateWithRetry(client, deployer, data, { attempts = ESTIMATE_ATTEMPTS, delayMs = VISIBILITY_DELAY_MS, sleep = defaultSleep, log = () => {} } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await client.estimateGas({ account: deployer, data }); } catch (error) {
      last = error;
      log(`WAIT gas estimate failed (${String(error.shortMessage ?? error.message).split("\n")[0].slice(0, 100)}) attempt ${attempt}/${attempts}`);
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw last;
}

async function estimateSteps(client, deployer, artifacts, plan, from = 0) {
  const override = [];
  const results = [];
  const runtime = (a) => a.deployedBytecode.object;
  for (let i = from; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    let gas = null;
    try {
      gas = await client.estimateGas({ account: deployer, data: step.data, stateOverride: override.length === 0 ? undefined : [...override, { address: deployer, nonce: Number(plan.startNonce) + i }] });
    } catch (error) {
      gas = null;
      step.estimateError = String(error.shortMessage ?? error.message).split("\n")[0].slice(0, 160);
    }
    let l1 = 0n;
    try {
      l1 = await client.readContract({ address: L1_ORACLE, abi: ORACLE_ABI, functionName: "getL1Fee", args: [step.data] });
    } catch { l1 = 0n; }
    results.push({ id: step.id, gas, l1FeeWei: l1 });
    if (i === 0) {
      override.push({
        address: plan.addresses.timelock,
        code: runtime(artifacts.timelock),
        stateDiff: [{ slot: `0x${"00".repeat(31)}02`, value: encodeAbiParameters([{ type: "uint256" }], [BigInt(TIMELOCK_DELAY_SECONDS)]) }],
      });
    }
    if (i === 2) override.push({ address: plan.addresses.codec, code: runtime(artifacts.codec) });
    if (i === 3) override.push({ address: plan.addresses.implementation, code: runtime(artifacts.implementation) });
  }
  return results;
}

function chainFor(chainId, rpcUrl) {
  return defineChain({
    id: chainId, name: "giwa-dev", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function parseArgs(argv) {
  const out = { execute: false, localTest: false, result: DEFAULT_RESULT_PATH, rpc: process.env.DEV_HUB_RPC_URL ?? DEFAULT_RPC_URL };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--execute") out.execute = true;
    else if (a === "--local-test") out.localTest = true;
    else if (a === "--resume") out.resume = true;
    else if (a === "--rpc-url") out.rpc = argv[++i];
    else if (a === "--result") out.result = argv[++i];
    else if (a === "--help") out.help = true;
    else throw new Error(`unexpected argument ${a}`);
  }
  return out;
}

export async function run(args, { cwd = process.cwd(), log = (m) => process.stdout.write(`${m}\n`), env = process.env, sleep = defaultSleep, stopAfterSteps = null } = {}) {
  validateRpc(args.rpc, args.localTest);
  const resultPath = resolve(cwd, args.result);
  const partialPath = `${resultPath}.partial`;
  const client = createPublicClient({ transport: http(args.rpc, { retryCount: 0, timeout: 30_000 }) });

  // 1. chain check before anything else
  const chainId = await client.getChainId();
  assertChain(chainId);
  log(`CHAIN_ID ${chainId} OK`);
  log(`MODE ${args.execute ? "EXECUTE (will send transactions)" : "DRY-RUN (read-only)"}`);

  // 2. already deployed / half-deployed -> stop
  if (await exists(resultPath)) throw new Error(`STOP: result file exists (${args.result}); already deployed, not redeploying`);
  const partialExists = await exists(partialPath);
  if (partialExists && !args.resume) throw new Error(`STOP: partial file exists (${args.result}.partial); a previous run was interrupted, inspect the chain, then rerun with --resume`);
  if (args.resume && !partialExists) throw new Error(`STOP: --resume needs ${args.result}.partial; nothing to resume`);

  // 3. key (env only)
  const rawKey = env[KEY_ENV_NAME];
  let account = null;
  if (rawKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(rawKey)) throw new Error(`${KEY_ENV_NAME} is not a valid 32-byte hex key`);
    account = privateKeyToAccount(rawKey);
  }
  let earlyJournal = null;
  if (args.resume) earlyJournal = JSON.parse(await readFile(partialPath, "utf8"));
  // when every step is already confirmed, --resume only verifies and writes the result: no key needed
  const finalizeOnly = Boolean(args.resume && earlyJournal && earlyJournal.steps.length === 5 && earlyJournal.steps.every((x) => x.status === "confirmed"));
  if (args.execute && !account && !finalizeOnly) throw new Error(`${KEY_ENV_NAME} is required with --execute`);
  const deployer = account ? account.address : getAddress(earlyJournal?.deployer ?? DEV_RELAYER);
  if (!args.localTest && deployer.toLowerCase() !== DEV_RELAYER) {
    throw new Error("REJECTED: key address is not the approved dev relayer");
  }
  log(`DEPLOYER ${deployer}`);

  // 4. targets
  const eas = getAddress(PINNED_TARGETS.eas);
  const schemaUID = computeSchemaUID();
  const unlessLocal = async (label, fn) => (args.localTest ? log(`SKIP ${label} (--local-test)`) : fn());
  await unlessLocal("target check", async () => {
    for (const [name, address] of Object.entries({ eas: PINNED_TARGETS.eas, schemaRegistry: PINNED_TARGETS.schemaRegistry, passport: PINNED_TARGETS.passport, stamp: PINNED_TARGETS.stamp })) {
      const code = await client.getBytecode({ address });
      if (!code || code === "0x") throw new Error(`STOP: ${name} has no code at ${address}`);
    }
    const record = await client.readContract({ address: PINNED_TARGETS.schemaRegistry, abi: SCHEMA_READ_ABI, functionName: "getSchema", args: [schemaUID] });
    if (record.uid.toLowerCase() !== schemaUID) throw new Error(`STOP: schema ${schemaUID} is not registered on this chain`);
    log("TARGETS eas/schema-registry/passport/stamp present, schema registered");
  });

  const artifacts = await loadArtifacts(cwd);
  const [latest, pending, balance, gasPrice] = await Promise.all([
    client.getTransactionCount({ address: deployer, blockTag: "latest" }),
    client.getTransactionCount({ address: deployer, blockTag: "pending" }),
    client.getBalance({ address: deployer }),
    client.getGasPrice(),
  ]);
  if (latest !== pending) throw new Error("STOP: pending transactions exist for the deployer");
  let startNonce = latest;
  let journal = { chainId, deployer, startNonce: null, steps: [] };
  let doneCount = 0;
  const priorReceipts = {};
  if (args.resume) {
    journal = earlyJournal;
    if (journal.chainId !== chainId) throw new Error(`STOP: partial file is for chain ${journal.chainId}, not ${chainId}`);
    if (getAddress(journal.deployer) !== deployer) throw new Error("STOP: partial file deployer differs from the current deployer");
    startNonce = BigInt(journal.startNonce);
    doneCount = journal.steps.length;
    if (journal.steps.some((s) => s.status !== "confirmed")) throw new Error("STOP: partial file has a step that is not confirmed; inspect that transaction by hand");
    if (doneCount === 0 || doneCount > 5) throw new Error("STOP: partial file has no usable completed step");
    if (BigInt(latest) !== startNonce + BigInt(doneCount)) throw new Error(`STOP: deployer nonce ${latest} does not match start ${startNonce} + ${doneCount} confirmed steps`);
  }
  const plan = planFor({ deployer, startNonce, artifacts, edgeEas: eas });
  const stepNames = ["timelock", "registry", "codec", "implementation", "hubProxy"];
  if (args.resume) {
    for (let j = 0; j < doneCount; j += 1) {
      const done = journal.steps[j];
      if (done.id !== plan.steps[j].id) throw new Error(`STOP: partial step ${j} is ${done.id}, expected ${plan.steps[j].id}`);
      const code = await client.getBytecode({ address: plan.addresses[stepNames[j]] });
      if (!code || code === "0x") throw new Error(`STOP: ${done.id} has no code at ${plan.addresses[stepNames[j]]}`);
      const receipt = await client.getTransactionReceipt({ hash: done.txHash });
      if (receipt.status !== "success" || receipt.contractAddress?.toLowerCase() !== plan.addresses[stepNames[j]].toLowerCase()) throw new Error(`STOP: ${done.id} receipt does not match the predicted address`);
      priorReceipts[stepNames[j]] = receipt;
      log(`RESUME verified ${done.id} tx=${done.txHash} address=${plan.addresses[stepNames[j]]}`);
    }
    if (doneCount < 5) log(`RESUME continue from step ${doneCount + 1}/5: ${plan.steps.slice(doneCount).map((s) => s.id).join(", ")}`);
  }
  log(`START_NONCE ${startNonce}`);
  for (const [name, address] of Object.entries(plan.addresses)) log(`PLANNED ${name} ${address}`);
  log(`SCHEMA_UID ${schemaUID}`);
  log(`ENVIRONMENT_ID ${DEV_ENVIRONMENT_ID} (${DEV_ENVIRONMENT_LABEL})`);

  const receipts = { ...priorReceipts };
  if (finalizeOnly) {
    log("FINALIZE_ONLY all 5 steps are confirmed on chain; no transaction will be sent");
    if (!args.execute) {
      log("DRY_RUN_DONE nothing was written. Re-run with --execute --resume to write the result file.");
      return { dryRun: true, plan, finalizeOnly: true };
    }
  }
  if (!finalizeOnly) {
  // 5. estimated gas first
  const estimates = await estimateSteps(client, deployer, artifacts, plan, doneCount);
  let totalGas = 0n;
  let totalL1 = 0n;
  for (const e of estimates) {
    const step = plan.steps.find((s) => s.id === e.id);
    log(`ESTIMATE ${e.id} gas=${e.gas ?? "unavailable"} l1_fee_wei=${e.l1FeeWei}${step.estimateError ? ` (${step.estimateError})` : ""}`);
    totalGas += e.gas ?? 0n;
    totalL1 += e.l1FeeWei;
  }
  const missing = estimates.some((e) => e.gas == null);
  const feeWei = totalGas * gasPrice + totalL1;
  const budget = (feeWei * GAS_MARGIN_NUM) / GAS_MARGIN_DEN;
  log(`ESTIMATE_TOTAL gas=${totalGas} gas_price_wei=${gasPrice} fee_wei=${feeWei} (${formatEther(feeWei)} ETH) with_margin_wei=${budget}`);
  log(`BALANCE ${balance} wei (${formatEther(balance)} ETH)`);
  if (missing) log("WARN some steps had no estimate; total is a lower bound");
  if (balance < budget + (args.localTest ? 0n : MIN_BALANCE_AFTER_WEI) ) {
    log(`SHORTFALL balance is below estimate + reserve; need at least ${budget + (args.localTest ? 0n : MIN_BALANCE_AFTER_WEI)} wei`);
    if (args.execute) throw new Error("STOP: balance too low for the deployment");
  } else {
    log("BALANCE_OK covers estimate plus reserve");
  }
  if (!args.execute) {
    log(`DRY_RUN_DONE nothing was sent. Re-run with --execute${args.resume ? " --resume" : ""} to send.`);
    return { dryRun: true, plan, estimates, feeWei, balance };
  }
  // 6. send
  const wallet = createWalletClient({ account, chain: chainFor(chainId, args.rpc), transport: http(args.rpc, { retryCount: 0, timeout: 60_000 }) });
  journal.startNonce = plan.startNonce;
  await mkdir(dirname(resultPath), { recursive: true });
  if (!args.resume) await writeFile(partialPath, `${json(journal)}\n`, { mode: 0o644 });
  const order = stepNames;
  for (let i = doneCount; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    if (stopAfterSteps != null && journal.steps.length >= stopAfterSteps) throw new Error(`STOP: test stop after ${stopAfterSteps} steps`);
    // real state now holds the earlier contracts: wait until the RPC shows them, then estimate without any override
    if (i > 0) await waitForVisible(client, plan, i, { sleep, log });
    const real = await estimateWithRetry(client, deployer, step.data, { sleep, log });
    const gas = (real * GAS_MARGIN_NUM) / GAS_MARGIN_DEN;
    const stepBalance = await client.getBalance({ address: deployer });
    if (stepBalance < gas * gasPrice * 2n) throw new Error(`STOP: balance too low before ${step.id}`);
    const hash = await wallet.sendTransaction({ data: step.data, gas, nonce: Number(plan.startNonce) + i, value: 0n });
    journal.steps.push({ id: step.id, txHash: hash, status: "sent" });
    await writeFile(partialPath, `${json(journal)}\n`);
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120_000 });
    if (receipt.status !== "success") throw new Error(`STOP: ${step.id} reverted (tx ${hash}); see ${args.result}.partial`);
    const expected = plan.addresses[order[i]];
    if (receipt.contractAddress?.toLowerCase() !== expected.toLowerCase()) throw new Error(`STOP: ${step.id} address mismatch`);
    journal.steps[i] = { id: step.id, txHash: hash, status: "confirmed", block: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString() };
    receipts[order[i]] = receipt;
    await writeFile(partialPath, `${json(journal)}\n`);
    log(`SENT ${step.id} tx=${hash} block=${receipt.blockNumber} gasUsed=${receipt.gasUsed}`);
  }
  }

  // 7. read-back verification
  const hub = plan.addresses.hubProxy;
  await waitForVisible(client, plan, 5, { sleep, log });
  const slotHeld = (role, who) => client.getStorageAt({ address: hub, slot: hubRoleStorageSlot(role, who) }).then((v) => v !== undefined && BigInt(v) !== 0n);
  const readAll = () => Promise.all([
    slotHeld(WRITER_ROLE, deployer),
    slotHeld(DEFAULT_ADMIN_ROLE, deployer),
    client.readContract({ address: plan.addresses.registry, abi: READ_ABI, functionName: "registrar" }),
    client.readContract({ address: plan.addresses.registry, abi: READ_ABI, functionName: "admin" }),
    client.readContract({ address: plan.addresses.timelock, abi: READ_ABI, functionName: "getMinDelay" }),
    client.readContract({ address: hub, abi: READ_ABI, functionName: "environmentId" }),
    client.readContract({ address: hub, abi: READ_ABI, functionName: "eas" }),
    client.readContract({ address: hub, abi: READ_ABI, functionName: "getSchema", args: [1] }),
    client.readContract({ address: hub, abi: READ_ABI, functionName: "getAssetBinding", args: [1, 0] }),
    client.readContract({ address: hub, abi: READ_ABI, functionName: "getAssetBinding", args: [1, 1] }),
    slotHeld(DEFAULT_ADMIN_ROLE, plan.addresses.timelock),
    slotHeld(roleId("UPGRADER_ROLE"), plan.addresses.timelock),
    slotHeld(roleId("MIGRATOR_ROLE"), ROLE_HOLDER),
    slotHeld(roleId("CORRECTOR_ROLE"), ROLE_HOLDER),
    slotHeld(roleId("PAUSER_ROLE"), ROLE_HOLDER),
    client.readContract({ address: plan.addresses.timelock, abi: READ_ABI, functionName: "hasRole", args: [roleId("PROPOSER_ROLE"), deployer] }),
    client.readContract({ address: plan.addresses.timelock, abi: READ_ABI, functionName: "hasRole", args: [roleId("EXECUTOR_ROLE"), deployer] }),
  ]);
  let values;
  for (let attempt = 1; ; attempt += 1) {
    try { values = await readAll(); break; } catch (error) {
      if (attempt >= ESTIMATE_ATTEMPTS) throw error;
      log(`WAIT read-back failed (${String(error.shortMessage ?? error.message).split("\n")[0].slice(0, 100)}) attempt ${attempt}/${ESTIMATE_ATTEMPTS}`);
      await sleep(VISIBILITY_DELAY_MS);
    }
  }
  const [writerGranted, deployerIsAdmin, registrar, registryAdmin, minDelay, envId, hubEas, hubSchema, passport, stamp, timelockIsHubAdmin, timelockIsUpgrader, migrator, corrector, pauser, proposer, executor] = values;
  const checks = {
    writerRoleGrantedToRelayer: writerGranted,
    relayerIsNotHubAdmin: deployerIsAdmin === false,
    registrarIsRelayer: registrar.toLowerCase() === deployer.toLowerCase(),
    registryAdminIsTimelock: registryAdmin.toLowerCase() === plan.addresses.timelock.toLowerCase(),
    timelockDelayIs2Days: minDelay === BigInt(TIMELOCK_DELAY_SECONDS),
    environmentIdMatches: envId.toLowerCase() === DEV_ENVIRONMENT_ID,
    easMatches: hubEas.toLowerCase() === eas.toLowerCase(),
    schemaMatches: hubSchema.toLowerCase() === schemaUID,
    passportMatches: passport.toLowerCase() === PINNED_TARGETS.passport,
    stampMatches: stamp.toLowerCase() === PINNED_TARGETS.stamp,
    hubAdminIsTimelock: timelockIsHubAdmin,
    upgraderIsTimelock: timelockIsUpgrader,
    migratorIsRoleHolder: migrator,
    correctorIsRoleHolder: corrector,
    pauserIsRoleHolder: pauser,
    timelockProposerIsRelayer: proposer,
    timelockExecutorIsRelayer: executor,
  };
  for (const [k, v] of Object.entries(checks)) log(`READBACK ${k} ${v ? "OK" : "FAIL"}`);
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length) throw new Error(`STOP: read-back failed: ${failed.join(", ")} (see ${args.result}.partial)`);

  const result = {
    format: "byus-dev-action-hub-result-v1",
    chainId,
    environmentLabel: DEV_ENVIRONMENT_LABEL,
    environmentId: DEV_ENVIRONMENT_ID,
    schemaUid: schemaUID,
    deployer,
    hubProxy: hub,
    deployBlock: receipts.hubProxy.blockNumber.toString(),
    addresses: plan.addresses,
    assets: { passport: PINNED_TARGETS.passport, stamp: PINNED_TARGETS.stamp, collectible: ZERO_ADDRESS },
    roles: { writer: deployer, migrator: ROLE_HOLDER, corrector: ROLE_HOLDER, pauser: ROLE_HOLDER, hubAdmin: plan.addresses.timelock, registryRegistrar: deployer },
    transactions: journal.steps,
    readback: checks,
    totalGasUsed: Object.values(receipts).reduce((s, r) => s + r.gasUsed, 0n).toString(),
  };
  await writeFile(resultPath, `${json(result)}\n`, { mode: 0o644 });
  const { rm } = await import("node:fs/promises");
  await rm(partialPath, { force: true });
  log(`DEPLOYED result=${args.result}`);
  log(`HUB_PROXY ${hub}`);
  log(`REGISTRY ${plan.addresses.registry}`);
  log(`DEPLOY_BLOCK ${result.deployBlock}`);
  log(`SCHEMA_UID ${schemaUID}`);
  log(`ENVIRONMENT_ID ${DEV_ENVIRONMENT_ID}`);
  return { dryRun: false, result };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`Usage: node scripts/deploy-dev-action-hub-giwa.mjs [--execute] [--resume] [--rpc-url URL] [--result PATH] [--local-test]\nKey env: ${KEY_ENV_NAME}. Default is dry-run.\n`);
    return;
  }
  await run(args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const secret = process.env[KEY_ENV_NAME];
    const text = String(error.message);
    process.stderr.write(`ERROR ${secret ? text.replaceAll(secret, "[redacted]") : text}\n`);
    process.exitCode = 1;
  });
}
