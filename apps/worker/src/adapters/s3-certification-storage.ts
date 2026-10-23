import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramCertificationStorage } from "../telegram-certification-worker.js";

export class S3CertificationStorage implements TelegramCertificationStorage {
  constructor(region: string, private readonly bucket: string, private readonly database: Pick<SupabaseClient, "rpc">, private readonly s3 = new S3Client({ region })) {}
  from(bucket:string){
    if(bucket!=="certification-proofs")throw new Error("Unsupported private worker bucket");
    return{download:async(path:string)=>{try{return{data:await this.download(path),error:null};}catch(error){return{data:null,error};}}};
  }
  async download(path: string): Promise<Blob> {
    try {
      if (!path || path.includes("\\") || path.split("/").some(part => !part || part === "." || part === ".." || /[\x00-\x1f\x7f]/.test(part))) throw new Error();
      const state = await this.database.rpc("get_s3_storage_object_state", { p_bucket: "certification-proofs", p_path: path });
      if (state.error || state.data === "delete_pending" || state.data === "deleted") throw new Error();
      const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: `certification-proofs/${path}` }), { abortSignal: AbortSignal.timeout(5_000) });
      if (!object.Body || object.ContentLength === undefined || object.ContentLength < 1 || object.ContentLength > 3145728) throw new Error();
      const bytes = await object.Body.transformToByteArray();
      if (bytes.byteLength !== object.ContentLength) throw new Error();
      return new Blob([Uint8Array.from(bytes)], { type: object.ContentType ?? "image/webp" });
    } catch { throw new Error("TELEGRAM_CERTIFICATION_STORAGE_UNAVAILABLE"); }
  }
}
