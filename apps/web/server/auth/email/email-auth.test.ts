import { TextEncoder as NodeTextEncoder } from "node:util";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT, exportJWK } from "jose";
vi.mock("server-only", () => ({}));
import { authenticateEmailAccessToken, createEmailAuthClients, EMAIL_TOKEN_PREFIX, validatedEmailClaims, verifyAcceptedEmailDeletion } from "./email-auth";
const uid = "11111111-1111-4111-8111-111111111111";
const sid = "22222222-2222-4222-8222-222222222222";
const aid = "33333333-3333-4333-8333-333333333333";
const config = { url: "https://project.supabase.co", serviceRoleKey: "server-only-test" };
const claims = () => ({ sub: uid, session_id: sid, iss: `${config.url}/auth/v1`, aud: "authenticated", exp: Math.floor(Date.now()/1000)+600 });
const encode = (value = claims()) => `eyJhbGciOiJFUzI1NiJ9.${Buffer.from(JSON.stringify(value)).toString("base64url")}.signature`;
function clients() {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: uid, email_confirmed_at: "2026-10-18" } }, error: null }) },
    database: { rpc: vi.fn().mockResolvedValue({ data: { appUserId: aid, privyUserId: "did:privy:reviewer" }, error: null }) } };
}
const asClients = (value: ReturnType<typeof clients>) => value as unknown as ReturnType<typeof createEmailAuthClients>;
beforeAll(() => {
  Object.defineProperty(globalThis,"Uint8Array",{configurable:true,value:new NodeTextEncoder().encode("").constructor});
});
beforeEach(() => vi.unstubAllGlobals());
describe("dedicated email authentication", () => {
  it("requires a network verified user plus explicit live session binding before returning the normal owner", async () => {
    const port = clients();
    expect(await authenticateEmailAccessToken(EMAIL_TOKEN_PREFIX+encode(),config,asClients(port))).toEqual({ appUserId: aid, privyUserId: "did:privy:reviewer", supabaseUserId: uid });
    expect(port.auth.getUser).toHaveBeenCalledWith(encode());
    expect(port.database.rpc).toHaveBeenCalledWith("check_mobile_email_session", { p_supabase_user_id: uid, p_session_id: sid });
  });
  it.each(["unbound", "disabled", "admin", "deleted session", "Apple revoked", "Apple deleted"])("fails closed for %s database gates", async () => {
    const port = clients(); port.database.rpc.mockResolvedValue({ data: null, error: null });
    await expect(authenticateEmailAccessToken(EMAIL_TOKEN_PREFIX+encode(),config,asClients(port))).rejects.toMatchObject({ status:401 });
  });
  it.each(["forged", "unconfirmed", "other user"])("rejects %s network identities", async kind => {
    const port = clients();
    port.auth.getUser.mockResolvedValue({ data: { user: { id: kind === "other user" ? aid : uid, email_confirmed_at: kind === "unconfirmed" ? "" : "2026" } }, error: kind === "forged" ? {status:401} : null } as never);
    await expect(authenticateEmailAccessToken(EMAIL_TOKEN_PREFIX+encode(),config,asClients(port))).rejects.toMatchObject({ status:401 });
    expect(port.database.rpc).not.toHaveBeenCalled();
  });

  it.each([429, 500, 0])("preserves transient getUser status %s without reporting invalid credentials", async status => {
    const port = clients(); port.auth.getUser.mockResolvedValue({data:{user:null},error:{status}} as never);
    try { await authenticateEmailAccessToken(EMAIL_TOKEN_PREFIX+encode(),config,asClients(port)); throw new Error("accepted"); }
    catch (error) { if(status===429) expect(error).toMatchObject({status:429}); else expect(error).not.toHaveProperty("status",401); }
    expect(port.database.rpc).not.toHaveBeenCalled();
  });
  it("rejects wrong project, audience, expiry, malformed UUID or missing session before provider calls", () => {
    for (const invalid of [{iss:"https://attacker.supabase.co/auth/v1"},{aud:"service_role"},{exp:1},{session_id:""},{sub:"did:privy:fake"}]) {
      expect(() => validatedEmailClaims(encode({...claims(),...invalid}),config.url)).toThrow();
    }
  });
  it("only cryptographically verified ES256 tokens can retry an accepted tombstone after provider removal", async () => {
    const key = await generateKeyPair("ES256");
    const jwk = { ...await exportJWK(key.publicKey), kid:"review-key", alg:"ES256" };
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async () => new Response(JSON.stringify({keys:[jwk]}),{headers:{"content-type":"application/json"}})));
    const token = await new SignJWT(claims()).setProtectedHeader({alg:"ES256",kid:"review-key"}).sign(key.privateKey);
    const rpc = vi.fn().mockResolvedValue({data:true,error:null});
    expect(await verifyAcceptedEmailDeletion(EMAIL_TOKEN_PREFIX+token,config,{rpc} as never)).toBe(`supabase-email:${uid}`);
    expect(rpc).toHaveBeenCalledWith("has_approved_email_account_deletion",{p_supabase_user_id:uid});
    rpc.mockResolvedValueOnce({data:null,error:{message:"private DB failure"}});
    await expect(verifyAcceptedEmailDeletion(EMAIL_TOKEN_PREFIX+token,config,{rpc} as never)).rejects.not.toMatchObject({status:401});
    rpc.mockResolvedValue({data:false,error:null});
    await expect(verifyAcceptedEmailDeletion(EMAIL_TOKEN_PREFIX+token,config,{rpc} as never)).rejects.toMatchObject({status:401});
    rpc.mockClear();
    const wrongKey = await generateKeyPair("ES256");
    const forged = await new SignJWT(claims()).setProtectedHeader({alg:"ES256",kid:"review-key"}).sign(wrongKey.privateKey);
    await expect(verifyAcceptedEmailDeletion(EMAIL_TOKEN_PREFIX+forged,config,{rpc} as never)).rejects.toMatchObject({status:401});
    expect(rpc).not.toHaveBeenCalled();
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new TypeError("network down")));
    await expect(verifyAcceptedEmailDeletion(EMAIL_TOKEN_PREFIX+token,config,{rpc} as never)).rejects.not.toMatchObject({status:401});
    const otherIssuer = await new SignJWT({...claims(),iss:"https://other.supabase.co/auth/v1"}).setProtectedHeader({alg:"ES256",kid:"review-key"}).sign(key.privateKey);
    await expect(verifyAcceptedEmailDeletion(EMAIL_TOKEN_PREFIX+otherIssuer,config,{rpc} as never)).rejects.toMatchObject({status:401});
  });
});
