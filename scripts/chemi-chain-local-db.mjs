// Local-only PostgREST stand-in. PostgreSQL runs the real functions, Anvil mines the signed bytes.
import pg from "pg";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mnemonicToAccount } from "viem/accounts";
import { createRequire } from "node:module";
import {
  bytesToHex,
  encodePacked,
  keccak256,
  zeroAddress,
  parseEventLogs,
} from "viem";
import { runScheduledChemiChain } from "../apps/worker/dist/chemi-chain-runtime.js";

export async function measureQueue(options) {
  const host = mkdtempSync("/tmp/chemi-db-");
  const data = host + "/data";
  const run = (cmd, args) => execFileSync(cmd, args, { stdio: "pipe" });
  run("initdb", ["-D", data, "-U", "fixture", "-A", "trust"]);
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    host + "/postgres.log",
    "-o",
    `-k ${host} -c listen_addresses=''`,
    "-w",
    "start",
  ]);
  const db = new pg.Client({
    host,
    port: 5432,
    database: "postgres",
    user: "fixture",
    password: "",
  });
  try {
    await db.connect();
    await db.query(
      "create schema extensions;create extension pgcrypto with schema extensions;create role anon;create role authenticated;create role service_role;create table user_wallets(app_user_id uuid,address text,chain_id bigint)",
    );
    for (const file of [
      "20270110070000_chemi_chain_tables",
      "20270110085000_chemi_chain_allow",
      "20270111050000_chemi_chain_worker",
      "20270111050100_chemi_chain_allow_v2",
    ]) {
      await db.query(
        readFileSync("supabase/migrations/" + file + ".sql", "utf8"),
      );
    }
    for (const suite of ["chain_payload", "chain_worker"])
      await db.query(
        readFileSync("supabase/tests/chemi/" + suite + ".sql", "utf8"),
      );
    await exercise(db, options);
  } finally {
    await db.end();
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
    rmSync(host, { recursive: true, force: true });
  }
}
async function exercise(
  db,
  { url, address, recipient, wallet, client, receipt, account },
) {
  let interruptConfirmation = false;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.url, "/rest/v1/rpc/chemi_chain_work");
      let body = "";
      for await (const chunk of req) body += chunk;
      const { p_owner, p_action, p_args } = JSON.parse(body);
      if (interruptConfirmation && p_action === "confirmed") {
        interruptConfirmation = false;
        throw new Error("fixture interruption");
      }
      const result = await db.query(
        "select public.chemi_chain_work($1,$2,$3) value",
        [p_owner, p_action, p_args],
      );
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(result.rows[0].value));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ message: String(e) }));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const signer = mnemonicToAccount(
      "test test test test test test test test test test test junk",
    );
    const config = {
      CHEMI_CHAIN_SIGNER_PRIVATE_KEY: bytesToHex(signer.getHdKey().privateKey),
      CHEMI_CHAIN_SIGNER_ADDRESS: signer.address,
      CHEMI_CHAIN_CONTRACT_ADDRESS: address,
      GIWA_RPC_URL: url,
      SUPABASE_URL: "http://127.0.0.1:" + server.address().port,
      SUPABASE_SERVICE_ROLE_KEY: "fixture",
    };
    const require = createRequire(import.meta.url);
    const registryArtifact = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/SchemaRegistry.sol/SchemaRegistry.json");
    const easArtifact = require("@ethereum-attestation-service/eas-contracts/artifacts/contracts/EAS.sol/EAS.json");
    const registry = "0x4200000000000000000000000000000000000020",
      eas = "0x4200000000000000000000000000000000000021";
    await client.request({
      method: "anvil_setCode",
      params: [registry, registryArtifact.deployedBytecode],
    });
    const deployment = await receipt(
      wallet.deployContract({ ...easArtifact, account, args: [registry] }),
    );
    await client.request({
      method: "anvil_setCode",
      params: [
        eas,
        await client.getCode({ address: deployment.contractAddress }),
      ],
    });
    const schemaText = "uint32 week,uint8 game,uint8 map,bytes32 root";
    await receipt(
      wallet.writeContract({
        address: registry,
        abi: registryArtifact.abi,
        account,
        functionName: "register",
        args: [schemaText, zeroAddress, false],
      }),
    );
    config.CHEMI_EAS_SCHEMA_UID = keccak256(
      encodePacked(
        ["string", "address", "bool"],
        [schemaText, zeroAddress, false],
      ),
    );
    const rankId = randomUUID();
    await db.query(
      "insert into public.chemi_chain_records(id,record_key,kind,kst_date,payload,eligible_at,status) values($1::uuid,($1::uuid)::text,'rank_table','2026-11-16',$2,now(),'pending')",
      [
        rankId,
        { game: "all", map: "all", week: "2026-11-16", root: "f".repeat(64) },
      ],
    );
    interruptConfirmation = true;
    const run = () =>
      runScheduledChemiChain("dev", async () => JSON.stringify(config));
    await assert.rejects(run(), /DB_confirmed/);
    const rank = () =>
      db
        .query(
          "select status,tx_hash from public.chemi_chain_records where id=$1",
          [rankId],
        )
        .then((r) => r.rows[0]);
    const before = await rank();
    assert.equal(before.status, "sent");
    await run();
    const after = await rank();
    assert.equal(after.status, "minted");
    assert.equal(before.tx_hash, after.tx_hash);
    const logs = parseEventLogs({
      abi: easArtifact.abi,
      logs: (await client.getTransactionReceipt({ hash: after.tx_hash })).logs,
      eventName: "Attested",
    });
    assert.equal(logs.length, 1);
    assert.equal(logs[0].args.schemaUID, config.CHEMI_EAS_SCHEMA_UID);
    console.log("EAS attestation and interrupted receipt recovery passed");
    const splitUser = randomUUID();
    for (const receiver of [recipient, address, recipient]) {
      await db.query(
        `insert into public.chemi_chain_records(record_key,user_id,kind,kst_date,payload,eligible_at,status,wallet_address)
        values(gen_random_uuid()::text,$1,'album',current_date,'{"character":"elina","slot":1,"stage":5}',now(),'pending',$2)`,
        [splitUser, receiver.toLowerCase()],
      );
    }
    await run();
    const split = await db.query(
      "select status from public.chemi_chain_records where user_id=$1 order by status",
      [splitUser],
    );
    assert.deepEqual(
      split.rows.map((row) => row.status),
      ["minted", "minted", "retry"],
    );
    console.log("Contract recipient rejection isolated");
    for (const count of [1000, 10000]) {
      const user = randomUUID();
      await db.query(
        "insert into public.user_wallets(app_user_id,address,chain_id) values($1,$2,91342)",
        [user, recipient.toLowerCase()],
      );
      await db.query(
        'insert into public.chemi_chain_records(record_key,user_id,kind,kst_date,payload,eligible_at,status) select gen_random_uuid()::text,$1,\'album\',current_date,\'{"character":"elina","slot":1,"stage":5}\',now(),\'pending\' from generate_series(1,$2::int)',
        [user, count],
      );
      const start = performance.now();
      await runScheduledChemiChain("dev", async () => JSON.stringify(config));
      const { rows } = await db.query(
        "select count(*)::int n from public.chemi_chain_records where user_id=$1 and status='minted' and token_no is not null",
        [user],
      );
      assert.equal(rows[0].n, count);
      console.log(
        JSON.stringify({
          queued: count,
          seconds: (performance.now() - start) / 1000,
        }),
      );
    }
    const {
      rows: [burn],
    } = await db.query(
      "update public.chemi_chain_records set status='burn_pending',wallet_address=null,user_id=null,record_key='erased:'||id where id=(select id from public.chemi_chain_records where kind='album' and status='minted' limit 1) returning id,token_no",
    );
    await run();
    const state = await db.query(
      "select status,burned_at from public.chemi_chain_records where id=$1",
      [burn.id],
    );
    assert.equal(state.rows[0].status, "burned");
    assert.ok(state.rows[0].burned_at);
    assert.equal(
      await client.readContract({
        abi: [
          {
            type: "function",
            name: "balanceOf",
            stateMutability: "view",
            inputs: [{ type: "address" }, { type: "uint256" }],
            outputs: [{ type: "uint256" }],
          },
        ],
        address,
        functionName: "balanceOf",
        args: [recipient, BigInt(burn.token_no)],
      }),
      0n,
    );
    console.log("Erased account burn passed");
  } finally {
    server.close();
  }
}
