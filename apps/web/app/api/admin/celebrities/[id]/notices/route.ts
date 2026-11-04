import { createNoticeDependencies } from "../../../../../../server/notice/notice-dependencies";
import { createNoticeListHandlers } from "../../../../../../server/notice/notice-admin-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = createNoticeListHandlers(() => {
  const deps = createNoticeDependencies();
  return {
    repository: deps.repository as never,
    authorize: (input) => deps.authorize({ authorization: input.authorization, correlationId: input.correlationId }),
  };
});
