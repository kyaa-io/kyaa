import {createFanpageDependencies} from '@/server/fanpage/dependencies';
import {createPageNoticeHandler} from '@/server/page-notices/routes';
import {contentFailure} from '@/server/fan-posts/routes';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return await createPageNoticeHandler(createFanpageDependencies())(request);}catch(error){return contentFailure(error);}}
export const POST=GET;
