import 'server-only';
import {createFanpageDependencies} from '@/server/fanpage/dependencies';
import {createGroupBenefitsHandler,groupBenefitsUnavailable} from './routes';
export async function groupBenefitsRoute(request:Request){
 if(process.env.KYAA_GROUPS_ENABLED!=='true')return Response.json({error:{code:'GROUPS_NOT_FOUND'}},{status:404,headers:{'cache-control':'private, no-store'}});
 try{return await createGroupBenefitsHandler(createFanpageDependencies())(request);}catch{return groupBenefitsUnavailable();}
}
