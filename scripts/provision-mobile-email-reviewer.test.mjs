import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReviewerInput, provisionReviewer } from "./provision-mobile-email-reviewer.mjs";
test("input rejects extra fields and weak/malformed credentials without trimming passwords",()=>{
 assert.equal(parseReviewerInput(JSON.stringify({email:"Review@example.test",password:" long secret pass "})).password," long secret pass ");
 for (const value of [{email:"bad",password:"long secret password"},{email:"r@example.test",password:"short"},{email:"r@example.test",password:"long secret password",role:"admin"}]) assert.throws(()=>parseReviewerInput(JSON.stringify(value)));
});
test("dry run writes nothing and refuses every administrator or existing unrelated owner",async()=>{
 for(const data of [[],[{id:"existing"}]]) {
  let writes=0;
  const database={rpc:async()=>({data:true,error:null}),from:()=>({select:()=>({eq:async()=>({data,error:null})})})};
  const operation=()=>provisionReviewer({database,privy:{users:()=>({getByEmailAddress:async()=>{const error=new Error();error.status=404;throw error;},create:async()=>{writes++;throw Error();}})},input:{email:"r@example.test",password:"long secret password"},state:{},save:async()=>writes++});
  if(data.length) await assert.rejects(operation,/Existing\/admin/); else assert.deepEqual(await operation(),{ready:true,writes:false});
  assert.equal(writes,0);
 }
});
test("creates real provider IDs and wallet, snapshots before sync, and leaves binding disabled",async()=>{
 const saved=[],calls=[],state={};
 const user={id:"did:privy:real-user",linked_accounts:[{type:"email",address:"r@example.test"},{type:"wallet",chain_type:"ethereum",connector_type:"embedded",wallet_client:"privy",address:"0x"+"1".repeat(40)}]};
 const database={
  from:table=>({select:()=>({eq:()=>table==="mobile_email_login_bindings"?{maybeSingle:async()=>({data:null,error:null})}:Promise.resolve({data:[],error:null})}),insert:async value=>{calls.push([table,value]);return {error:null};}}),
  auth:{admin:{createUser:async value=>{calls.push(["createUser",value]);return {data:{user:{id:"real-auth-uuid"}},error:null};},getUserById:async()=>({data:{user:{email:"r@example.test",email_confirmed_at:"2026"}},error:null})}},
  rpc:async(name,args)=>{calls.push([name,args]);return {data:name==="check_mobile_email_provisioning"?true:[{app_user_id:"real-app-uuid"}],error:null};}
 };
 const privy={users:()=>({getByEmailAddress:async()=>{const error=new Error();error.status=404;throw error;},create:async value=>{calls.push(["privyCreate",value]);return user;},_get:async()=>user})};
 const input={email:"r@example.test",password:" long secret password "};
 assert.deepEqual(await provisionReviewer({database,privy,input,state,save:async value=>saved.push({...value}),apply:true}),{ready:true,writes:true,enabled:false});
 assert.deepEqual(saved,[{},{privyUserId:user.id},{privyUserId:user.id,supabaseUserId:"real-auth-uuid"},{privyUserId:user.id,supabaseUserId:"real-auth-uuid",appUserId:"real-app-uuid"}]);
 assert.equal(calls.find(([name])=>name==="createUser")[1].password,input.password);
 assert.deepEqual(calls.find(([name])=>name==="mobile_email_login_bindings")[1],{supabase_user_id:"real-auth-uuid",app_user_id:"real-app-uuid",enabled:false});
});
test("provider-only collision refuses every create before writing any checkpoint",async()=>{
 const database={from:()=>({select:()=>({eq:async()=>({data:[],error:null})})}),rpc:async()=>({data:true,error:null})};
 let wrote=false;
 const privy={users:()=>({getByEmailAddress:async()=>({id:"did:privy:existing"}),create:async()=>{wrote=true;}})};
 await assert.rejects(()=>provisionReviewer({database,privy,input:{email:"r@example.test"},state:{},save:async()=>{wrote=true;},apply:true}),/collision/);
 assert.equal(wrote,false);
 database.rpc=async()=>({data:false,error:null});
 await assert.rejects(()=>provisionReviewer({database,privy,input:{email:"r@example.test"},state:{},save:async()=>{wrote=true;},apply:true}),/collision/);
 assert.equal(wrote,false);
});
