import { after } from "next/server";
import { EMAIL_BROWSER_COOKIE, emailBrowserSession, logoutEmailBrowser } from "./email-browser";
import "server-only";
import { z } from "zod";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import { preferredLocaleSchema } from "../../../features/profile/domain/preferred-locale";
import { sanitizeLocale, sanitizeReturnTo } from "../../../components/login-intent";
import { appOriginForRequest } from "../../config/app-origin";
import { loadServerEnv } from "../../config/env";
import { cognitoCleanupConfig, cognitoConfig } from "./config";
import { createCognitoVerifier, COGNITO_TOKEN_PREFIX, cognitoDenied } from "./verifier";
import { resolveKyaaMember, signInKyaaMember, SignInBlockedError } from "./kyaa-identity";
import { SESSION_LIFETIME_MS, authHeaders, challenge, cookie, FLOW_COOKIE, opaque, readCookie, readSession, requireOrigin, revokeSession, retryRemoteRevocations, seal, SESSION_COOKIE, tokenRequest, unseal, writeSession } from "./browser-session";

const flowSchema = z.object({ state: z.string(), verifier: z.string(), nonce: z.string(), expiresAt: z.number(), returnTo: z.string(), locale: preferredLocaleSchema.default("ko") });
function denied(error: unknown): Response {
  return Response.json({ error: { code: error instanceof AuthError ? error.code : "AUTH_UNAVAILABLE" } }, { status: error instanceof AuthError ? error.status : 503, headers: authHeaders() });
}
function retiredLogin(headers = authHeaders(), context?: {returnTo: string | null; locale: string | null}): Response {
  const destination = new URL("/login", loadServerEnv().NEXT_PUBLIC_APP_URL);
  if (context) {
    const returnTo = sanitizeReturnTo(context.returnTo);
    destination.searchParams.set("returnTo", /^\/(?:api\/)?auth\/cognito(?:[/?#]|$)/i.test(returnTo) ? "/" : returnTo);
    destination.searchParams.set("locale", sanitizeLocale(context.locale));
  }
  headers.set("location", destination.toString());
  headers.set("set-cookie", cookie(FLOW_COOKIE, "", 0));
  return new Response(null, { status: 303, headers });
}
export async function start(request: Request): Promise<Response> {
  try {
    if (loadServerEnv().AUTH_PROVIDER !== "cognito") {
      const query = new URL(request.url).searchParams;
      return retiredLogin(authHeaders(), { returnTo: query.get("returnTo"), locale: query.get("locale") });
    }
    const config = cognitoConfig();
    // Entry is a navigation; the authorization state is bound to an encrypted, same-site cookie.
    if (request.headers.get("sec-fetch-site") === "cross-site") throw cognitoDenied();
    if (appOriginForRequest(request,config.origin)!==config.origin) {
      const canonical=new URL("/api/auth/cognito/start",config.origin);
      canonical.search=new URL(request.url).search;
      const headers=authHeaders();headers.set("location",canonical.toString());
      return new Response(null,{status:303,headers});
    }
    const query = new URL(request.url).searchParams;
    const provider = z.enum(["google", "apple", "kakao"]).parse(query.get("provider"));
    if (provider === "kakao" && !loadServerEnv().COGNITO_KAKAO_ENABLED) throw cognitoDenied();
    const state = opaque(), verifier = opaque(), nonce = opaque();
    const returnTo = sanitizeReturnTo(query.get("returnTo"));
    const locale = sanitizeLocale(query.get("locale"));
    const url = new URL("/oauth2/authorize", config.domain);
    url.search = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, scope: "openid email profile", state, nonce, code_challenge: challenge(verifier), code_challenge_method: "S256", identity_provider: provider === "google" ? "Google" : provider === "apple" ? "SignInWithApple" : "Kakao" }).toString();
    const headers = authHeaders();
    headers.set("location", url.toString());
    headers.set("set-cookie", cookie(FLOW_COOKIE, seal({ state, verifier, nonce, expiresAt: Date.now()+600_000, returnTo, locale }, config.cookieSecret),600));
    return new Response(null, { status: 303, headers });
  } catch (error) { return denied(error); }
}
export async function callback(request: Request): Promise<Response> {
  const headers = authHeaders(); headers.set("set-cookie",cookie(FLOW_COOKIE,"",0));
  if (loadServerEnv().AUTH_PROVIDER !== "cognito") {
    try {
      const config = cognitoCleanupConfig(), url = new URL(request.url);
      const encoded = readCookie(request, FLOW_COOKIE);
      if (!encoded || appOriginForRequest(request, config.origin) !== config.origin || url.pathname !== new URL(config.redirectUri).pathname || url.searchParams.getAll("state").length !== 1 || url.searchParams.has("error")) throw cognitoDenied();
      const flow = flowSchema.parse(unseal(encoded, config.cookieSecret));
      if (flow.state !== url.searchParams.get("state") || flow.expiresAt <= Date.now()) throw cognitoDenied();
      return retiredLogin(headers, flow);
    } catch { return retiredLogin(headers); }
  }
  let flow: z.infer<typeof flowSchema> | null = null;
  try {
    const config = cognitoConfig();
    const url = new URL(request.url);
    // CloudFront changes the origin Host; the registered callback path and OAuth redirect URI remain canonical.
    if (appOriginForRequest(request,config.origin) !== config.origin || url.pathname !== new URL(config.redirectUri).pathname || url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length !== 1) throw cognitoDenied();
    const encoded = readCookie(request,FLOW_COOKIE);
    if (!encoded) throw cognitoDenied();
    const parsed = flowSchema.parse(unseal(encoded,config.cookieSecret));
    if (parsed.state !== url.searchParams.get("state") || parsed.expiresAt <= Date.now()) throw cognitoDenied();
    // Only a flow this browser started keeps its return path and locale on the failure page.
    flow = parsed;
    if (url.searchParams.has("error")) throw cognitoDenied();
    const tokens = await tokenRequest(config,new URLSearchParams({ grant_type:"authorization_code",client_id:config.clientId,redirect_uri:config.redirectUri,code:url.searchParams.get("code")!,code_verifier:flow.verifier }));
    if (!tokens.refresh_token) throw cognitoDenied();
    const verify = createCognitoVerifier(config);
    const [access,id] = await Promise.all([verify(tokens.access_token),verify(tokens.id_token,"id",flow.nonce)]);
    if (access.subject !== id.subject || !id.email) throw cognitoDenied();
    const destination = new URL("/login",config.origin);
    destination.searchParams.set("returnTo",flow.returnTo);
    destination.searchParams.set("locale",flow.locale);
    try { await signInKyaaMember(id); }
    catch (error) {
      if (!(error instanceof SignInBlockedError)) throw error;
      // No session for a blocked sign-in: the login page explains the reason (recovery/review), never merges by email.
      destination.searchParams.set("authError",error.reason);
      headers.set("location",destination.toString());
      return new Response(null,{status:303,headers});
    }
    const key=opaque();
    await writeSession(key,{ preferredLocale:flow.locale, accessToken:tokens.access_token,idToken:tokens.id_token,refreshToken:tokens.refresh_token,subject:id.subject,expiresAt:Date.now()+tokens.expires_in*1000,sessionExpiresAt:Date.now()+SESSION_LIFETIME_MS },config);
    headers.append("set-cookie",cookie(EMAIL_BROWSER_COOKIE,"",0));
    headers.append("set-cookie",cookie(SESSION_COOKIE,key,SESSION_LIFETIME_MS/1000));headers.set("location",destination.toString());
    return new Response(null,{status:303,headers});
  } catch {
    // Cancelled provider screen, unverified email, storage or issuance failure: back to the login page, never a JSON page.
    // No session is created and nothing from the request is echoed except a flow-validated return path.
    const destination = new URL("/login", loadServerEnv().NEXT_PUBLIC_APP_URL);
    if (flow) { destination.searchParams.set("returnTo", flow.returnTo); destination.searchParams.set("locale", flow.locale); }
    destination.searchParams.set("authError", "callback_failed");
    headers.set("location", destination.toString());
    return new Response(null, { status: 303, headers });
  }
}
export async function session(request: Request): Promise<Response> {
  try {
    if (loadServerEnv().AUTH_PROVIDER !== "cognito") throw cognitoDenied();
    if (readCookie(request, EMAIL_BROWSER_COOKIE)) return await emailBrowserSession(request);
    const config=cognitoConfig();
    // Same-origin fetches only; GET carries no tokens across cross-site contexts.
    if (request.headers.get("sec-fetch-site") === "cross-site") throw cognitoDenied();
    const {session}=await readSession(request,config);
    const identity=await createCognitoVerifier(config)(session.accessToken);
    const member=await resolveKyaaMember(identity,loadServerEnv().GIWA_CHAIN_ID);
    if(!member)throw cognitoDenied();
    // walletLinked stays for older open tabs; every resolved member already has its wallet record.
    return Response.json({authenticated:true,walletLinked:true,userId:member.identityKey,accessToken:COGNITO_TOKEN_PREFIX+session.accessToken,expiresAt:session.expiresAt},{headers:authHeaders()});
  }catch(error){return denied(error);}
}
export async function logout(request: Request): Promise<Response> {
  try {
    const disabled=loadServerEnv().AUTH_PROVIDER !== "cognito";
    const config=disabled ? cognitoCleanupConfig() : cognitoConfig();requireOrigin(request,config);
    if (readCookie(request, EMAIL_BROWSER_COOKIE)) {
      await logoutEmailBrowser(request);
      const headers=authHeaders(); headers.append("set-cookie",cookie(EMAIL_BROWSER_COOKIE,"",0)); headers.append("set-cookie",cookie(SESSION_COOKIE,"",0));
      return Response.json({logoutUrl:null},{headers});
    }
    const key=readCookie(request,SESSION_COOKIE);
    if((!key && !disabled) || (key && key.length!==43))throw cognitoDenied();
    if(key)await revokeSession(key,config);
    after(async () => {
      try { await retryRemoteRevocations(config); } catch { console.error("COGNITO_REMOTE_REVOCATION_PENDING"); }
    });
    const headers=authHeaders();headers.set("set-cookie",cookie(SESSION_COOKIE,"",0));
    if(disabled)return Response.json({logoutUrl:null},{headers});
    const logoutUrl=new URL("/logout",config.domain);logoutUrl.search=new URLSearchParams({client_id:config.clientId,logout_uri:config.logoutUri}).toString();
    return Response.json({logoutUrl:logoutUrl.toString()},{headers});
  }catch(error){return denied(error);}
}
