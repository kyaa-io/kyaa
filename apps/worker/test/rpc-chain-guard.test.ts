import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { assertRpcUrlChainId } from "../src/rpc-chain-guard.js";
import { runParticipationOnce } from "../src/participation-runtime.js";
import { runCreatorRegistrationOnce } from "../src/creator-registration-runtime.js";

// A real local JSON-RPC endpoint; only eth_chainId is expected to be called before the refusal.
const servers: Server[] = [];
const calls: string[] = [];
async function rpc(chainId: number): Promise<string> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const message = JSON.parse(body) as { id: number; method: string };
      calls.push(message.method);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: message.method === "eth_chainId" ? `0x${chainId.toString(16)}` : null }));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
afterEach(async () => { calls.length = 0; await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r)))); });

describe("assertRpcUrlChainId", () => {
  it("accepts a live RPC reporting 91342", async () => {
    await expect(assertRpcUrlChainId(await rpc(91342), 91342)).resolves.toBeUndefined();
  });
  it("refuses a live RPC reporting another chain", async () => {
    await expect(assertRpcUrlChainId(await rpc(1), 91342)).rejects.toThrow(/91342/);
  });
});

describe("separate participation RPC", () => {
  const base = {
    PARTICIPATION_LEDGER_ENABLED: true, GIWA_CHAIN_ID: 91342, SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_SERVICE_ROLE_KEY: "x",
    GIWA_RELAYER_PRIVATE_KEY: `0x${"11".repeat(32)}`, BYUS_PARTICIPATION_LEDGER_CONTRACT_ADDRESS: `0x${"22".repeat(20)}`, WORKER_LEASE_SECONDS: 60,
  };
  it("refuses before signing when PARTICIPATION_LEDGER_RPC_URL reports another chain, even if GIWA_RPC_URL is 91342", async () => {
    const good = await rpc(91342);
    const bad = await rpc(1);
    await expect(runParticipationOnce({ ...base, GIWA_RPC_URL: good, PARTICIPATION_LEDGER_RPC_URL: bad } as never, "w")).rejects.toThrow(/91342/);
    expect(calls).toEqual(["eth_chainId"]);
  });
  it("falls back to GIWA_RPC_URL and checks it too", async () => {
    await expect(runParticipationOnce({ ...base, GIWA_RPC_URL: await rpc(1) } as never, "w")).rejects.toThrow(/91342/);
  });
});

describe("creator registration RPC", () => {
  it("refuses before building the chain when the RPC reports another chain", async () => {
    await expect(runCreatorRegistrationOnce({ GIWA_RPC_URL: await rpc(1), POSTGREST_URL: "http://127.0.0.1:1" } as never)).rejects.toThrow(/91342/);
    expect(calls).toEqual(["eth_chainId"]);
  });
});
