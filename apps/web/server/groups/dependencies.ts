import "server-only";
import { SECRET_ROOMS_ENABLED } from "@/features/groups/secret-room-config";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { secretRoomClosedResponse } from "./secret-room-closed";
import { createGroupHandler, groupsUnavailable, type GroupOperation } from "./routes";
import { createLeaderPassHandler, type LeaderPassOperation } from "./leader-pass";
export async function groupRoute(operation: GroupOperation, request: Request, params: { id?: string; itemId?: string; slug?: string; postId?:string } = {}) {
  if (!SECRET_ROOMS_ENABLED && ["rooms", "room", "room-state", "messages", "message", "room-read"].includes(operation)) return secretRoomClosedResponse(request.method, operation === "rooms" || operation === "messages");
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

export async function leaderPassRoute(operation: LeaderPassOperation, request: Request, params: { id?: string } = {}) {
  if (process.env.KYAA_GROUPS_ENABLED !== "true") return Response.json({ error: { code: "GROUPS_NOT_FOUND" } }, { status: 404, headers: { "cache-control": "private, no-store" } });
  try { return await createLeaderPassHandler(createFanpageDependencies())(operation, request, params); } catch { return groupsUnavailable(); }
}
