import {groupInvitationRoute} from '@/server/group-invitations/dependencies';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return groupInvitationRoute('list',request,{pageId:(await context.params).id});}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return groupInvitationRoute('create',request,{pageId:(await context.params).id});}
