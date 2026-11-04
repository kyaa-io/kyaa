import { createOperatorNoticeDependencies } from "../../../../../../../../server/notice/notice-dependencies";
import { createNoticeAssetHandler } from "../../../../../../../../server/notice/notice-admin-handlers";

export const runtime = "nodejs";

export const POST = createNoticeAssetHandler(() => createOperatorNoticeDependencies() as never);
