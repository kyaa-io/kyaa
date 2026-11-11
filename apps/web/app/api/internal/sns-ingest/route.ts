import { createSnsIngestDependencies } from "@/server/sns-ingest/dependencies";
import { createSnsIngestHandler } from "@/server/sns-ingest/route-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export const POST = createSnsIngestHandler(createSnsIngestDependencies);
