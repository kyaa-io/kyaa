import { createNoticeDependencies } from "../../../../../../../../server/notice/notice-dependencies";
import { createNoticeAssetHandler } from "../../../../../../../../server/notice/notice-admin-handlers";

export const runtime = "nodejs";

export const POST = createNoticeAssetHandler(() => {
  const deps = createNoticeDependencies();
  return {
    repository: deps.repository as never,
    authorize: (input) => deps.authorize({ authorization: input.authorization, correlationId: input.correlationId }),
  };
});
