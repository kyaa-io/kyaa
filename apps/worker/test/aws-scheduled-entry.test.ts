import { afterEach, beforeEach, expect,it,vi } from "vitest";
import { createScheduledHandler } from "../src/aws-scheduled-entry.js";
const env={WORKER_ENVIRONMENT:"staging",WORKER_ENABLED:"true",API_ORIGIN:"https://staging.example.test",CRON_RUNTIME_SECRET_ID:"byus/staging/cron"};
beforeEach(()=>{vi.spyOn(console,"info").mockImplementation(()=>{});});
afterEach(()=>{vi.restoreAllMocks();});
const invocation={source:"byus.aws-cron",environment:"staging",task:"indexnow"};
function expectLogs(outcome:string,status:number|null=null){
 expect(vi.mocked(console.info).mock.calls.map(([line])=>JSON.parse(line))).toEqual([
  {event:"scheduled_task",outcome:"start",task:"indexnow",environment:"staging",status:null},
  {event:"scheduled_task",outcome,task:"indexnow",environment:"staging",status},
 ]);
}
it.each([
 ["runmusic-telegram", "/api/internal/runmusic/telegram/process"],
 ["indexnow", "/api/internal/seo/indexnow"], ["instagram-sync", "/api/internal/instagram/sync"],
 ["instagram-live", "/api/internal/instagram/live-sync"], ["chzzk-live", "/api/internal/chzzk/live-sync"],
 ["account-deletions", "/api/internal/account-deletions/process"], ["onchain-dashboard", "/api/internal/onchain-dashboard/refresh"],
])("routes exact job %s with the bearer secret and AWS owner marker",async(task,path)=>{
 const loadSecret=vi.fn(async()=>JSON.stringify({CRON_SECRET:"s".repeat(32)}));
 const fetcher=vi.fn<typeof fetch>(async()=>new Response("ok"));
 const handler=createScheduledHandler({loadSecret,fetcher},env);
 await expect(handler({source:"byus.aws-cron",environment:"staging",task})).resolves.toMatchObject({enabled:true});
 expect(String(fetcher.mock.calls[0]?.[0])).toBe(`https://staging.example.test${path}`);
 expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({authorization:`Bearer ${"s".repeat(32)}`,"x-byus-scheduler":"aws"});
 expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe("error");
 await expect(handler({source:"byus.aws-cron",environment:"prod",task:"indexnow"})).rejects.toThrow();
 await expect(handler({source:"byus.aws-cron",environment:"staging",task:"../admin"})).rejects.toThrow();
 expect(fetcher).toHaveBeenCalledOnce();
});
it("stays disabled before secret/network access and fails if the API owner rejects execution",async()=>{
 const loadSecret=vi.fn(async()=>JSON.stringify({CRON_SECRET:"s".repeat(32)}));const fetcher=vi.fn<typeof fetch>(async()=>new Response(null,{status:204}));
 await expect(createScheduledHandler({loadSecret,fetcher},{...env,WORKER_ENABLED:"false"})({source:"byus.aws-cron",environment:"staging",task:"runmusic-telegram"})).resolves.toEqual({enabled:false});
 expect(loadSecret).not.toHaveBeenCalled();
 expect(fetcher).not.toHaveBeenCalled();
 await expect(createScheduledHandler({loadSecret,fetcher},env)({source:"byus.aws-cron",environment:"staging",task:"indexnow"})).rejects.toThrow("different owner");
});
it("logs success and cancels the response without reading its private body",async()=>{
 const response=new Response("private response https://private.example.test/token");
 const cancel=vi.spyOn(response.body!,"cancel");
 const loadSecret=vi.fn(async()=>JSON.stringify({CRON_SECRET:"private-secret".repeat(4)}));
 const fetcher=vi.fn<typeof fetch>(async()=>response);
 await expect(createScheduledHandler({loadSecret,fetcher},env)(invocation)).resolves.toEqual({enabled:true,task:"indexnow",status:200});
 expectLogs("success",200);
 expect(cancel).toHaveBeenCalledOnce();
 expect(response.body?.locked).toBe(false);
});
it.each([undefined,"false","TRUE"])("logs disabled and avoids secret/network access when enabled is %s",async(enabled)=>{
 const loadSecret=vi.fn();const fetcher=vi.fn<typeof fetch>();
 await expect(createScheduledHandler({loadSecret,fetcher},{...env,WORKER_ENABLED:enabled})(invocation)).resolves.toEqual({enabled:false});
 expectLogs("disabled");
 expect(loadSecret).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it.each([204,401,500])("logs HTTP failure %s and cancels its body even when cancellation fails",async(status)=>{
 const cancel=vi.fn(async()=>{throw new Error("private cancellation failure");});
 const response={status,ok:status<400,body:{cancel}} as unknown as Response;
 const loadSecret=vi.fn(async()=>JSON.stringify({CRON_SECRET:"private-secret".repeat(4)}));
 const fetcher=vi.fn<typeof fetch>(async()=>response);
 await expect(createScheduledHandler({loadSecret,fetcher},env)(invocation)).rejects.toThrow("Scheduled task failed or has a different owner");
 expectLogs("failure",status);expect(cancel).toHaveBeenCalledOnce();
});
it("logs network failure without logging the original private error",async()=>{
 const error=new Error("private-secret https://private.example.test/token authorization");
 const loadSecret=vi.fn(async()=>JSON.stringify({CRON_SECRET:"private-secret".repeat(4)}));
 const fetcher=vi.fn<typeof fetch>(async()=>{throw error;});
 await expect(createScheduledHandler({loadSecret,fetcher},env)(invocation)).rejects.toBe(error);
 expectLogs("failure");
 expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
});
it.each([
 {CRON_RUNTIME_SECRET_ID:undefined},
 {API_ORIGIN:"https://private.example.test/path?secret=private-secret"},
])("logs configuration failure without configuration values",async(configuration)=>{
 const loadSecret=vi.fn();const fetcher=vi.fn<typeof fetch>();
 await expect(createScheduledHandler({loadSecret,fetcher},{...env,...configuration})(invocation)).rejects.toThrow();
 expectLogs("failure");expect(loadSecret).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
it("does not log unvalidated invocation values",async()=>{
 const loadSecret=vi.fn();const fetcher=vi.fn<typeof fetch>();
 await expect(createScheduledHandler({loadSecret,fetcher},env)({...invocation,task:"https://private.example.test/token"})).rejects.toThrow("Invalid scheduled invocation");
 expect(console.info).not.toHaveBeenCalled();expect(loadSecret).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
});
