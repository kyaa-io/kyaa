import {createMobileMediaRouteHandlers,mediaUnavailable} from '@/server/mobile-media/dependencies';
export const dynamic='force-dynamic';export const runtime='nodejs';
async function read(request:Request,context:{params:Promise<{id:string}>}){try{return await createMobileMediaRouteHandlers().read(request,(await context.params).id,false,false,false,true);}catch{return mediaUnavailable();}}
export const GET=read;export const HEAD=read;
