import "server-only";
import { z } from "zod";
import type { MobileSettingsRepository } from "./repository";
import { MobilePushProviderError } from "./push-providers";

const claimSchema=z.array(z.object({deliveryId:z.uuid(),notificationId:z.uuid(),attemptCount:z.number().int().positive(),leaseExpiresAt:z.string()}));
const preparedSchema=z.object({deliveryId:z.uuid(),platform:z.enum(["ios","android"]),pushToken:z.string().min(8),locale:z.enum(["ko","en","ja","zh-Hans","zh-Hant","es","id","vi","th","pt","fr"]),payload:z.object({type:z.literal("notification_available"),notificationId:z.uuid(),category:z.string()}).strict()}).strict();
export interface MobilePushProvider { send(input:z.infer<typeof preparedSchema>):Promise<void> }

export async function deliverMobilePush(repository:MobileSettingsRepository,provider:MobilePushProvider,workerId:string,batchSize=50){
 const claims=claimSchema.parse(await repository.claimPush(workerId,batchSize,120)); let sent=0,skipped=0,failed=0;
 for(const claim of claims){
  const value=await repository.preparePush(claim.deliveryId,workerId); if(value===null){skipped++;continue;}
  const prepared=preparedSchema.parse(value);
  try{await provider.send(prepared);if(await repository.finishPush(prepared.deliveryId,workerId,true))sent++;else failed++;}
  catch(error){const providerError=error instanceof MobilePushProviderError?error:null;const code=providerError?.invalidToken?"INVALID_TOKEN":providerError?.code??(error instanceof Error&&error.message?error.message:"PROVIDER_ERROR");if(providerError?.invalidToken)await repository.invalidatePushToken(prepared.deliveryId,workerId);await repository.finishPush(prepared.deliveryId,workerId,false,code);failed++;}
 }
 return {claimed:claims.length,sent,skipped,failed};
}
