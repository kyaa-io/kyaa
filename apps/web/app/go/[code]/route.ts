import { SITE_URL } from "@/seo/metadata";
import { shortLink, shortLinkDestination } from "@/features/analytics/domain/short-links";
import { isOutboundPreview, recordOutboundVisit } from "../outbound-visit";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { code } = await params;
  const link = shortLink(code);
  // Link previews get the same page without tags, so the card matches where the click goes.
  let destination = new URL(link?.path ?? "/", SITE_URL);
  if (link && !isOutboundPreview(request)) {
    destination = shortLinkDestination(link, SITE_URL);
    if (request.method === "GET") await recordOutboundVisit(link.visit);
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: destination.href,
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}

export async function HEAD(request: Request, context: Context): Promise<Response> {
  return GET(new Request(request, { method: "HEAD" }), context);
}
