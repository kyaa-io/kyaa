import "server-only";
import * as http2 from "node:http2";
import { createPrivateKey, sign } from "node:crypto";

export type MobilePushLocale="ko"|"en"|"ja"|"zh-Hans"|"zh-Hant"|"es"|"id"|"vi"|"th"|"pt"|"fr";
export type MobilePushMessage={platform:"ios"|"android";pushToken:string;locale:MobilePushLocale;payload:{type:"notification_available";notificationId:string;category:string}};
export class MobilePushProviderError extends Error{
 constructor(readonly code:string,readonly retryable:boolean,readonly invalidToken=false){super(code);this.name="MobilePushProviderError";}
}
export interface PlatformPushProvider{send(input:MobilePushMessage):Promise<void>}

function required(value:string|undefined,pattern:RegExp){return Boolean(value&&pattern.test(value));}
function normalizePrivateKey(value:string){return value.replace(/\\n/g,"\n");}
function jwt(header:Record<string,string>,claims:Record<string,string|number>,privateKey:string,ec=false){const encoded=`${Buffer.from(JSON.stringify(header)).toString("base64url")}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}`;const signature=sign("sha256",Buffer.from(encoded),{key:createPrivateKey(normalizePrivateKey(privateKey)),...(ec?{dsaEncoding:"ieee-p1363" as const}:{})});return`${encoded}.${signature.toString("base64url")}`;}
const genericCopy:Record<MobilePushLocale,{title:string;body:string}>={
 ko:{title:"새 알림이 있어요",body:"앱에서 확인해 주세요."},en:{title:"New notification",body:"Open the app to view it."},
 ja:{title:"新しいお知らせがあります",body:"アプリで確認してください。"},"zh-Hans":{title:"有新通知",body:"请在应用中查看。"},"zh-Hant":{title:"有新通知",body:"請在應用程式中查看。"},
 es:{title:"Tienes una notificación nueva",body:"Abre la app para verla."},id:{title:"Ada notifikasi baru",body:"Buka aplikasi untuk melihatnya."},
 vi:{title:"Bạn có thông báo mới",body:"Mở ứng dụng để xem."},th:{title:"มีการแจ้งเตือนใหม่",body:"เปิดแอปเพื่อดู"},
 pt:{title:"Você tem uma nova notificação",body:"Abra o app para ver."},fr:{title:"Vous avez une nouvelle notification",body:"Ouvrez l’application pour la consulter."},
};
export function mobilePushGenericCopy(locale:MobilePushLocale){return genericCopy[locale];}

export function createApnsProvider(config:{environment:"sandbox"|"production";keyId:string;teamId:string;bundleId:string;privateKey:string;timeoutMs?:number;connect?:typeof http2.connect}):PlatformPushProvider{
 const origin=config.environment==="sandbox"?"https://api.sandbox.push.apple.com":"https://api.push.apple.com";
 let cached:{value:string;createdAt:number}|null=null;
 const token=()=>{const now=Math.floor(Date.now()/1000);if(cached&&now-cached.createdAt<3000)return cached.value;const value=jwt({alg:"ES256",kid:config.keyId},{iss:config.teamId,iat:now},config.privateKey,true);cached={value,createdAt:now};return value;};
 return{async send(input){
  if(input.platform!=="ios"||!required(input.pushToken,/^[0-9a-f]{64,200}$/i))throw new MobilePushProviderError("INVALID_TOKEN",false,true);
  const copy=mobilePushGenericCopy(input.locale);const body=JSON.stringify({aps:{alert:copy,sound:"default","content-available":1},type:input.payload.type,notificationId:input.payload.notificationId,category:input.payload.category});
  const client=(config.connect??http2.connect)(origin);let settled=false;
  await new Promise<void>((resolve,reject)=>{
   const finish=(error?:Error)=>{if(settled)return;settled=true;client.close();error?reject(error):resolve();};
   client.once("error",()=>finish(new MobilePushProviderError("APNS_CONNECTION",true)));
   Promise.resolve().then(token).then(jwt=>{
    if(settled)return;
    const request=client.request({":method":"POST",":path":`/3/device/${input.pushToken}`,authorization:`bearer ${jwt}`,"apns-topic":config.bundleId,"apns-push-type":"alert","apns-priority":"10","content-type":"application/json","content-length":Buffer.byteLength(body)});
    let status=0,response="";request.setEncoding("utf8");request.setTimeout(config.timeoutMs??10_000,()=>request.close(http2.constants.NGHTTP2_CANCEL));
    request.on("response",headers=>{status=Number(headers[":status"]??0);});request.on("data",chunk=>{if(response.length<4096)response+=chunk;});
    request.on("error",()=>finish(new MobilePushProviderError("APNS_CONNECTION",true)));
    request.on("close",()=>{if(!status)return finish(new MobilePushProviderError("APNS_TIMEOUT",true));let reason="";try{reason=String(JSON.parse(response).reason??"");}catch{}
      if(status===200)return finish();if(status===410||["BadDeviceToken","DeviceTokenNotForTopic","Unregistered"].includes(reason))return finish(new MobilePushProviderError("INVALID_TOKEN",false,true));
      if(status===429||status>=500)return finish(new MobilePushProviderError(`APNS_${status}`,true));return finish(new MobilePushProviderError("PROVIDER_REJECTED",false));});
    request.end(body);
   }).catch(()=>finish(new MobilePushProviderError("APNS_AUTH",true)));
  });
 }};
}

