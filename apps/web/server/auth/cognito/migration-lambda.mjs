import { readFileSync } from "node:fs";

export function createMigrationHandler({verifyPassword,userPoolId,clientId}){
  if(typeof userPoolId!=="string" || !userPoolId || typeof clientId!=="string" || !clientId)throw new Error("Authentication migration not configured");
  return async function migration(event){
    if(event.userPoolId!==userPoolId || event.callerContext?.clientId!==clientId || event.triggerSource!=="UserMigration_Authentication")throw new Error("Unsupported authentication migration");
    const email=event.userName?.trim().toLowerCase(),password=event.request?.password;
    if(typeof email!=="string" || email.length>254 || typeof password!=="string" || password.length<1 || password.length>1024)throw new Error("Authentication failed");
    const owner=await verifyPassword(email,password);
    if(!owner || typeof owner.legacyUserId!=="string" || typeof owner.appUserId!=="string" || owner.email!==email)throw new Error("Authentication failed");
    event.response={...event.response,userAttributes:{email:owner.email,email_verified:"true","custom:legacy_user_id":owner.legacyUserId,"custom:app_user_id":owner.appUserId},finalUserStatus:"CONFIRMED",messageAction:"SUPPRESS",forceAliasCreation:false};
    return event;
  };
}
let handlerInstance;
export async function handler(event){
  if(!handlerInstance){
    const {Pool}=await import("pg");
    const pool=new Pool({host:process.env.PGHOST,port:Number(process.env.PGPORT??5432),database:process.env.PGDATABASE,user:process.env.PGUSER,password:process.env.PGPASSWORD,max:1,connectionTimeoutMillis:1500,query_timeout:2500,options:"-c statement_timeout=2500",ssl:{rejectUnauthorized:true,ca:readFileSync(process.env.RDS_CA_BUNDLE_PATH??"/var/task/global-bundle.pem","utf8")}});
    pool.on("error",()=>{});
    handlerInstance=createMigrationHandler({userPoolId:process.env.COGNITO_EMAIL_USER_POOL_ID,clientId:process.env.COGNITO_EMAIL_CLIENT_ID,verifyPassword:async(email,password)=>{
      try{const result=await pool.query("select public.verify_legacy_email_password($1,$2) as owner",[email,password]);return result.rows[0]?.owner??null;}catch{throw new Error("Authentication migration unavailable");}
    }});
  }
  return handlerInstance(event);
}
