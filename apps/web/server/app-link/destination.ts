import "server-only";

const LOCAL_ORIGIN = "https://byus.local";
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const JWT_VALUE = /(?:^|[^A-Za-z0-9_-])[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:$|[^A-Za-z0-9_-])/;
const SENSITIVE_QUERY_KEYS = new Set(["accesstoken", "refreshtoken", "idtoken", "token", "jwt", "authorization", "bearer"]);
const BLOCKED_PATHS = ["/api", "/admin", "/open-app", "/_next", "/login", "/auth", "/onboarding"];
const SAFE_PATHS=[
 /^\/$/,/^\/s\/[a-f0-9]{32}$/i,/^\/c\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9-]+)*$/i,
 /^\/live(?:\/(?:calendar(?:\/schedules\/[0-9a-f-]{36})?|[a-z0-9]+(?:-[a-z0-9]+)*(?:\/(?:missions|survey))?))?$/i,
 /^\/benefits(?:\/[0-9a-f-]{36})?$/i,/^\/(?:my(?:\/(?:activity|raffles|community-stamps))?|passports(?:\/[0-9a-f-]{36})?|stamps\/[0-9a-f-]{36}|notifications|settings|celebrities|community|guide|privacy|terms|bias(?:\/promotion)?|pages\/[a-z0-9-]+)$/i,
 /^\/(?:(?:messages|support|activities)\/[0-9a-f-]{36}|people\/[0-9a-f-]{36}\/friend-request)$/i,
 /^\/fans\/profile-links\/[0-9a-f-]{36}$/i,
 /^\/participation\/(?:events|spaces)\/[0-9a-f-]{36}$/i,
 /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/i,
];
const SAFE_QUERY_KEYS = new Set(["locale", "tab", "section", "media", "authIntent", "invite", "campaign_link", "utm_source", "utm_medium", "utm_campaign", "utm_content", "owned", "role", "favorite"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_VALUE = /^[\p{L}\p{N}._~-]{1,100}$/u;
const LOCALES = new Set(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es", "id", "vi", "th", "pt", "fr"]);

export type AppLinkDestination = {
  returnTo: string;
  appUrl: string;
  valid: boolean;
  kind: "passport" | "creator" | "live" | "benefit" | "content";
  webReturnTo?: string;
};

function destinationKind(pathname: string): AppLinkDestination["kind"] {
  if (/^\/s\/[a-f0-9]{32}$/i.test(pathname)) return "passport";
  if (/^\/live\//.test(pathname)) return "live";
  if (/^\/(?:benefits|my\/raffles)(?:\/|$)/.test(pathname)) return "benefit";
  if (/^\/c\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/|$)/i.test(pathname)||/^\/(?!my$|settings$|community$|guide$|privacy$|terms$|benefits$|live$|passports$|celebrities$|notifications$|bias$|pages$)[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(pathname)) return "creator";
  return "content";
}

function normalizedKey(value: string) { return value.toLowerCase().replaceAll(/[-_]/g, ""); }
function safeQueryValue(key:string,value:string){
  if(key==="locale")return LOCALES.has(value);
  if(key==="authIntent"||key==="campaign_link")return UUID.test(value);
  if(key==="favorite")return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  if(key==="owned")return value==="0"||value==="1";
  if(key==="invite")return /^[A-Za-z0-9-]{6,64}$/.test(value);
  return SAFE_VALUE.test(value);
}

export function safeAppReturnTo(value: string | string[] | null | undefined): string | null {
  if (typeof value !== "string" || !value || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || CONTROL_CHARACTER.test(value)) return null;
  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (parsed.origin !== LOCAL_ORIGIN || parsed.username || parsed.password || decodedPath.startsWith("//") || decodedPath.includes("\\") || CONTROL_CHARACTER.test(decodedPath)) return null;
    if (BLOCKED_PATHS.some(path => decodedPath === path || decodedPath.startsWith(`${path}/`))) return null;
    if(!SAFE_PATHS.some(pattern=>pattern.test(decodedPath)))return null;
    if(decodedPath.startsWith("/participation/")&&!UUID.test(decodedPath.split("/")[3]))return null;
    if (/^\/(?:messages|people|support|activities|stamps)\//.test(decodedPath) && !UUID.test(decodedPath.split("/")[2])) return null;
    for (const key of parsed.searchParams.keys()) {
      const values=parsed.searchParams.getAll(key);
      if (!SAFE_QUERY_KEYS.has(key) || values.length!==1 || SENSITIVE_QUERY_KEYS.has(normalizedKey(key)) || !safeQueryValue(key,values[0]) || JWT_VALUE.test(` ${values[0]} `)) return null;
    }
    const hash=decodeURIComponent(parsed.hash);
    if (hash && !/^#[A-Za-z0-9_-]{1,80}$/.test(hash)) return null;
    if (JWT_VALUE.test(` ${hash} `) || /(?:access|refresh|id)[_-]?token|authorization|bearer/i.test(hash)) return null;
    return value;
  } catch { return null; }
}

export function resolveAppLinkDestination(value: string | string[] | null | undefined): AppLinkDestination {
  const safe = safeAppReturnTo(value);
  const returnTo = safe ?? "/";
  const url = new URL("kyaa-app:///open");
  url.searchParams.set("returnTo", returnTo);
  const path = new URL(returnTo, LOCAL_ORIGIN).pathname;
  return { returnTo, appUrl: url.toString(), valid: safe !== null, kind: destinationKind(path),
    ...(/^\/c\/([a-z0-9]+(?:-[a-z0-9]+)*)\/clips\/[0-9a-f-]{36}$/i.test(path) ? { webReturnTo: path.split("/").slice(0,3).join("/") } : {}),
    ...(/^\/(?:participation|people|messages|support|activities)\//.test(path) || path === "/my/community-stamps" ? { webReturnTo: "/" } : {}) };
}

function appStoreUrl(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && url.hostname === "apps.apple.com" && /\/id\d+$/.test(url.pathname) ? url.toString() : null; } catch { return null; }
}
function playStoreUrl(value: string | undefined) {
  if (!value) return null;
  try { const url = new URL(value), ids = url.searchParams.getAll("id"); return url.protocol === "https:" && url.hostname === "play.google.com" && url.pathname === "/store/apps/details" && ids.length === 1 && /^[A-Za-z][A-Za-z0-9_.]{2,199}$/.test(ids[0]) ? url.toString() : null; } catch { return null; }
}

export function readKyaaStoreLinks(environment:Readonly<Record<string,string|undefined>> = process.env) {
  return { apple: appStoreUrl(environment.NEXT_PUBLIC_KYAA_APP_STORE_URL), google: playStoreUrl(environment.NEXT_PUBLIC_KYAA_PLAY_STORE_URL) };
}
