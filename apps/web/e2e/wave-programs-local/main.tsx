import { createRoot } from "react-dom/client";
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
const creator: PublishedCelebrity = { slug: WAVE_FANPAGE_SLUG, locale: "ko", name: "Kyaa Wave", summary: "2026. 10. 22. · Dragon Hill Lodge", image: { url: "/images/guest-home/kyaa-wordmark.svg", alt: "kyaa 로고", position: "center" }, roles: ["brand"], websiteUrl: "https://kyaawave.com/", socialLinks: [], themes: [], displayOrder: 0, fanCount: 0 };
const key = waveProgramKeySchema.safeParse(location.pathname.split("/programs/")[1]?.split("/")[0]);
const program = key.success ? key.data : "live-insight";
const id = "10000000-0000-4000-8000-000000000001", assetId = "10000000-0000-4000-8000-000000000002";
const post = { id, celebritySlug: WAVE_FANPAGE_SLUG, body: "함께 나눈 이야기를 사진으로 남겨요.", visibility: "public", revision: 1, author: { nickname: "별빛팬", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [{ id: assetId, width: 1672, height: 940 }], createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:00:00Z", isOwner: true, likeCount: 2, liked: false, commentCount: 0 };
const posts = query.get("state") === "empty" ? [] : [post];
const comments: { id: string; body: string; nickname: string; avatarUrl: string; createdAt: string; isOwner: boolean }[] = [];
const earned = new Set<string>(query.get("earned") === "all" ? WAVE_PROGRAMS.map(p => p.key) : []);
const realFetch = window.fetch.bind(window);
const json = (body: unknown, status = 200) => Promise.resolve(Response.json(body, {status}));
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
 const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
 if (!url.pathname.startsWith("/api/")) return realFetch(input, init);
 const method = init?.method ?? "GET";
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
 if (/\/notices\/[^/]+$/.test(url.pathname)) return json({id,slug:program,title:WAVE_PROGRAMS.find(p=>p.key===program)!.name,pinned:false,kind:"standard",postType:"notice",visibility:"public",revision:1,publishedAt:"2026-10-20T00:00:00Z",body:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:program==="live-insight"?"콘텐츠와 팬의 연결에 관한 이야기 · 참가자와의 대화":program==="wave-quiz"?"참여형 퀴즈와 참가자 소개":"KYAA WAVE와 함께 시작하는 커뮤니티"}]}]}});
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
 if(location.pathname.includes("/community/"))return <FanAppFrame locale={locale}><FanContentContainer><FanPostDetail postId={id} locale={locale}/></FanContentContainer></FanAppFrame>;
 if(key.success)return <WaveProgramPage locale={locale} program={key.data}/>;
 return <CelebrityFanPage celebrity={creator} locale={locale} upcomingLive={null}/>;
}
createRoot(document.getElementById("root")!).render(<App/>);
