import "server-only";

const PUBLIC_PATHS = ["/open-app", "/c/*", "/live", "/live/*", "/my", "/my/*", "/passports", "/passports/*", "/stamps/*", "/benefits", "/benefits/*", "/fans/profile-links/*"];

export function appAssociationResponse(request: Request, platform: "apple" | "android") {
  const origin = process.env.MOBILE_APP_LINK_ORIGIN;
  const unavailable = () => new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://") || new URL(request.url).origin !== origin) return unavailable();
  } catch { return unavailable(); }

  const headers = { "Cache-Control": "public, max-age=300", "Content-Type": "application/json" };
  if (platform === "apple") {
    const team = process.env.APPLE_TEAM_ID;
    if (!team || !/^[A-Z0-9]{10}$/.test(team)) return unavailable();
    return Response.json({ applinks: { details: [{ appIDs: [`${team}.kr.kyaa.app`], components: PUBLIC_PATHS.map(path => ({ "/": path })) }] } }, { headers });
  }
  const certificates = [...new Set((process.env.MOBILE_ANDROID_SHA256_CERTIFICATES ?? "").split(",").map(value => value.trim().toUpperCase()))];
  if (!certificates.length || certificates.some(value => !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) return unavailable();
  return Response.json([{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "kr.kyaa.app", sha256_cert_fingerprints: certificates } }], { headers });
}
