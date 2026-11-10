// Shared denial contract for the ordinary fallback and the unchanged AWS runtime image.
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export const INVALID_AUTH_ENV = Object.freeze({
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "http://localhost:4183", NEXT_PUBLIC_PRIVY_APP_ID: "cs-build-check", PRIVY_APP_ID: "cs-build-check", PRIVY_APP_SECRET: "invalid-local-check-secret",
    NEXT_PUBLIC_BYUS_DATA_ENVIRONMENT: "development", BYUS_DATA_ENVIRONMENT: "development", NEXT_PUBLIC_PRIVY_APP_ENVIRONMENT: "development", PRIVY_APP_ENVIRONMENT: "development",
    NEXT_PUBLIC_PRIVY_APPLE_LOGIN_ENABLED: "false", PRIVY_APPLE_LOGIN_ENABLED: "false", NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED: "false", PRIVY_TEST_ACCOUNT_LOGIN_ENABLED: "false",
    SUPABASE_URL: "https://cs-local-unreachable.invalid", SUPABASE_SERVICE_ROLE_KEY: "invalid-local-service-role-check-key", GIWA_CHAIN_ID: "91342",
    GIWA_RPC_URL: "https://cs-local-unreachable.invalid", GIWA_EXPLORER_URL: "https://cs-local-unreachable.invalid",
    BYUS_PASSPORT_CONTRACT_ADDRESS: "0x1111111111111111111111111111111111111111", BYUS_STAMP_CONTRACT_ADDRESS: "0x2222222222222222222222222222222222222222", BYUS_RELAYER_ADDRESS: "0x3333333333333333333333333333333333333333",
});
export const AUTH_CASES = Object.freeze(["/api/me/inquiries", "/api/admin/inquiries"].flatMap(url =>
  [null, "cs-local-fan", "cs-local-admin"].map(token => ({ url, token, code: url.startsWith("/api/admin/") && !token ? "UNAUTHENTICATED" : "AUTHENTICATION_REQUIRED" }))));

// Kept self-contained so Docker exec runs the same six assertions using only Node's built-ins.
export async function probeProductionAuth(baseURL, cases = AUTH_CASES, fetcher = fetch) {
  for (const { url, token, code } of cases) {
    const response = await fetcher(`${baseURL}${url}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, redirect: "error", signal: AbortSignal.timeout(10_000) });
    const body = await response.json();
    if (response.status !== 401 || body?.error?.code !== code) throw new Error(`RUNTIME_AUTH_DENIAL_FAILED: ${url} ${token ?? "anonymous"} status=${response.status} code=${body?.error?.code}`);
  }
  return cases.length;
}

export async function ordinaryProductionAuth() {
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const child = spawn(process.execPath, [path.resolve(web, "../../node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "4183"], {
    cwd: web, env: { PATH: process.env.PATH, ...INVALID_AUTH_ENV }, stdio: ["ignore", "pipe", "pipe"],
  });
  try {
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Next startup timed out")), 20_000);
    child.stdout.on("data", (chunk) => { output += chunk; if (/Ready in/i.test(output)) { clearTimeout(timer); resolve(); } });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Next exited ${code}: ${output}`)); });
  });
    await probeProductionAuth("http://127.0.0.1:4183");
    console.log("PASS ordinary Next production build rejects absent and synthetic fan/admin tokens on both CS endpoints (6 checks)");
  } finally { child.kill("SIGTERM"); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = process.argv[2] === "image"
    ? import("../../../../scripts/aws-release-runtime-auth.mjs").then(({ verifyRuntimeImage }) => verifyRuntimeImage(process.argv[3]))
    : ordinaryProductionAuth();
  run.catch(error => { console.error(error.message); process.exitCode = 1; });
}
