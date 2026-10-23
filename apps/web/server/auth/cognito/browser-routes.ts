import "server-only";
import { z } from "zod";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import { preferredLocaleSchema } from "../../../features/profile/domain/preferred-locale";
import { sanitizeLocale, sanitizeReturnTo } from "../../../components/login-intent";
import { appOriginForRequest } from "../../config/app-origin";
import { loadServerEnv } from "../../config/env";
import { classifyEnrollment } from "./enrollment";
import { cognitoConfig } from "./config";
import { createCognitoVerifier, COGNITO_TOKEN_PREFIX, cognitoDenied } from "./verifier";
import { readCognitoMapping, identityDatabase } from "./identity-repository";
import { authHeaders, challenge, cookie, FLOW_COOKIE, opaque, readCookie, readSession, requireOrigin, revokeSession, rpc, seal, SESSION_COOKIE, tokenRequest, unseal, writeSession } from "./browser-session";

const flowSchema = z.object({ state: z.string(), verifier: z.string(), nonce: z.string(), expiresAt: z.number(), returnTo: z.string(), locale: preferredLocaleSchema.default("ko") });
function denied(error: unknown): Response {
  return Response.json({ error: { code: error instanceof AuthError ? error.code : "AUTH_UNAVAILABLE" } }, { status: error instanceof AuthError ? error.status : 503, headers: authHeaders() });
}
export async function start(request: Request): Promise<Response> {
  try {
    const config = cognitoConfig();
    if (loadServerEnv().COGNITO_ENROLLMENT_ENABLED && await rpc(identityDatabase(), "cognito_rollout_ready", {}) !== true) throw new Error("Legacy identity inventory incomplete");
    // Entry is a navigation; the authorization state is bound to an encrypted, same-site cookie.
    if (request.headers.get("sec-fetch-site") === "cross-site") throw cognitoDenied();
    if (appOriginForRequest(request,config.origin)!==config.origin) {
      const canonical=new URL("/api/auth/cognito/start",config.origin);
      canonical.search=new URL(request.url).search;
      const headers=authHeaders();headers.set("location",canonical.toString());
      return new Response(null,{status:303,headers});
    }
    const query = new URL(request.url).searchParams;
    const provider = z.enum(["google", "apple"]).parse(query.get("provider"));
    const state = opaque(), verifier = opaque(), nonce = opaque();
    const returnTo = sanitizeReturnTo(query.get("returnTo"));
    const locale = sanitizeLocale(query.get("locale"));
    const url = new URL("/oauth2/authorize", config.domain);
    url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, scope: "openid email profile", state, nonce, code_challenge: challenge(verifier), code_challenge_method: "S256", identity_provider: provider === "google" ? "Google" : "SignInWithApple" }).toString();
    const headers = authHeaders();
    headers.set("location", url.toString());
    headers.set("set-cookie", cookie(FLOW_COOKIE, seal({ state, verifier, nonce, expiresAt: Date.now()+600_000, returnTo, locale }, config.cookieSecret),600));
    return new Response(null, { status: 303, headers });
  } catch (error) { return denied(error); }
}
export async function callback(request: Request): Promise<Response> {
  const headers = authHeaders(); headers.set("set-cookie",cookie(FLOW_COOKIE,"",0));
  try {
    const config = cognitoConfig();
    const url = new URL(request.url);
    // CloudFront changes the origin Host; the registered callback path and OAuth redirect URI remain canonical.
    if (appOriginForRequest(request,config.origin) !== config.origin || url.pathname !== new URL(config.redirectUri).pathname || url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1) throw cognitoDenied();
    const encoded = readCookie(request,FLOW_COOKIE);
    if (!encoded) throw cognitoDenied();
    const flow = flowSchema.parse(unseal(encoded,config.cookieSecret));
    if (flow.state !== url.searchParams.get("state") || flow.expiresAt <= Date.now() || url.searchParams.has("error")) throw cognitoDenied();
    const tokens = await tokenRequest(config,new URLSearchParams({ grant_type:"authorization_code",client_id:config.clientId,redirect_uri:config.redirectUri,code:url.searchParams.get("code")!,code_verifier:flow.verifier }));
    if (!tokens.refresh_token) throw cognitoDenied();
    const verify = createCognitoVerifier(config);
    const [access,id] = await Promise.all([verify(tokens.access_token),verify(tokens.id_token,"id",flow.nonce)]);
    if (access.subject !== id.subject || !id.email) throw cognitoDenied();
    const mapping = await readCognitoMapping(id);
    const enrollment = mapping ? undefined : await classifyEnrollment(id);
    const key=opaque();
    await writeSession(key,{ enrollment,preferredLocale:flow.locale, accessToken:tokens.access_token,idToken:tokens.id_token,refreshToken:tokens.refresh_token,subject:id.subject,expiresAt:Date.now()+tokens.expires_in*1000,sessionExpiresAt:Date.now()+86400_000 },config);
    const destination = new URL(mapping ? "/login" : "/auth/cognito/link",config.origin);
    destination.searchParams.set("returnTo",flow.returnTo);
    destination.searchParams.set("locale",flow.locale);
    headers.append("set-cookie",cookie(SESSION_COOKIE,key,86400));headers.set("location",destination.toString());
    return new Response(null,{status:303,headers});
  } catch { return Response.json({error:{code:"INVALID_AUTH_CALLBACK"}},{status:400,headers}); }
}
export async function session(request: Request): Promise<Response> {
  try {
    const config=cognitoConfig();
    // Same-origin fetches only; GET carries no tokens across cross-site contexts.
    if (request.headers.get("sec-fetch-site") === "cross-site") throw cognitoDenied();
    const {session}=await readSession(request,config);
    const identity=await createCognitoVerifier(config)(session.idToken,"id");
    const mapping=await readCognitoMapping(identity);
    return Response.json({authenticated:true,walletLinked:!!mapping,accessToken:COGNITO_TOKEN_PREFIX+session.accessToken,expiresAt:session.expiresAt,enrollment:session.enrollment ? {mode:session.enrollment.mode,provider:session.enrollment.provider}:undefined,...(mapping?{walletToken:session.idToken}:{})},{headers:authHeaders()});
  }catch(error){return denied(error);}
}
export async function logout(request: Request): Promise<Response> {
  try {
    const config=cognitoConfig();requireOrigin(request,config);
    const key=readCookie(request,SESSION_COOKIE);
    if(!key || key.length!==43)throw cognitoDenied();
    await revokeSession(key,config);
    const headers=authHeaders();headers.set("set-cookie",cookie(SESSION_COOKIE,"",0));
    const logoutUrl=new URL("/logout",config.domain);logoutUrl.search=new URLSearchParams({client_id:config.clientId,logout_uri:config.logoutUri}).toString();
    return Response.json({logoutUrl:logoutUrl.toString()},{headers});
  }catch(error){return denied(error);}
}
