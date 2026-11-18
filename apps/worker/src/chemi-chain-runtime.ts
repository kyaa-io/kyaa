import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
  decodeFunctionData,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseEventLogs,
  zeroAddress,
  zeroHash,
  type Address,
  type Hex,
} from "viem";
import { runChemiBatch } from "./chemi-chain-worker.js";
import { assertRpcUrlChainId } from "./rpc-chain-guard.js";

const token = parseAbi([
  "function mintBatch(uint128[] ids,address[] recipients)",
  "function burnBatch(uint128[] ids)",
  "function issued(uint256 id) view returns(bool)",
  "function writer() view returns(address)",
]);
const eas = parseAbi([
  "struct Data {address recipient; uint64 expirationTime; bool revocable; bytes32 refUID; bytes data; uint256 value;}",
  "struct Request {bytes32 schema; Data data;}",
  "function attest(Request request) payable returns(bytes32)",
  "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schemaUID)",
]);
const easAddress = "0x4200000000000000000000000000000000000021";
const schema = keccak256(
  encodePacked(
    ["string", "address", "bool"],
    ["uint32 week,uint8 game,uint8 map,bytes32 root", zeroAddress, false],
  ),
);
const rowSchema = z.strictObject({
  id: z.uuid(),
  op: z.enum(["mint", "burn", "rank"]),
  address: z
    .string()
    .regex(/^0x[0-9a-f]{40}$/)
    .nullable(),
  date: z.iso.date().nullable(),
  payload: z
    .strictObject({
      week: z.iso.date(),
      game: z.enum(["run", "match", "all"]),
      map: z.enum(["changha", "elina", "yuna", "dosa", "all"]),
      root: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .nullable(),
});
type Row = z.infer<typeof rowSchema>;
type Sent = { id: string; hash: Hex; raw: Hex; op: Row["op"]; ids: string[] };
const numberOf = (id: string) => BigInt("0x" + id.replaceAll("-", ""));

export async function runScheduledChemiChain(
  environment: string,
  load: (id: string) => Promise<string>,
) {
  if (environment !== "dev") return;
  let secret;
  try {
    secret = JSON.parse(await load("byus/worker/dev-chemi-chain"));
  } catch (error) {
    if (error instanceof Error && error.name === "ResourceNotFoundException")
      return;
    throw new Error("CHEMI_SIGNER_CONFIG_UNAVAILABLE");
  }
  if (!secret?.CHEMI_CHAIN_SIGNER_PRIVATE_KEY) return;
  if (
    typeof secret.CHEMI_CHAIN_SIGNER_PRIVATE_KEY !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(secret.CHEMI_CHAIN_SIGNER_PRIVATE_KEY)
  )
    throw new Error("CHEMI_SIGNER_KEY_INVALID");
  const account = privateKeyToAccount(
    secret.CHEMI_CHAIN_SIGNER_PRIVATE_KEY as Hex,
  );
  if (account.address !== getAddress(secret.CHEMI_CHAIN_SIGNER_ADDRESS))
    throw new Error("CHEMI_SIGNER_MISMATCH");
  const address = getAddress(secret.CHEMI_CHAIN_CONTRACT_ADDRESS);
  const chain = defineChain({
    id: 91342,
    name: "GIWA Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [secret.GIWA_RPC_URL] } },
  });
  const config = { chain, transport: http(secret.GIWA_RPC_URL) };
  const reader = createPublicClient(config);
  await assertRpcUrlChainId(secret.GIWA_RPC_URL, chain.id, reader);
  if (
    (await reader.readContract({
      address,
      abi: token,
      functionName: "writer",
    })) !== account.address
  )
    throw new Error("CHEMI_WRITER_MISMATCH");
  const wallet = createWalletClient({ ...config, account });
  const db = createClient(
    secret.SUPABASE_URL,
    secret.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const owner = randomUUID();
  const work = async (action: string, args: Record<string, unknown> = {}) => {
    const result = await db.rpc("chemi_chain_work", {
      p_owner: owner,
      p_action: action,
      p_args: args,
    });
    if (result.error) throw new Error("CHEMI_CHAIN_DB_" + action);
    return result.data;
  };
  async function settle(sent: Sent, recovering = false) {
    let receipt;
    try {
      receipt = await reader.getTransactionReceipt({ hash: sent.hash });
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
      let alreadyIssued = false;
      if (recovering && sent.op === "mint") {
        const issued = await Promise.all(
          sent.ids.map((id) =>
            reader.readContract({
              address,
              abi: token,
              functionName: "issued",
              args: [numberOf(id)],
            }),
          ),
        );
        alreadyIssued = issued.every(Boolean);
      }
      if (keccak256(sent.raw) !== sent.hash)
        throw new Error("CHEMI_HASH_MISMATCH");
      const pending =
        recovering &&
        (await reader.getTransaction({ hash: sent.hash }).catch((error) => {
          if (
            error instanceof Error &&
            error.name === "TransactionNotFoundError"
          )
            return null;
          throw error;
        }));
      if (!pending && alreadyIssued) {
        await work("confirmed", { batch: sent.id, evidence: "issued" });
        return "success";
      }
      if (!pending)
        await reader.sendRawTransaction({ serializedTransaction: sent.raw });
      receipt = await reader.waitForTransactionReceipt({
        hash: sent.hash,
        timeout: 30000,
        pollingInterval: 250,
      });
    }
    let attestationUid: Hex | undefined;
    if (sent.op === "rank" && receipt.status === "success") {
      const [attestation] = parseEventLogs({
        abi: eas,
        eventName: "Attested",
        logs: receipt.logs.filter(
          (log) => getAddress(log.address) === easAddress,
        ),
      });
      if (
        !attestation ||
        attestation.args.attester !== account.address ||
        attestation.args.schemaUID !== schema ||
        attestation.args.recipient !== zeroAddress
      )
        throw new Error("CHEMI_ATTESTATION_MISSING");
      attestationUid = attestation.args.uid;
    }
    await work(receipt.status === "success" ? "confirmed" : "reverted", {
      attestationUid,
      batch: sent.id,
    });
    return receipt.status;
  }
  const registryAbi = parseAbi([
    "function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))",
  ]);
  let rankEnabled = false;
  if (
    secret.CHEMI_EAS_SCHEMA_UID === schema &&
    (await reader.getCode({ address: easAddress }))
  ) {
    const registered = await reader.readContract({
      address: "0x4200000000000000000000000000000000000020",
      abi: registryAbi,
      functionName: "getSchema",
      args: [schema],
    });
    rankEnabled = registered.uid === schema;
  }
  let rows = new Map<bigint, Row>();
  await runChemiBatch({
    acquireWriter: () => work("acquire"),
    releaseWriter: () => work("release"),
    async reconcile() {
      const sent = await work("recover");
      if (sent) await settle(sent, true);
    },
    async lease() {
      const leased = rowSchema
        .array()
        .max(100)
        .parse(await work("lease", { rank: rankEnabled }));
      rows = new Map(leased.map((row) => [numberOf(row.id), row]));
      return [...rows.keys()];
    },
    retry: (id) => work("retry", { id: rows.get(id)!.id }),
    async submit(ids) {
      const selected = ids.map((id) => rows.get(id)!);
      const { op, payload } = selected[0]!;
      let to: Address = address,
        data: Hex;
      if (op === "rank") {
        if (
          !payload ||
          payload.week !== selected[0]!.date ||
          new Date(payload.week).getUTCDay() !== 1
        )
          throw new Error("CHEMI_ROOT_INVALID");
        const game = ["run", "match", "all"].indexOf(payload.game),
          map = ["changha", "elina", "yuna", "dosa", "all"].indexOf(
            payload.map,
          );
        const encoded = encodeAbiParameters(
          [
            { type: "uint32" },
            { type: "uint8" },
            { type: "uint8" },
            { type: "bytes32" },
          ],
          [
            Date.parse(payload.week) / 86400000,
            game,
            map,
            ("0x" + payload.root) as Hex,
          ],
        );
        to = easAddress;
        data = encodeFunctionData({
          abi: eas,
          functionName: "attest",
          args: [
            {
              schema,
              data: {
                recipient: zeroAddress,
                expirationTime: 0n,
                revocable: false,
                refUID: zeroHash,
                data: encoded,
                value: 0n,
              },
            },
          ],
        });
      } else {
        data =
          op === "burn"
            ? encodeFunctionData({
                abi: token,
                functionName: "burnBatch",
                args: [ids],
              })
            : encodeFunctionData({
                abi: token,
                functionName: "mintBatch",
                args: [ids, selected.map((row) => getAddress(row.address!))],
              });
        const decoded = decodeFunctionData({ abi: token, data });
        if (
          decoded.functionName !==
            (op === "mint" ? "mintBatch" : "burnBatch") ||
          !decoded.args[0].every((id, i) => id === ids[i]) ||
          decoded.args[0].length !== ids.length ||
          (decoded.functionName === "mintBatch" &&
            !decoded.args[1].every(
              (recipient, i) => recipient === getAddress(selected[i]!.address!),
            )) ||
          encodeFunctionData({ abi: token, ...decoded }) !== data
        )
          throw new Error("CHEMI_CALLDATA_INVALID");
      }
      let request;
      try {
        request = await wallet.prepareTransactionRequest({ to, data });
      } catch (error) {
        if (
          error instanceof BaseError &&
          error.walk(
            (c) =>
              c instanceof ContractFunctionRevertedError ||
              (c instanceof Error && c.name === "ExecutionRevertedError"),
          ) &&
          op === "mint"
        )
          return "record-reverted";
        throw error;
      }
      const raw = await wallet.signTransaction(request),
        hash = keccak256(raw);
      const recordIds = selected.map((row) => row.id);
      const id = await work("prepare", { op, raw, hash, ids: recordIds });
      if ((await settle({ id, raw, hash, op, ids: recordIds })) === "reverted")
        return "record-reverted";
      return "confirmed";
    },
  });
}
