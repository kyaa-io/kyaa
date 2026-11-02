import {groupRoute} from '@/server/groups/dependencies';
export const GET=(request:Request)=>groupRoute('own-reports',request);
