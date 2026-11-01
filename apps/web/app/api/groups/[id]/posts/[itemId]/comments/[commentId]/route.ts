import {groupRoute} from "@/server/groups/dependencies";
export const dynamic="force-dynamic";
export async function DELETE(request:Request,context:{params:Promise<{id:string;itemId:string;commentId:string}>}){const params=await context.params;return groupRoute("comment-remove",request,{id:params.id,itemId:params.commentId,postId:params.itemId});}
