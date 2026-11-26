import { SITE_URL } from "@/seo/metadata";
import { isOutboundPreview, recordOutboundVisit } from "../outbound-visit";

export const dynamic = "force-dynamic";

const campaigns = new Map([
  ["vtuber", "streamer_outreach"],
  ["idol", "idol_outreach_kr"],
  ["idol-jp", "idol_outreach_jp"],
  ["news", "newstip"],
  ["ig", "instagram_dm"],
]);

type Context = { params: Promise<{ code: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const { code } = await params;
  const campaign = campaigns.get(code);
  const destination = new URL("/", SITE_URL);
  if (campaign && !isOutboundPreview(request)) {
    destination.search = new URLSearchParams({
      utm_source: "x",
      utm_medium: "dm",
      utm_campaign: campaign,
    }).toString();
    // The existing visit table accepts hyphens, while UTM names use underscores.
    if (request.method === "GET") await recordOutboundVisit(campaign.replaceAll("_", "-"));
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
