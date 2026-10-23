import { expect,it,vi } from "vitest";
import { createScheduledHandler } from "../src/aws-scheduled-entry.js";
const env={WORKER_ENVIRONMENT:"staging",WORKER_ENABLED:"true",API_ORIGIN:"https://staging.example.test",CRON_RUNTIME_SECRET_ID:"byus/staging/cron"};
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
 await expect(createScheduledHandler({loadSecret,fetcher},env)({source:"byus.aws-cron",environment:"staging",task:"indexnow"})).rejects.toThrow("different owner");
});
