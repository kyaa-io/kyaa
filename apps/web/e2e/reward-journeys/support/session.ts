import fs from "node:fs";

export type StorageState = { cookies?: { name: string; value: string; domain: string; expires?: number }[]; origins?: { localStorage?: { name: string; value: string }[] }[] };

export function storedCredential(file: string): { token?: string; cookie?: string } {
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as StorageState;
  const email = state.cookies?.find((item) => item.name === "__Host-kyaa-email" && (!item.expires || item.expires > Date.now() / 1000));
  if (email) return { cookie: `${email.name}=${email.value}` };
  for (const origin of state.origins ?? []) for (const item of origin.localStorage ?? []) {
    if (item.name !== "privy:token") continue;
    const token = JSON.parse(item.value) as string;
    const exp = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).exp as number;
    if (exp - Date.now() / 1000 < 120) throw new Error("REWARD_E2E_TOKEN_EXPIRED");
    return { token };
  }
  throw new Error("REWARD_E2E_LOGIN_MISSING: storage state has neither an email session cookie nor a Privy token");
}

export async function sessionToken(baseURL: string, cookie: string, fetcher: typeof fetch = fetch): Promise<string> {
  const response = await fetcher(`${baseURL}/api/auth/cognito/session`, { headers: { cookie }, redirect: "error" });
  if (!response.ok) throw new Error(`REWARD_E2E_SESSION_FAILED: ${response.status}`);
  const session: unknown = await response.json();
  if (!session || typeof session !== "object" || !("authenticated" in session) || session.authenticated !== true || !("accessToken" in session) || typeof session.accessToken !== "string" || !session.accessToken.startsWith("kyaa-email:")) throw new Error("REWARD_E2E_SESSION_INVALID");
  return session.accessToken;
}
