import { isOutboundPreview, recordOutboundVisit } from "../outbound-visit";

export const dynamic = "force-dynamic";

const destination = "https://www.ehyundai.com/newCulture/EH/EH000001_V.do?seq=2092865&bbsCd=210&eventState=";
const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow",
};

export async function GET(request: Request): Promise<Response> {
  if (request.method === "GET" && !isOutboundPreview(request)) {
    await recordOutboundVisit("elina-banksy-instagram");
  }

  return new Response(null, { status: 302, headers: { ...headers, location: destination } });
}

// Explicit HEAD prevents Next.js from counting its automatic GET fallback.
export async function HEAD(request: Request): Promise<Response> {
  return GET(new Request(request, { method: "HEAD" }));
}