export function createFcmProvider(config:{projectId:string;clientEmail:string;privateKey:string;timeoutMs?:number},fetcher:typeof fetch=fetch):PlatformPushProvider{
 let cached:{value:string;expiresAt:number}|null=null;
 const accessToken=async()=>{const now=Math.floor(Date.now()/1000);if(cached&&cached.expiresAt-now>120)return cached.value;const assertion=jwt({alg:"RS256",typ:"JWT"},{iss:config.clientEmail,sub:config.clientEmail,aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600,scope:"https://www.googleapis.com/auth/firebase.messaging"},config.privateKey);const response=await fetcher("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),signal:AbortSignal.timeout(config.timeoutMs??10_000)});if(!response.ok)throw new MobilePushProviderError("FCM_AUTH",true);const data=await response.json() as {access_token?:unknown;expires_in?:unknown};if(typeof data.access_token!=="string")throw new MobilePushProviderError("FCM_AUTH",true);cached={value:data.access_token,expiresAt:now+(typeof data.expires_in==="number"?data.expires_in:3600)};return cached.value;};
 return{async send(input){
  if(input.platform!=="android"||input.pushToken.length<8)throw new MobilePushProviderError("INVALID_TOKEN",false,true);
  const copy=mobilePushGenericCopy(input.locale);let response:Response;try{response=await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/messages:send`,{method:"POST",headers:{authorization:`Bearer ${await accessToken()}`,"content-type":"application/json"},body:JSON.stringify({message:{token:input.pushToken,notification:copy,data:{type:input.payload.type,notificationId:input.payload.notificationId,category:input.payload.category},android:{priority:"high",notification:{sound:"default"}}}}),signal:AbortSignal.timeout(config.timeoutMs??10_000)});}catch(error){if(error instanceof MobilePushProviderError)throw error;throw new MobilePushProviderError("FCM_CONNECTION",true);}
  if(response.ok)return;const data=await response.json().catch(()=>({})) as {error?:{status?:string;details?:Array<{errorCode?:string}>}};const code=data.error?.details?.map(x=>x.errorCode).find(Boolean)??data.error?.status??"";
  if(response.status===401){cached=null;throw new MobilePushProviderError("FCM_AUTH",true);}if(["UNREGISTERED","INVALID_ARGUMENT"].includes(code))throw new MobilePushProviderError("INVALID_TOKEN",false,true);if(response.status===429||response.status>=500)throw new MobilePushProviderError(`FCM_${response.status}`,true);throw new MobilePushProviderError("PROVIDER_REJECTED",false);
 }};
}

export function createPlatformPushProviderFromEnvironment():{provider:PlatformPushProvider;platforms:Array<"ios"|"android">}|null{
 const providers:Partial<Record<"ios"|"android",PlatformPushProvider>>={};
 if(required(process.env.APNS_PUSH_ENVIRONMENT,/^(sandbox|production)$/)&&required(process.env.APNS_KEY_ID,/^[A-Z0-9]{10}$/)&&required(process.env.APNS_TEAM_ID,/^[A-Z0-9]{10}$/)&&required(process.env.APNS_BUNDLE_ID,/^[A-Za-z0-9.-]{3,255}$/)&&process.env.APNS_PRIVATE_KEY){providers.ios=createApnsProvider({environment:process.env.APNS_PUSH_ENVIRONMENT as "sandbox"|"production",keyId:process.env.APNS_KEY_ID!,teamId:process.env.APNS_TEAM_ID!,bundleId:process.env.APNS_BUNDLE_ID!,privateKey:process.env.APNS_PRIVATE_KEY!});}
 if(required(process.env.FCM_PROJECT_ID,/^[a-z][a-z0-9-]{4,62}$/)&&required(process.env.FCM_CLIENT_EMAIL,/^[^\s@]+@[^\s@]+$/)&&process.env.FCM_PRIVATE_KEY){providers.android=createFcmProvider({projectId:process.env.FCM_PROJECT_ID!,clientEmail:process.env.FCM_CLIENT_EMAIL!,privateKey:process.env.FCM_PRIVATE_KEY!});}
 const platforms=Object.keys(providers) as Array<"ios"|"android">;if(!platforms.length)return null;
 return{platforms,provider:{async send(input){const provider=providers[input.platform];if(!provider)throw new MobilePushProviderError("PROVIDER_NOT_CONFIGURED",false);await provider.send(input);}}};
}
