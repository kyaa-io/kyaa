import { createOperatorNoticeDependencies } from "../../../../../../server/notice/notice-dependencies";
import { createNoticeListHandlers } from "../../../../../../server/notice/notice-admin-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = createNoticeListHandlers(() => createOperatorNoticeDependencies() as never);
