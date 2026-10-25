import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("./processor-runtime",()=>({createMobileMediaMaintenance:()=>({process:vi.fn()})}));
import { createMediaHandler,createMaintenanceHandler,maintenanceRpcs } from "./aws-entry";
import { runtimeEnvironment } from "../config/hosting";
it("loads one environment secret only after activation and does not accept runtime credential overrides",async()=>{
 const source:Record<string,string|undefined>={WORKER_ENVIRONMENT:"staging",WORKER_ENABLED:"false",MEDIA_RUNTIME_SECRET_ID:"secret"};
 const loadSecret=vi.fn(async()=>JSON.stringify({POSTGREST_URL:"https://data.staging.kyaa.io",BYUS_DATA_ENVIRONMENT:"development"})),runMedia=vi.fn(async()=>({processed:1}));
 const handler=createMediaHandler({loadSecret,runMedia},source),event={source:"byus.aws-media",environment:"staging"};
 expect(await handler(event)).toEqual({enabled:false,processed:0});expect(loadSecret).not.toHaveBeenCalled();
 source.WORKER_ENABLED="true";expect(await handler(event)).toEqual({enabled:true,processed:1});expect(source.POSTGREST_URL).toBe("https://data.staging.kyaa.io");
 expect(runtimeEnvironment(source).NEXT_PUBLIC_APP_URL).toBe("https://staging.kyaa.io");
 loadSecret.mockResolvedValueOnce(JSON.stringify({APP_URL:"https://wrong.example"}));await expect(handler(event)).rejects.toThrow("Invalid worker runtime");
 loadSecret.mockResolvedValueOnce(JSON.stringify({AWS_ACCESS_KEY_ID:"forbidden"}));await expect(handler(event)).rejects.toThrow("Invalid worker runtime");
 await expect(handler({...event,environment:"prod"})).rejects.toThrow("Invalid worker invocation");
});
it("forwards only validated asset IDs and removes stale secret keys between warm invocations",async()=>{
 const source:Record<string,string|undefined>={WORKER_ENVIRONMENT:"dev",WORKER_ENABLED:"true",MEDIA_RUNTIME_SECRET_ID:"secret"};
 const loadSecret=vi.fn().mockResolvedValueOnce(JSON.stringify({POSTGREST_URL:"https://data.dev.kyaa.io",BYUS_DATA_ENVIRONMENT:"development"})).mockResolvedValue("{}"),runMedia=vi.fn(async()=>({processed:1}));
 const handler=createMediaHandler({loadSecret,runMedia},source),event={source:"byus.aws-media",environment:"dev",assetId:"11111111-1111-4111-8111-111111111111"};
 await handler(event);expect(runMedia).toHaveBeenCalledWith(event.assetId);await handler(event);expect(source.POSTGREST_URL).toBeUndefined();
 await expect(handler({...event,assetId:"../private"})).rejects.toThrow("Invalid media asset");
});
it("runs only the eight existing service-role maintenance RPCs and no arbitrary routine",async()=>{
 const runRpc=vi.fn(async()=>0),handler=createMaintenanceHandler({loadSecret:async()=>"{}",runRpc},{WORKER_ENVIRONMENT:"prod",WORKER_ENABLED:"true",MEDIA_RUNTIME_SECRET_ID:"secret"});
 for(const[task,rpc]of Object.entries(maintenanceRpcs)){await handler({source:"byus.aws-maintenance",environment:"prod",task});expect(runRpc).toHaveBeenLastCalledWith(rpc);}
 await expect(handler({source:"byus.aws-maintenance",environment:"prod",task:"delete_all_users"})).rejects.toThrow();expect(runRpc).toHaveBeenCalledTimes(8);
});

it("uses the canonical production origin shared by callback configuration",async()=>{
 const source:Record<string,string|undefined>={WORKER_ENVIRONMENT:"prod",WORKER_ENABLED:"true",MEDIA_RUNTIME_SECRET_ID:"secret"};
 const handler=createMediaHandler({loadSecret:async()=>JSON.stringify({KAKAO_REDIRECT_URI:"https://kyaa.io/settings/kakao/callback"}),runMedia:async()=>({processed:0})},source);
 await handler({source:"byus.aws-media",environment:"prod"});
 expect(runtimeEnvironment(source).NEXT_PUBLIC_APP_URL).toBe("https://kyaa.io");
 expect(new URL(source.KAKAO_REDIRECT_URI!).origin).toBe(source.APP_URL);
});
