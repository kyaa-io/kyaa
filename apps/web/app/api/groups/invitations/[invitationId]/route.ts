import {groupInvitationRoute} from '@/server/group-invitations/dependencies';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{invitationId:string}>}){return groupInvitationRoute('preview',request,await context.params);}
export async function POST(request:Request,context:{params:Promise<{invitationId:string}>}){return groupInvitationRoute('decide',request,await context.params);}
