import {groupInvitationRoute} from '@/server/group-invitations/dependencies';
export const dynamic='force-dynamic';
export async function POST(request:Request,context:{params:Promise<{invitationId:string}>}){return groupInvitationRoute('handoff',request,await context.params);}
