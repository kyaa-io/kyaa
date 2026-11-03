import {groupBenefitsRoute} from '@/server/group-benefits/dependencies';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>groupBenefitsRoute(request);
