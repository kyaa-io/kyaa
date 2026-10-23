import { beforeEach,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("@aws-sdk/client-lambda",()=>({LambdaClient:class{send=state.send;},InvokeCommand:class{constructor(readonly input:unknown){}}}));
import { invokeMediaWorker } from "./aws-invoker";
beforeEach(()=>state.send.mockReset().mockResolvedValue({StatusCode:202}));
it("invokes only the exact environment worker asynchronously with no client identity secrets",async()=>{
 const source={APP_ENV:"staging",MEDIA_WORKER_FUNCTION_ARN:"arn:aws:lambda:ap-northeast-2:996702758024:function:byus-media-staging"};
 await invokeMediaWorker("11111111-1111-4111-8111-111111111111",source);
 const input=state.send.mock.calls[0]?.[0].input;expect(input.InvocationType).toBe("Event");expect(input.FunctionName).toBe(source.MEDIA_WORKER_FUNCTION_ARN);
 expect(JSON.parse(Buffer.from(input.Payload).toString())).toEqual({source:"byus.aws-media",environment:"staging",assetId:"11111111-1111-4111-8111-111111111111"});
 await expect(invokeMediaWorker("id",{...source,APP_ENV:"prod"})).rejects.toThrow("target mismatch");expect(state.send).toHaveBeenCalledOnce();
});
