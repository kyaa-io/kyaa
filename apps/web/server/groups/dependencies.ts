import "server-only";
import { SECRET_ROOMS_ENABLED } from "@/features/groups/secret-room-config";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createGroupHandler, groupsUnavailable, type GroupOperation } from "./routes";
export async function groupRoute(operation: GroupOperation, request: Request, params: { id?: string; itemId?: string; slug?: string; postId?:string } = {}) {
  if (!SECRET_ROOMS_ENABLED && ["rooms", "room", "room-state", "messages", "message", "room-read"].includes(operation)) return Response.json({ error: { code: "SECRET_ROOM_COMING_SOON", message: "준비 중" } }, { status: 503, headers: { "cache-control": "private, no-store" } });
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
  try { return await createGroupHandler(createFanpageDependencies())(operation, request, params); } catch { return groupsUnavailable(); }
}

export async function groupReportMediaRoute(request:Request,params:{id:string;itemId:string;assetId:string}) {
 if(process.env.KYAA_GROUPS_ENABLED!=="true")return new Response(null,{status:404});
 try {
  const [{createGroupReportMediaHandler},{createMediaProcessorRuntime},{storageObjectResponse},{MEDIA_BUCKET}]=await Promise.all([import("./admin-media"),import("@/server/mobile-media/processor-runtime"),import("@/server/storage/transport"),import("@/server/mobile-media/domain")]);
  const {storage}=createMediaProcessorRuntime();
  return await createGroupReportMediaHandler({...createFanpageDependencies(),stream:(path,range,method)=>storageObjectResponse(storage,MEDIA_BUCKET,path,{range,method,signal:AbortSignal.timeout(120_000)})})(request,params);
 }catch{return groupsUnavailable();}
}
