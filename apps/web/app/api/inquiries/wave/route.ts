import { wavePost } from "@/server/inquiries/wave-api";
import { waveOptions } from "@/server/inquiries/wave-route";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const OPTIONS = waveOptions;
export function POST(request: Request) { return wavePost(request, false); }
