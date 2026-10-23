import { readFileSync } from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

// Loopback-only fixtures; the production SQL tests own authorization and concurrency checks.
export function createPhotocardFixture(directory) {
 const claims=new Map(), failures=new Set();
 const sets={wena:[[5,6],[1,8],[7,2],[3,4]],changha:[[3,5,11],[4,6,12],[7,9,10],[1,2,8]]};
 const names=["아야 (AYA)","도아 (DOA)","희 (HEE)","원이 (WONY)"];
 const collectionId=creator=>`94000000-0000-4000-8000-00000000000${creator==="wena"?2:1}`;
 const bundleId=(creator,index)=>`95000000-0000-4000-8000-${creator==="wena"?"1":"2"}${String(index).padStart(11,"0")}`;
 const asset=(creator,index)=>({id:`96000000-0000-4000-8000-${creator==="wena"?"1":"2"}${String(index).padStart(11,"0")}`,width:960,height:1440});
 const assets=(creator,selected)=>selected===undefined?[]:sets[creator][selected].map(i=>asset(creator,i));
 function state(creator,owner,scenario) {
  const selected=claims.get(`${owner}:${creator}`), ready=scenario?.startsWith("photocard") && scenario!=="photocard-preparing";
  return {mode:creator==="wena"?"member_pair":"random_three",ready:Boolean(ready),selectedBundleId:selected===undefined?null:bundleId(creator,selected),options:creator==="wena"&&ready?names.map((title,i)=>({id:bundleId(creator,i),title})):[],assets:assets(creator,selected)};
 }
 async function handle(req,res,scenario,entered) {
  const claimMatch=req.url.match(/^\/api\/photocard-collections\/(94000000-0000-4000-8000-00000000000[12])\/claim$/);
  const imageMatch=req.url.match(/^\/api\/photocards\/(96000000-0000-4000-8000-([12])(\d{11}))$/);
  if(!claimMatch&&!imageMatch)return false;
  res.setHeader("cache-control","private, no-store");res.setHeader("vary","Authorization");
  const owner=req.headers.authorization;
  if(!owner||!entered){res.statusCode=owner?404:401;res.end(JSON.stringify({error:{code:"PHOTOCARD_NOT_FOUND"}}));return true;}
  if(imageMatch){
   const creator=imageMatch[2]==="1"?"wena":"changha",index=Number(imageMatch[3]);
   if(!directory||!assets(creator,claims.get(`${owner}:${creator}`)).some(a=>a.id===imageMatch[1])){res.statusCode=404;res.end();return true;}
   res.setHeader("content-type","image/webp");res.end(readFileSync(path.join(directory,`${creator}-${String(index).padStart(2,"0")}.webp`)));return true;
  }
  const creator=claimMatch[1]===collectionId("wena")?"wena":"changha", key=`${owner}:${creator}`;
  if(scenario==="photocard-error"&&!failures.has(key)){failures.add(key);res.statusCode=503;res.end(JSON.stringify({error:{code:"PHOTOCARD_UNAVAILABLE"}}));return true;}
  if(req.method==="POST"){
   let body="";for await(const chunk of req)body+=chunk;
   const input=JSON.parse(body||"{}");
   if(!claims.has(key)){
    const chosen=creator==="wena"?names.findIndex((_,i)=>bundleId(creator,i)===input.bundleId):randomInt(4);
    if(chosen<0){res.statusCode=400;res.end(JSON.stringify({error:{code:"PHOTOCARD_INVALID_SELECTION"}}));return true;}
    claims.set(key,chosen);
   }
  }
  res.end(JSON.stringify(state(creator,owner,scenario)));return true;
 }
 return {handle,collectionId,assets:(creator,owner)=>assets(creator,claims.get(`${owner}:${creator}`))};
}
