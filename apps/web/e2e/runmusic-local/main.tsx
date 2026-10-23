import {createRoot} from "react-dom/client";
import {RunmusicScreen} from "../../features/connect/runmusic-screen";
import {RunmusicManager} from "../../components/admin/runmusic-manager";
import {LocaleProvider} from "../../components/locale-provider";
import {parseAppLocale} from "../../i18n/locales";
import {runmusicActionSchema,runmusicSettingsSchema} from "../../features/runmusic/domain";
import {ManagedHomeBanner} from "../../components/home-entry-cards/managed-home-banner";
import {makeCampaign,makeStatus,makeAdmin,makeBanner} from "./fixture";
import homeStyles from "../../components/guest-home.module.css";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

const params=new URLSearchParams(location.search),scenario=params.get("scenario")??"new";
const locale=parseAppLocale(params.get("locale"));document.documentElement.lang=locale;
// Fixed fixture clock keeps the approved real deadline intact and makes each state reproducible.
Date.now=()=>Date.parse(["winner","loser","not-entered","closed","admin","processing"].includes(scenario)?"2026-10-25T00:00:00Z":"2026-10-23T12:00:00Z");
const campaign=makeCampaign(scenario);let status=makeStatus(scenario,campaign);let admin=makeAdmin();let contactAttempts=0;
const fixture={requests:[] as {path:string;method:string;body:unknown}[],clipboardReads:0,status:()=>status};
Object.assign(window,{__runmusicHarness:fixture});
Object.defineProperty(navigator,"clipboard",{configurable:true,value:{readText:async()=>{fixture.clipboardReads++;if(scenario==="paste-denied")throw new DOMException("Local fixture clipboard denied","NotAllowedError");return "fixture_kakao_id";}}});
const nativeFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url,location.origin);
 if(url.origin!==location.origin)throw new Error("LOCAL_FIXTURE_BLOCKED_EXTERNAL_FETCH");
 if(!url.pathname.startsWith("/api/"))return nativeFetch(input,init);
 const method=init?.method??"GET",body=init?.body?JSON.parse(String(init.body)):null;
 fixture.requests.push({path:url.pathname,method,body});
 if(url.pathname==="/api/runmusic"&&method==="GET")return Response.json(campaign);
 if(url.pathname==="/api/me/runmusic"){
  if(scenario==="session-rejected")return Response.json({error:{code:"AUTHENTICATION_REQUIRED"}},{status:403});
  if(method==="POST"){
   if(scenario==="submit-auth")return new Response("Unauthorized",{status:401});
   const action=runmusicActionSchema.parse(body);
   if(action.action==="enter"){if(!status.liked)return Response.json({error:{code:"RUNMUSIC_LIKE_REQUIRED"}},{status:409});status={...status,entered:true,contact:{saved:true,masked:"fi***id"}};}
   else {contactAttempts++;if(scenario==="contact-save-error"&&contactAttempts===1)return Response.json({error:{code:"RUNMUSIC_UNAVAILABLE"}},{status:503});status={...status,contact:{saved:true,masked:"fi***id"}};}
  }
  return Response.json(status);
 }
 if(url.pathname==="/api/celebrities/runmusic/reactions"&&method==="POST"){if(body!==null)throw new Error("LOCAL_LIKE_BODY_UNEXPECTED");status={...status,liked:true};return Response.json({liked:true});}
 if(url.pathname.startsWith("/api/admin/runmusic")){
  if(url.pathname.endsWith("/contact"))return Response.json({kakaoId:"fixture_kakao_id"});
  if(url.pathname.endsWith("/receive")){admin={...admin,receivedCount:1,winners:admin.winners.map(winner=>({...winner,receivedAt:"2026-10-25T01:00:00Z"}))};return Response.json({receivedAt:"2026-10-25T01:00:00Z",replayed:false});}
  if(method==="PATCH"){const settings=runmusicSettingsSchema.parse(body);admin={...admin,revision:admin.revision+1,autoPublishEnabled:settings.autoPublishEnabled??admin.autoPublishEnabled,campaign:{...admin.campaign,published:settings.published??admin.campaign.published}};}
  return Response.json(admin);
 }
 throw new Error(`LOCAL_FIXTURE_UNHANDLED_API:${method}:${url.pathname}`);
};
createRoot(document.getElementById("root")!).render(<LocaleProvider initialLocale={locale}>{location.pathname==="/login"?<main><h1>Local login return fixture</h1><p>{params.get("returnTo")}</p></main>:params.get("view")==="banner"?<div className={homeStyles.page} data-fan-surface><div className={homeStyles.shell}><main className={homeStyles.main}><div className={homeStyles.heroCarousel}><div className={homeStyles.heroViewport}><div className={homeStyles.heroTrack}><article className={homeStyles.heroCard}><ManagedHomeBanner banner={makeBanner(locale)} locale={locale} priority/></article></div></div></div></main></div></div>:params.get("view")==="admin"?<RunmusicManager locale={locale==="ko"?"ko":"en"}/>:<RunmusicScreen resultsOnly={location.pathname.endsWith("/results")}/>}</LocaleProvider>);
