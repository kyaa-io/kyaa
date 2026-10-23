import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { createClient } from "@/server/data/client";
import { createMobileMediaMaintenance } from "./processor-runtime";
const protectedKey = /^(?:AWS_(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)|WORKER_|MEDIA_RUNTIME_SECRET_ID$|HOSTING_PROVIDER$|APP_ENV$|APP_URL$|PORT$|HOSTNAME$|NODE_|LD_|PATH$|HOME$|SHELL$)/;
export const maintenanceRpcs = {
  "reclaim-stale":"reclaim_stale_blockchain_jobs", "business-inquiries":"maintain_business_inquiries",
  "telegram-alerts":"maintain_telegram_alerts", "telegram-commands":"maintain_telegram_command_receipts",
  "kakao-deliveries":"maintain_kakao_notification_deliveries", "certification-reviews":"maintain_telegram_certification_reviews",
  "banksy-campaign":"maintain_banksy_campaign", "wave-engagements":"maintain_wave_engagements",
} as const;
type Invocation = { source?: string; environment?: string; task?: string; assetId?: string };
function createRuntimeHandler(expected: string, deps: { loadSecret(id: string): Promise<string>; run(input: Invocation): Promise<Record<string,unknown>> }, source: Record<string,string|undefined>) {
  let installedKeys: string[] = [];
  return async (event: unknown) => {
    const input=event as Invocation;
    if(input?.source!==expected||!["dev","staging","prod"].includes(input.environment??"")||input.environment!==source.WORKER_ENVIRONMENT||(expected==="byus.aws-maintenance"&&!Object.hasOwn(maintenanceRpcs,input.task??"")))throw new Error("Invalid worker invocation");
    if(source.WORKER_ENABLED!=="true")return{enabled:false,processed:0};
    if(!source.MEDIA_RUNTIME_SECRET_ID)throw new Error("Worker runtime secret is required");
    let values:Record<string,unknown>;
    try{values=JSON.parse(await deps.loadSecret(source.MEDIA_RUNTIME_SECRET_ID)) as Record<string,unknown>;}catch{throw new Error("Invalid worker runtime configuration");}
    for(const[key,value]of Object.entries(values))if(!/^[A-Z][A-Z0-9_]{0,127}$/.test(key)||protectedKey.test(key)||(key.startsWith("AWS_")&&!["AWS_REGION","AWS_STORAGE_ENABLED"].includes(key))||typeof value!=="string")throw new Error("Invalid worker runtime configuration");
    if(values.AWS_REGION!==undefined&&values.AWS_REGION!=="ap-northeast-2")throw new Error("Invalid worker AWS region");
    if(values.POSTGREST_URL){
      const expected={dev:"https://data.dev.kyaa.io/",staging:"https://data.staging.kyaa.io/",prod:"https://data.kyaa.io/"}[input.environment as "dev"|"staging"|"prod"];
      if(new URL(String(values.POSTGREST_URL)).href!==expected||values.BYUS_DATA_ENVIRONMENT!==(input.environment==="prod"?"production":"development"))throw new Error("Invalid worker private database endpoint");
    }
    for(const key of installedKeys)if(!Object.hasOwn(values,key))delete source[key];
    Object.assign(source,values,{HOSTING_PROVIDER:"aws",APP_ENV:input.environment,APP_URL:{dev:"https://dev.kyaa.io",staging:"https://staging.kyaa.io",prod:"https://www.kyaa.io"}[input.environment as "dev"|"staging"|"prod"]});installedKeys=Object.keys(values);
    return{enabled:true,...await deps.run(input)};
  };
}
export function createMediaHandler(deps:{loadSecret(id:string):Promise<string>;runMedia(assetId?:string):Promise<{processed:number}>},source:Record<string,string|undefined>=process.env){return createRuntimeHandler("byus.aws-media",{loadSecret:deps.loadSecret,run:input=>{if(input.assetId!==undefined&&!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.assetId))throw new Error("Invalid media asset");return deps.runMedia(input.assetId);}},source);}
export function createMaintenanceHandler(deps:{loadSecret(id:string):Promise<string>;runRpc(name:string):Promise<unknown>},source:Record<string,string|undefined>=process.env){return createRuntimeHandler("byus.aws-maintenance",{loadSecret:deps.loadSecret,run:async input=>({task:input.task,result:await deps.runRpc(maintenanceRpcs[input.task as keyof typeof maintenanceRpcs])})},source);}
const secrets=new SecretsManagerClient({});
async function loadSecret(id:string){const result=await secrets.send(new GetSecretValueCommand({SecretId:id}));if(!result.SecretString)throw new Error("Worker runtime secret is empty");return result.SecretString;}
export const handler=createMediaHandler({loadSecret,runMedia:assetId=>createMobileMediaMaintenance().process(1,assetId)});
export const maintenanceHandler=createMaintenanceHandler({loadSecret,async runRpc(name){
 const database=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(45000)})}});
 const result=await database.rpc(name,{});if(result.error)throw new Error("Maintenance RPC failed");return result.data;
}});
