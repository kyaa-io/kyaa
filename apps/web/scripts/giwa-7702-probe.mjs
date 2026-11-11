// PRIVY-EXIT-0005 2차 근거: GIWA Sepolia(91342)가 EIP-7702 위임을 처리하는지 읽기 전용으로 확인한다.
// 무작위 키만 쓰고 자금·전송이 없다(eth_estimateGas, eth_call). 실행: apps/web 에서 node scripts/giwa-7702-probe.mjs
import { createPublicClient, http, encodeFunctionData, defineChain, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const giwa = defineChain({ id: 91342, name: "giwa-sepolia", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } } });
const client = createPublicClient({ chain: giwa, transport: http() });
const member = privateKeyToAccount(generatePrivateKey());   // throwaway, never funded
const sponsor = privateKeyToAccount(generatePrivateKey());  // throwaway, never funded
const DELEGATE = "0xe6Cae83BdE06E4c305530e199D7217f42808555B"; // eth-infinitism Simple7702Account (AA v0.8)
const auth = await member.signAuthorization({ contractAddress: DELEGATE, chainId: 91342, nonce: 0 });
const execute = encodeFunctionData({ abi: [{ type: "function", name: "execute", inputs: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" }], functionName: "execute", args: [member.address, 0n, "0x"] });
const call = (authorizationList) => client.request({ method: "eth_estimateGas", params: [{ from: sponsor.address, to: member.address, data: execute, ...(authorizationList ? { authorizationList } : {}) }] });
const rpcAuth = [{ chainId: toHex(91342), address: DELEGATE, nonce: "0x0", yParity: toHex(auth.yParity), r: auth.r, s: auth.s }];
for (const [label, list] of [["with 7702 authorization", rpcAuth], ["without authorization (plain EOA)", null]]) {
  try { console.log(label, "estimateGas =", BigInt(await call(list)).toString()); }
  catch (e) { console.log(label, "ERROR", (e.details ?? e.shortMessage ?? e.message).slice(0, 200)); }
}
// execute() from a non-entrypoint/non-self caller must revert in Simple7702Account: shows the delegate code ran.
try { await client.request({ method: "eth_call", params: [{ from: sponsor.address, to: member.address, data: execute, authorizationList: rpcAuth }, "latest"] }); console.log("eth_call from sponsor: no revert"); }
catch (e) { console.log("eth_call from sponsor reverted:", (e.details ?? e.shortMessage).slice(0, 160)); }
try { await client.request({ method: "eth_call", params: [{ from: member.address, to: member.address, data: execute, authorizationList: rpcAuth }, "latest"] }); console.log("eth_call from member itself: ok"); }
catch (e) { console.log("eth_call from member reverted:", (e.details ?? e.shortMessage).slice(0, 160)); }
