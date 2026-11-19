// Run with NODE_PATH pointing at an isolated installation of solc 0.8.30 and a local anvil executable on PATH.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEventLogs,
} from "viem";
const require = createRequire(import.meta.url);
const source = "contracts/src/KyaaChemiRecord.sol";
const output = JSON.parse(
  require("solc").compile(
    JSON.stringify({
      language: "Solidity",
      sources: { [source]: { content: readFileSync(source, "utf8") } },
      settings: {
        evmVersion: "cancun",
        optimizer: { enabled: true, runs: 200 },
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
    { import: (path) => ({ contents: readFileSync(path, "utf8") }) },
  ),
);
if (!output.contracts) throw new Error(JSON.stringify(output.errors));
const { abi, evm } = output.contracts[source].KyaaChemiRecord;
const { spawn } = await import("node:child_process");
const node = spawn(
  "anvil",
  ["--port", "0", "--chain-id", "91342", "--accounts", "2"],
  { stdio: ["ignore", "pipe", "inherit"] },
);
let startup = "";
const url = await new Promise((resolve, reject) => {
  node.once("error", reject);
  node.once("exit", () => reject(new Error("anvil exited")));
  node.stdout.on("data", (chunk) => {
    startup += chunk;
    const match = startup.match(/Listening on (127\.0\.0\.1:\d+)/);
    if (match) {
      resolve("http://" + match[1]);
      startup = "";
    }
  });
});
try {
  const chain = defineChain({
    id: 91342,
    name: "local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
  const options = { chain, transport: http(url) };
  const client = createPublicClient(options);
  const wallet = createWalletClient(options);
  const [account, recipient] = await wallet.getAddresses();
  async function receipt(hash) {
    const result = await client.waitForTransactionReceipt({
      hash: await hash,
      pollingInterval: 15,
    });
    assert.equal(result.status, "success");
    return result;
  }
  const { contractAddress: address } = await receipt(
    wallet.deployContract({
      abi,
      bytecode: "0x" + evm.bytecode.object,
      account,
      args: [account, account, "/api/chemi/chain/metadata/{id}"],
      gas: 4000000n,
    }),
  );
  const write = (functionName, args) =>
    receipt(
      wallet.writeContract({
        abi,
        address,
        account,
        functionName,
        args,
        gas: 18000000n,
      }),
    );
  const balance = (id) =>
    client.readContract({
      abi,
      address,
      functionName: "balanceOf",
      args: [recipient, id],
    });
  const minted = await write("mintBatch", [[1n], [recipient]]);
  const [transfer] = parseEventLogs({
    abi,
    logs: minted.logs,
    eventName: "TransferSingle",
  });
  assert.deepEqual(Object.keys(transfer.args).sort(), [
    "from",
    "id",
    "operator",
    "to",
    "value",
  ]);
  assert.equal(transfer.args.to, recipient);
  await write("mintBatch", [[1n], [recipient]]);
  assert.equal(await balance(1n), 1n);
  await assert.rejects(
    client.simulateContract({
      abi,
      address,
      account: recipient,
      functionName: "safeTransferFrom",
      args: [recipient, account, 1n, 1n, "0x"],
    }),
  );
  await write("burnBatch", [[1n]]);
  await write("mintBatch", [[1n], [recipient]]);
  assert.equal(await balance(1n), 0n);
  let next = 2n;
  for (const count of [1000, 10000]) {
    const start = performance.now();
    for (let index = 0; index < count; index += 100) {
      const ids = Array.from({ length: 100 }, () => next++);
      await write("mintBatch", [ids, ids.map(() => recipient)]);
    }
    assert.equal(await balance(next - 1n), 1n);
    console.log(
      JSON.stringify({ count, seconds: (performance.now() - start) / 1000 }),
    );
  }
  if (process.argv.includes("--queue"))
    await (
      await import("./chemi-chain-local-db.mjs")
    ).measureQueue({
      url,
      address,
      recipient,
      wallet,
      client,
      receipt,
      account,
    });
} finally {
  node.kill();
}
