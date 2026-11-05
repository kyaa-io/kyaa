import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { readProofMissions } from "./proof-missions";
import { createProofHandlers } from "./proofs";
import { createDukjilHandlers } from "./routes";

export function createDukjilRouteHandlers() {
  const { rpc, authorize } = createFanpageDependencies();
  return createDukjilHandlers({ rpc, authorize });
}

export function createProofRouteHandlers() {
  const { rpc, authorize } = createFanpageDependencies();
  // The masked proof image is streamed through the API; the private bucket path never leaves the server.
  const stream = async (path: string) => {
    const [{ createMediaProcessorRuntime }, { storageObjectResponse }] = await Promise.all([import("@/server/mobile-media/processor-runtime"), import("@/server/storage/transport")]);
    return storageObjectResponse(createMediaProcessorRuntime().storage, "certification-proofs", path, { signal: AbortSignal.timeout(30_000) });
  };
  return createProofHandlers({ rpc, authorize, stream, readMissions: readProofMissions });
}
