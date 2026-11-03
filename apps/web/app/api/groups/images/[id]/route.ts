import {createMobileMediaRouteHandlers,mediaUnavailable}from "@/server/mobile-media/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=="true")return new Response(null,{status:404});
 try{return await createMobileMediaRouteHandlers().read(request,(await context.params).id,false,false,true);}catch{return mediaUnavailable();}
}
export const HEAD=GET;
