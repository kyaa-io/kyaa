import {createFanpageDependencies} from '@/server/fanpage/dependencies';
import {createCollectionImportHandler} from '@/server/group-collection-import/routes';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')return Response.json({error:{code:'GROUPS_NOT_FOUND'}},{status:404});
 try{return await createCollectionImportHandler(createFanpageDependencies())(request,(await context.params).id);}catch{return Response.json({error:{code:'COLLECTION_IMPORT_UNAVAILABLE'}},{status:503,headers:{'cache-control':'private, no-store'}});}
}
