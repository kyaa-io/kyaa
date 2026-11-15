export const dynamic = "force-dynamic";

export function GET(): Response {
  const revision = /^[a-f0-9]{40}$/.test(process.env.RELEASE_SHA ?? "") ? process.env.RELEASE_SHA : undefined;
  return Response.json({ status: "ok", ...(revision ? { revision } : {}) }, { headers: { "cache-control": "no-store" } });
}
