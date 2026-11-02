import {groupInvitationRoute} from '@/server/group-invitations/dependencies';
export const dynamic='force-dynamic';
export async function DELETE(request:Request,context:{params:Promise<{id:string;invitationId:string}>}){const p=await context.params;return groupInvitationRoute('revoke',request,{pageId:p.id,invitationId:p.invitationId});}
