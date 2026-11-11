import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ login: vi.fn(), operation: vi.fn(), authenticate: vi.fn(), rpc: vi.fn(), provider: "cognito", config: { origin: "https://kyaa.io", cookieSecret: Buffer.alloc(32, 7).toString("base64") } }));
vi.mock("./config", () => ({ emailCognitoConfig: () => mock.config }));
vi.mock("../../config/env", () => ({ loadServerEnv: () => ({ AUTH_PROVIDER: mock.provider }) }));
vi.mock("../email/email-route", () => ({ createEmailAuthHandler: () => mock.login }));
vi.mock("./email-session", () => ({ authenticateCognitoEmail: mock.authenticate, cognitoEmailOperation: mock.operation }));
vi.mock("./identity-repository", () => ({ identityDatabase: () => ({ rpc: mock.rpc }) }));
import { emailBrowserSession, loginEmailBrowser, logoutEmailBrowser, EMAIL_BROWSER_COOKIE } from "./email-browser";
import { cognitoDenied } from "./verifier";
const tokens = () => ({ accessToken: "kyaa-email:access", refreshToken: "private-refresh", expiresAt: Math.floor(Date.now() / 1000) + 600 });
const request = (cookie?: string, origin = "https://kyaa.io") => new Request("https://kyaa.io/api/auth/email/web-login", { method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ email: "old@example.test", password: "private-password", locale: "ko" }) });
let rows: Map<string, string>, revoked: boolean;
beforeEach(() => {
  vi.resetAllMocks(); mock.provider = "cognito"; rows = new Map(); revoked = false;
  mock.login.mockImplementation(async () => Response.json(tokens()));
  mock.authenticate.mockImplementation(async () => { if (revoked) throw cognitoDenied(); return { privyUserId: "did:privy:original", appUserId: "original-uuid" }; });
  mock.operation.mockImplementation(async (action: string) => { if (action === "logout") { revoked = true; return null; } return { ...tokens(), accessToken: "kyaa-email:refreshed" }; });
  mock.rpc.mockImplementation(async (name: string, args: Record<string, string>) => {
    if (name === "write_cognito_browser_session") rows.set(args.p_token_hash, args.p_encrypted_session);
    if (name === "delete_cognito_browser_session") rows.delete(args.p_token_hash);
    return { data: name === "read_cognito_browser_session" ? rows.get(args.p_token_hash) ?? null : null, error: null };
  });
});
async function login() { const response = await loginEmailBrowser(request()); expect(response.status).toBe(200); return response.headers.getSetCookie().find(value => value.startsWith(EMAIL_BROWSER_COOKIE))!.split(";")[0]; }
it("stores an encrypted email session, exposes only an opaque secure cookie and retains the original identity", async () => {
  const response = await loginEmailBrowser(request());
  expect(await response.json()).toEqual({ authenticated: true });
  expect(response.headers.get("set-cookie")).toContain("HttpOnly; Secure; SameSite=Lax");
  expect(response.headers.get("set-cookie")).not.toContain("private-refresh");
  expect([...rows.values()].join()).not.toContain("private-refresh");
  const cookie = response.headers.getSetCookie()[0].split(";")[0];
  expect(await (await emailBrowserSession(request(cookie))).json()).toMatchObject({ userId: "did:privy:original", accessToken: "kyaa-email:access" });
});
it("revokes the pre-logout bearer and deletes the browser session", async () => {
  const cookie = await login();
  await logoutEmailBrowser(request(cookie));
  await expect(mock.authenticate("kyaa-email:access")).rejects.toMatchObject({ status: 401 });
  await expect(emailBrowserSession(request(cookie))).rejects.toMatchObject({ status: 401 });
  expect(rows.size).toBe(0);
  await expect(logoutEmailBrowser(request(cookie))).resolves.toBeUndefined();
});
it("refreshes through the email pool and preserves the identity", async () => {
  mock.login.mockResolvedValueOnce(Response.json({ ...tokens(), expiresAt: Math.floor(Date.now() / 1000) + 30 }));
  const cookie = await login();
  const response = await emailBrowserSession(request(cookie));
  expect(mock.operation).toHaveBeenCalledWith("refresh", { refreshToken: "private-refresh", locale: "ko" });
  expect(await response.json()).toMatchObject({ userId: "did:privy:original", accessToken: "kyaa-email:refreshed" });
});
it("rejects cross-origin login, disabled auth, provider throttling, and incorrect credentials without cookies", async () => {
  expect((await loginEmailBrowser(request(undefined, "https://evil.test"))).status).toBe(401);
  expect(mock.login).not.toHaveBeenCalled();
  mock.provider = "privy"; expect((await loginEmailBrowser(request())).status).toBe(401); mock.provider = "cognito";
  for (const status of [401, 429]) { mock.login.mockResolvedValueOnce(Response.json({ error: {} }, { status })); const response = await loginEmailBrowser(request()); expect(response.status).toBe(status); expect(response.headers.has("set-cookie")).toBe(false); }
});
it("preserves the session if revocation fails and rejects cross-origin logout", async () => {
  const cookie = await login();
  await expect(logoutEmailBrowser(request(cookie, "https://evil.test"))).rejects.toMatchObject({ status: 401 });
  mock.operation.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(logoutEmailBrowser(request(cookie))).rejects.toThrow("Unavailable");
  expect(rows.size).toBe(1);
});
