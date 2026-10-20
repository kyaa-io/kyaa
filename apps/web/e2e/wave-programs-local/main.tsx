import { KyaaWaveParticipationScreen } from "../../features/connect/kyaa-wave-participation-screen";
import { WaveDrawManager } from "../../components/admin/wave-draw-manager";
import { WAVE_PRIZES, type WaveDrawResponse } from "../../features/fanpage/domain/wave-draw";
import { WaveAccessBoundary } from "../../features/fanpage/ui/wave-access-boundary";
import { WAVE_MISSIONS } from "../../features/fanpage/domain/wave-missions";
import { createRoot } from "react-dom/client";
import { CelebrityDirectory } from "../../components/celebrity-directory";
import { parseFanPageTab, resolveBoardSection, resolveBoardSource } from "../../features/fanpage/domain/board-navigation";
import { CelebrityFanPage } from "../../components/celebrity-fan-page";
import { WaveProgramPage } from "../../features/fanpage/ui/wave-programs";
import { FanPostDetail } from "../../features/fan-posts/ui/fan-post-detail";
import { FanAppFrame, FanContentContainer } from "../../components/fan-shell/fan-app-shell";
import { WAVE_FANPAGE_SLUG, WAVE_PROGRAMS, waveProgramKeySchema } from "../../features/fanpage/domain/wave-programs";
import { APP_LOCALES } from "../../i18n/locales";
import type { PublishedCelebrity } from "../../server/content/content-domain";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
const query = new URLSearchParams(location.search), locale = APP_LOCALES.find(value => value === query.get("locale")) ?? "ko";
document.documentElement.lang = locale;
const creator: PublishedCelebrity = { slug: WAVE_FANPAGE_SLUG, locale: "ko", name: "Kyaa Wave", summary: "2026. 10. 22. · Dragon Hill Lodge", image: { url: "https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/public-image-assets/c18eeb359899ebabae5a2cf9601cb7af2bec07da11d10f12d6ce2ef4df743eee.webp", alt: "kyaa 로고", position: "center", photos: { profile: { asset: { id: "10000000-0000-4000-8000-000000000099", url: "https://gmrykvmtmuaeswpajteq.supabase.co/storage/v1/object/public/cms-assets/public-image-assets/c18eeb359899ebabae5a2cf9601cb7af2bec07da11d10f12d6ce2ef4df743eee.webp", width: 1200, height: 600, mimeType: "image/webp", revision: 1 }, alt: { ko: "kyaa 로고", en: "kyaa logo" }, frames: {}, revision: 1 } } }, roles: ["brand"], websiteUrl: "https://kyaawave.com/", socialLinks: [], themes: [], displayOrder: 0, fanCount: 0 };
const key = waveProgramKeySchema.safeParse(location.pathname.split("/programs/")[1]?.split("/")[0]);
const program = key.success ? key.data : "live-insight";
const id = "10000000-0000-4000-8000-000000000001", assetId = "10000000-0000-4000-8000-000000000002";
const post = { id, celebritySlug: WAVE_FANPAGE_SLUG, body: "함께 나눈 이야기를 사진으로 남겨요.", visibility: "public", revision: 1, author: { nickname: "별빛팬", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [{ id: assetId, width: 1672, height: 940 }], createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:00:00Z", isOwner: true, likeCount: 2, liked: false, commentCount: 0 };
const posts = query.get("state") === "empty" ? [] : [post];
const comments: { id: string; body: string; nickname: string; avatarUrl: string; createdAt: string; isOwner: boolean }[] = [];
const earned = new Set<string>(query.get("earned") === "all" ? WAVE_PROGRAMS.map(p => p.key) : []);
const friendToken = "70000000-0000-4000-8000-000000000001";
const friends = query.get("friends") === "populated" ? ["friends", "friends", "incoming", "outgoing"].map((status, index) => ({ id: `71000000-0000-4000-8000-00000000000${index}`, profileId: `72000000-0000-4000-8000-00000000000${index}`, nickname: ["음악을 좋아하는 지민", "Alex · 함께 나누는 오늘의 이야기", "하늘", "민서"][index], avatarUrl: `/images/avatars/${index % 2 ? "heart-lavender" : "star-pink"}.webp`, status })) : [];
const cheers: {id:string;body:string;nickname:string;avatarUrl:string;createdAt:string;isOwner:boolean;clapCount:number;viewerClapped:boolean;replyCount:number}[]=[];
const messages: { id: string; text: string; createdAt: string; isMine: boolean }[] = [];
const drawData: WaveDrawResponse = { entry: null, tickets: 5, draw: query.get("draw") === "done" ? {id,executedAt:"2026-10-22T00:00:00Z",revealedThrough:10} : null, result: query.get("draw") === "done" ? {status:"won",prizeKey:"blue"} : {status:"not_entered"}, published: [] };
const album = {...post,author:{...post.author,profileId:"72000000-0000-4000-8000-000000000009"},assets:Array.from({length:5},(_,index)=>({id:`10000000-0000-4000-8000-00000000001${index}`,kind:"image",width:1672,height:940,durationSeconds:null})),commentPreview:null};
const albums = query.get("state") === "empty" ? [] : [album];
function drawResults() { return WAVE_PRIZES.slice(0,drawData.draw?.revealedThrough ?? 0).map(prize=>({prizeKey:prize.key,winners:[{nickname:"별빛팬",avatarUrl:"/images/avatars/star-pink.webp"}]})); }
const uploadAssets = new Map<string, {kind:string;purpose:string;contentType:string;byteSize:number}>();
const realFetch = window.fetch.bind(window);
const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, {status}));
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
 const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
 if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
 const method = init?.method ?? "GET";
 if (url.pathname === "/api/admin/session") return json({admin:{email:"fixture@example.test",role:query.get("role") ?? "admin"}});
 if (url.pathname.startsWith("/api/admin/kyaa-wave/draw")) {
  if(method === "POST") {
   if(url.pathname.endsWith("/reveal")) drawData.draw!.revealedThrough=JSON.parse(String(init?.body)).prizeIndex;
   else drawData.draw={id,executedAt:new Date().toISOString(),revealedThrough:0};
  }
  return json({draw:drawData.draw,entryCount:80,results:drawResults()});
 }
 if (url.pathname === "/api/kyaa-wave/draw") {
  if(method === "PUT") {drawData.entry={preferences:JSON.parse(String(init?.body)).preferences,updatedAt:new Date().toISOString()};return json({ok:true});}
  return json({...drawData,published:drawResults()});
 }
 if(url.pathname === "/api/me/media/uploads" && method === "POST") {
  const value=JSON.parse(String(init?.body)), uploadId=crypto.randomUUID();uploadAssets.set(uploadId,value);
  return json({assetId:uploadId,uploadUrl:`${location.origin}/api/fixture-upload/${uploadId}`,uploadToken:"fixture",expiresAt:"2026-10-22T00:00:00Z",replayed:false});
 }
 if(url.pathname.startsWith("/api/fixture-upload/"))return json({ok:true});
 if(url.pathname.startsWith("/api/me/media/uploads/")) {
  const uploadId=url.pathname.split("/")[5], value=uploadAssets.get(uploadId)!;
  if(method === "DELETE")return json({ok:true});
  return json({kind:value.kind,purpose:value.purpose,contentType:value.contentType,byteSize:value.byteSize,assetId:uploadId,state:"ready",assetVersion:1,width:1672,height:940,durationSeconds:value.kind === "video" ? 1 : null,failureCode:null,retryAt:null,expiresAt:"2026-10-22T00:00:00Z"});
 }
 if (url.pathname === "/api/kyaa-wave/albums") {
  if(method === "POST") {const value=JSON.parse(String(init?.body)); if(query.get("save")==="error")return json({error:{code:"UNAVAILABLE"}},503); const next={...album,id:crypto.randomUUID(),body:value.body,assets:value.assetIds.map((assetId:string)=>({id:assetId,kind:uploadAssets.get(assetId)?.kind ?? "image",width:1672,height:940,durationSeconds:null}))};albums.unshift(next);return json({id:next.id,revision:1,replayed:false});}
  return json({items:albums,nextCursor:null});
 }
 if(url.pathname.startsWith("/api/kyaa-wave/profiles/"))return json({items:albums,nextCursor:null});
 if (url.pathname.startsWith("/api/kyaa-wave/albums/")) return json({album});
 if (url.pathname.startsWith("/api/media/")) return realFetch("/images/kyaa-wave/changha-landscape.webp");
 if (url.pathname.includes("/fan-clips/") && url.pathname.endsWith("/comments")) return json({items:[],nextCursor:null});
 if (url.pathname.endsWith("/cheers")) {
  if(method === "POST") {const value=JSON.parse(String(init?.body));cheers.unshift({id:crypto.randomUUID(),body:value.body,nickname:"별빛팬",avatarUrl:"/images/avatars/star-pink.webp",createdAt:new Date().toISOString(),isOwner:true,clapCount:0,viewerClapped:false,replyCount:0});return json({id:cheers[0].id});}
  return json({total:cheers.length,comments:cheers,nextCursor:null});
 }
 if (url.pathname.startsWith("/api/kyaa-wave/friends")) {
  if (query.get("friends") === "error") return json({error:{code:"UNAVAILABLE"}},503);
  if (query.get("friends") === "loading") return new Promise(() => {});
  if (url.pathname.endsWith("/profile-link")) return json({token:friendToken,expiresAt:"2026-10-22T00:00:00Z"});
  if (url.pathname.includes("/profile-links/")) return json({profile:{id:"72000000-0000-4000-8000-000000000009",nickname:"새로 만난 친구",avatarUrl:"/images/avatars/star-pink.webp"},relationship:{friendshipId:null,status:"none"},isSelf:false});
  if (url.pathname.endsWith("/messages")) {
   if(method === "POST") { const value=JSON.parse(String(init?.body));messages.push({id:crypto.randomUUID(),text:value.text,createdAt:new Date().toISOString(),isMine:true});return json({id:messages.at(-1)!.id}); }
   return json({messages,hasMore:false});
  }
  if(method === "PATCH") { const value=JSON.parse(String(init?.body)), index=friends.findIndex(friend=>url.pathname.endsWith(friend.id)); if(index>=0){if(value.action==="accept")friends[index].status="friends";else friends.splice(index,1);} return json({ok:true}); }
  if(method === "POST") { const value=JSON.parse(String(init?.body)); friends.push({id:crypto.randomUUID(),profileId:value.profileId,nickname:"새로 만난 친구",avatarUrl:"/images/avatars/star-pink.webp",status:"outgoing"});return json({status:"pending"}); }
  return json({friendships:friends});
 }

 if (url.pathname === "/api/kyaa-wave/participation") return query.get("gateError") === "1" ? json({error:{code:"UNAVAILABLE"}},503) : json({participation:method === "POST" || query.get("checkin") === "1" ? {id,createdAt:"2026-10-22T00:00:00Z"} : null});
 if (url.pathname.endsWith("/feed")) return json({ items: posts.map(post => ({...post,kind:"fan_post"})), nextCursor: null, unavailableSources: [] });
 if (url.pathname === `/api/celebrities/${WAVE_FANPAGE_SLUG}/posts` && method === "POST") {
   const value=JSON.parse(String(init?.body)); posts.unshift({...post,id:crypto.randomUUID(),body:value.body,assets:value.assetIds.length ? post.assets : []}); return json({id:posts[0].id,revision:1,replayed:false},201);
 }
 if (url.pathname.endsWith("/missions")) return json({progress:WAVE_MISSIONS.map(m => ({key:m.key,status:["checkin","fanpage-like","introduction"].includes(m.key) ? "completed" : ["event-photo","friendship","dm-greeting","insight-review"].includes(m.key) ? "pending" : "unverified"}))});
 if (url.pathname.startsWith("/api/public/notice-media/")) return new Headers(init?.headers).has("authorization") ? realFetch("/images/kyaa-wave/changha-landscape.webp") : json({error:{code:"UNAUTHENTICATED"}},401);
 if (url.pathname.startsWith("/api/content-assets/")) return realFetch("/images/kyaa-wave/changha-landscape.webp");
 if (url.pathname === "/api/content-assets" && method === "POST") return json({asset:{id:assetId,width:1672,height:940}},201);
 if (url.pathname.endsWith("/programs/stamps")) return query.get("state") === "error" ? json({error:{code:"UNAVAILABLE"}},503) : json({stamps:[...earned].map(program=>({program,earnedAt:"2026-10-20T10:00:00Z"}))});
 if (/\/programs\/[^/]+\/posts$/.test(url.pathname)) {
  if (method === "POST") { const value=JSON.parse(String(init?.body)); if(query.get("save") === "error")return json({error:{code:"UNAVAILABLE"}},503); posts.unshift({...post,id:crypto.randomUUID(),body:value.body,assets:value.assetIds.length ? post.assets : []});if(value.assetIds.length)earned.add(program);return json({id:posts[0].id,revision:1,replayed:false},201); }
  return query.get("state") === "error" ? json({error:{code:"UNAVAILABLE"}},503) : json({items:posts,nextCursor:null});
 }
 if (/\/notices\/[^/]+\/comments$/.test(url.pathname)) {
  if(method === "POST"){ const value=JSON.parse(String(init?.body));if(query.get("save")==="error")return json({error:{code:"UNAVAILABLE"}},503);comments.unshift({id:crypto.randomUUID(),body:value.body,nickname:"별빛팬",avatarUrl:"/images/avatars/star-pink.webp",createdAt:new Date().toISOString(),isOwner:true});earned.add(program);return json({id:comments[0].id},201); }
  return json({total:comments.length,comments,nextCursor:null});
 }
 if (/\/notices\/[^/]+$/.test(url.pathname)) return json({id,slug:program,title:WAVE_PROGRAMS.find(p=>p.key===program)!.name,pinned:false,kind:"standard",postType:"notice",visibility:"public",revision:1,publishedAt:"2026-10-20T00:00:00Z",body:{type:"doc",content:[...(query.get("protectedImage") === "1" ? [{type:"image",attrs:{src:`/api/public/notice-media/${assetId}`,alt:"검증용 행사 사진",width:1672,height:940}}] : []),{type:"paragraph",content:[{type:"text",text:program==="live-insight"?"콘텐츠와 팬의 연결에 관한 이야기 · 참가자와의 대화":program==="wave-quiz"?"참여형 퀴즈와 참가자 소개":"KYAA WAVE와 함께 시작하는 커뮤니티"}]}]}});
 if (/\/api\/posts\/[^/]+\/comments$/.test(url.pathname))return json({items:[],nextCursor:null});
 if (/\/api\/posts\/[^/]+$/.test(url.pathname)){if(method==="DELETE")return json({removed:true});return json({post});}
 if(url.pathname.endsWith("/raffles"))return json({raffles:[]});
 if(url.pathname.endsWith("/cheer-event"))return json({event:null});
 if(url.pathname.endsWith("/summary"))return json({membershipCount:0,fanCount:0,leaderboardAvailable:false,activity:[]});
 if(url.pathname.endsWith("/fans"))return json({likeCount:0,fanCount:0,publicFanCount:0,fans:[]});
 if(url.pathname.endsWith("/reactions"))return json({reaction:null});
 if(method === "POST")return json({ok:true});
 return json({error:{code:"NOT_FOUND"}},404);
}) as typeof fetch;
function App() {
 if(location.pathname === "/connect/kyaa-wave/participate")return <KyaaWaveParticipationScreen/>;
 if(location.pathname === "/admin/kyaa-wave-draw") return <WaveDrawManager locale={locale === "ko" ? "ko" : "en"}/>;
 if (location.pathname === "/celebrities") return <CelebrityDirectory locale={locale} initialOwnedOnly={false} celebrities={[
   {...creator,upcomingLive:null},
   {...creator,slug:"elina",name:"Elina",summary:"함께하는 일상의 이야기",roles:["creator"],image:{url:"/images/guest-home/elina-card.jpg",alt:"Elina",position:"center"},upcomingLive:null},
 ]} />;

 if(location.pathname.includes("/community/"))return <FanAppFrame locale={locale}><FanContentContainer><FanPostDetail postId={id} locale={locale}/></FanContentContainer></FanAppFrame>;
 if(key.success)return <WaveProgramPage locale={locale} program={key.data}/>;
 return <CelebrityFanPage celebrity={creator} locale={locale} upcomingLive={null} initialTab={query.get("tab") === "friends" ? "friends" : parseFanPageTab(query.get("tab"))} initialBoardSection={resolveBoardSection(query.get("tab"),query.get("section"))} initialBoardSource={resolveBoardSource(query.get("tab"),query.get("source"))}/>;
}
createRoot(document.getElementById("root")!).render(query.get("gate") === "1" ? <WaveAccessBoundary locale={locale}><App/></WaveAccessBoundary> : <App/>);
