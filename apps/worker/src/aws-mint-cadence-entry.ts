import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { createMintCadenceHandler } from "./aws-mint-cadence.js";
const lambda=new LambdaClient({region:"ap-northeast-2",maxAttempts:1});
export const handler=createMintCadenceHandler({async invoke(){
 const arn=process.env.MINT_WORKER_FUNCTION_ARN;
 if(!arn||!new RegExp(`^arn:aws:lambda:ap-northeast-2:996702758024:function:byus-mint-worker-${process.env.WORKER_ENVIRONMENT}$`).test(arn))throw new Error("Mint target environment mismatch");
 const response=await lambda.send(new InvokeCommand({FunctionName:arn,InvocationType:"RequestResponse",Payload:Buffer.from(JSON.stringify({source:"byus.supabase-cron",environment:process.env.WORKER_ENVIRONMENT}))}),{abortSignal:AbortSignal.timeout(260000)});
 if(response.FunctionError||response.StatusCode!==200)throw new Error("Mint target failed");
}});
