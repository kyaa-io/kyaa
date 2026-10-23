import "server-only";
import { GetObjectCommand,S3Client } from "@aws-sdk/client-s3";
import { z } from "zod";
import { instagramPage,instagramRequestLocale } from "@/server/instagram/pages";
import { bufferConfig,digest } from "./core";
export async function pendingReceipt(request:Request,read?:(hash:string)=>Promise<unknown>):Promise<Response|null> {
 const params=new URL(request.url).searchParams,ids=params.getAll("id");
 if(ids.length!==1||!/^[A-Za-z0-9_-]{43}$/.test(ids[0]))return null;
 try {
  const hash=digest(ids[0]);let raw;
  if(read)raw=await read(hash);else {
   const c=bufferConfig();const object=await new S3Client({region:c.region}).send(new GetObjectCommand({Bucket:c.bucket,Key:`webhook-receipts/${c.environment}/${hash}.json`,ExpectedBucketOwner:"996702758024"}));
   if(!object.Body||!object.ContentLength||object.ContentLength>256||object.ServerSideEncryption!=="aws:kms"||object.SSEKMSKeyId!==c.kmsKeyId)return null;
   raw=JSON.parse(await object.Body.transformToString());
  }
  const receipt=z.object({state:z.enum(["pending","complete"]),expiresAt:z.number().int()}).strict().parse(raw);
  if(receipt.expiresAt<=Date.now())return null;
  const locale=instagramRequestLocale(request);
  if(receipt.state==="complete")return locale==="ko"?instagramPage("Instagram 연결 데이터 삭제 완료","<p>Kyaa에 저장된 Instagram 연결 정보와 수집한 미디어 정보를 삭제했어요.</p>",200,undefined,locale):instagramPage("Instagram connection data deleted","<p>We deleted the Instagram connection information and media data stored by Kyaa.</p>",200,undefined,locale);
  return locale==="ko"?instagramPage("삭제 요청을 접수했어요","<p>저장된 연결 정보를 삭제하고 있어요. 잠시 후 다시 확인해 주세요.</p>",200,undefined,locale):instagramPage("Deletion request received","<p>We are deleting the saved connection data. Please check again shortly.</p>",200,undefined,locale);
 }catch{return null;}
}
