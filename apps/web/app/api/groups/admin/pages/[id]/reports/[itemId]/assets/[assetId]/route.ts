import {groupReportMediaRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{id:string;itemId:string;assetId:string}>}){return groupReportMediaRoute(request,await context.params);}
export const HEAD=GET;
