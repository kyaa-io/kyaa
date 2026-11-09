import "server-only";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createInstaRepostHandlers } from "./routes";

export function createInstaRepostRouteHandlers() {
  const { rpc, authorize, authorizeAdmin } = createFanpageDependencies();
  // The story capture is streamed from the private media bucket; the storage path never reaches the browser.
  const stream = async (path: string) => {
    const [{ createMediaProcessorRuntime }, { storageObjectResponse }, { MEDIA_BUCKET }] = await Promise.all([
      import("@/server/mobile-media/processor-runtime"), import("@/server/storage/transport"), import("@/server/mobile-media/domain")]);
    return storageObjectResponse(createMediaProcessorRuntime().storage, MEDIA_BUCKET, path, { signal: AbortSignal.timeout(30_000) });
  };
  return createInstaRepostHandlers({ rpc, authorize, authorizeAdmin, stream });
}
