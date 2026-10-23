import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
const lambda=new LambdaClient({region:"ap-northeast-2",maxAttempts:1});
export async function invokeMediaWorker(assetId:string,source:Record<string,string|undefined>=process.env){
 const environment=source.APP_ENV,arn=source.MEDIA_WORKER_FUNCTION_ARN;
 if(!["dev","staging","prod"].includes(environment??"")||!arn||!new RegExp(`^arn:aws:lambda:ap-northeast-2:996702758024:function:byus-media-${environment}$`).test(arn))throw new Error("Media worker target mismatch");
 const result=await lambda.send(new InvokeCommand({FunctionName:arn,InvocationType:"Event",Payload:Buffer.from(JSON.stringify({source:"byus.aws-media",environment,assetId}))}),{abortSignal:AbortSignal.timeout(5000)});
 if(result.StatusCode!==202)throw new Error("Media worker did not accept invocation");
}
