import { createClient } from "@supabase/supabase-js";
import { PrivyClient } from "@privy-io/node";
import { readFile, writeFile, chmod, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

let recoveryState;

export function parseReviewerInput(raw) {
  const input = JSON.parse(raw);
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !["email", "password"].includes(key))
    || typeof input.email !== "string" || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    || typeof input.password !== "string" || input.password.length < 16 || input.password.length > 1024) throw new Error("Invalid reviewer input");
  return { email: input.email.toLowerCase(), password: input.password };
}
export async function provisionReviewer({ database, privy, input, state, save, apply = false }) {
  const email = input.email;
  const admin = await database.from("admin_allowlist").select("id").eq("email", email);
  const existing = await database.from("app_users").select("id,privy_user_id").eq("verified_email", email);
  if (admin.error || existing.error) throw new Error("Preflight unavailable");
  if (admin.data?.length || existing.data?.some(user => user.privy_user_id !== state.privyUserId)) throw new Error("Existing/admin identity cannot be linked");
  const preflight = await database.rpc("check_mobile_email_provisioning", { p_email:email,p_supabase_user_id:state.supabaseUserId??null,p_privy_user_id:state.privyUserId??null });
  if (preflight.error || preflight.data !== true) throw new Error("Provider identity collision or preflight unavailable");
  try {
    const provider = await privy.users().getByEmailAddress({address:email});
    if (provider.id !== state.privyUserId) throw new Error("Existing provider identity cannot be linked");
  } catch (error) { if (error?.status !== 404) throw new Error("Provider identity collision or preflight unavailable"); }
  if (!apply) return { ready: true, writes: false };
  await save(state);
  // Persist each real provider ID before continuing; reruns resume this local file.
  if (!state.privyUserId) {
    const user = await privy.users().create({ linked_accounts: [{ type: "email", address: email }], wallets: [{ chain_type: "ethereum" }] });
    if (typeof user.id !== "string" || !/^did:privy:[A-Za-z0-9:_-]{1,200}$/.test(user.id)) throw new Error("Invalid Privy identity");
    state.privyUserId = user.id; await save(state);
  }
  if (!state.privyUserId?.startsWith("did:privy:")) throw new Error("Invalid Privy provider identity");
  let user; let wallet;
  for (let attempt = 0; attempt < 20; attempt++) {
    user = await privy.users()._get(state.privyUserId);
    if (user.id !== state.privyUserId || !user.linked_accounts.some(account => account.type === "email" && account.address?.toLowerCase() === email)
      || user.linked_accounts.some(account => ["google_oauth", "apple_oauth"].includes(account.type))) throw new Error("Dedicated Privy identity mismatch");
    wallet = user.linked_accounts.find(account => account.type === "wallet" && account.chain_type === "ethereum" && account.connector_type === "embedded" && account.wallet_client === "privy" && /^0x[0-9a-fA-F]{40}$/.test(account.address));
    if (wallet) break;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  if (!wallet) throw new Error("Embedded wallet is not ready; preserve checkpoint and retry");
  if (!state.supabaseUserId) {
    const result = await database.auth.admin.createUser({ email, password: input.password, email_confirm: true });
    if (result.error || !result.data.user) throw new Error("Supabase creation unavailable; preserve checkpoint");
    state.supabaseUserId = result.data.user.id; await save(state);
  }
  const identity = await database.auth.admin.getUserById(state.supabaseUserId);
  if (identity.error || identity.data.user?.email?.toLowerCase() !== email || !identity.data.user.email_confirmed_at) throw new Error("Supabase identity mismatch");
  const synced = await database.rpc("sync_privy_identity", { p_privy_user_id: state.privyUserId, p_verified_email: email, p_chain_id: 91342, p_wallet_address: wallet.address.toLowerCase() });
  if (synced.error || !synced.data?.[0]?.app_user_id) throw new Error("Identity initialization unavailable");
  state.appUserId = synced.data[0].app_user_id; await save(state);
  // A conflict is a stop, never an automatic upsert/rebinding or account merge.
  const binding = await database.from("mobile_email_login_bindings").select("app_user_id,enabled").eq("supabase_user_id", state.supabaseUserId).maybeSingle();
  if (binding.error || (binding.data && binding.data.app_user_id !== state.appUserId)) throw new Error("Binding conflict");
  if (!binding.data) {
    const result = await database.from("mobile_email_login_bindings").insert({ supabase_user_id: state.supabaseUserId, app_user_id: state.appUserId, enabled: false });
    if (result.error) throw new Error("Binding creation unavailable");
  }
  return { ready: true, writes: true, enabled: binding.data?.enabled ?? false };
}
async function main() {
  const args = process.argv.slice(2);
  const checkpoint = args.find(arg => arg.startsWith("--checkpoint="))?.slice(13);
  const inputPath = args.find(arg => arg.startsWith("--input="))?.slice(8);
  if (!checkpoint || !inputPath || args.some(arg => arg !== "--apply" && !arg.startsWith("--checkpoint=") && !arg.startsWith("--input="))) throw new Error("Use --input=<private-json> --checkpoint=<private-file> [--apply]");
  const metadata = await stat(inputPath);
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new Error("Input must be a private 0600 file");
  const input = parseReviewerInput(await readFile(inputPath, "utf8"));
  const env = process.env;
  if (!["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "PRIVY_APP_ID", "PRIVY_APP_SECRET"].every(key => env[key])) throw new Error("Server credentials required");
  let state = {};
  try { state = JSON.parse(await readFile(checkpoint, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (Object.keys(state).some(key => !["privyUserId", "supabaseUserId", "appUserId"].includes(key))) throw new Error("Invalid checkpoint");
  recoveryState = state;
  const save = async value => { await writeFile(checkpoint, JSON.stringify(value)+"\n", { mode: 0o600 }); await chmod(checkpoint,0o600); };
  const database = createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const privy = new PrivyClient({appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET});
  const result = await provisionReviewer({database,privy,input,state,save,apply:args.includes("--apply")});
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  if (recoveryState) console.error(JSON.stringify({status:"failed",...recoveryState}));
  console.error("Reviewer provisioning failed. Preserve the private checkpoint; no identities were automatically deleted."); process.exitCode=1;
});
