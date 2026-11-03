import {withWaveAccess} from '@/server/wave/access';
import {createContentDependencies} from '@/server/fan-posts/dependencies';
import {contentFailure,createContentHandlers} from '@/server/fan-posts/routes';
export const runtime='nodejs';export const dynamic='force-dynamic';
export const GET=withWaveAccess(async(request:Request,context:{params:Promise<{slug:string}>})=>{try{return await createContentHandlers(createContentDependencies()).attachmentPolicy(request,(await context.params).slug);}catch(error){return contentFailure(error);}});
