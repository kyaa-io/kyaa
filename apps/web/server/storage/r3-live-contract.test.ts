import { test, expect, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import { S3Storage } from "./s3-storage";
test.each([false, true])("purges only matching versions and markers, partial failure %s", async fail => {
  const s3 = new S3Client({region:"ap-northeast-2"});
  const key = "public-assets/cms-assets/test.webp";
  const send = vi.spyOn(s3,"send");
  send.mockResolvedValueOnce({Versions:[{Key:key,VersionId:"one"},{Key:key+"x",VersionId:"other"}],IsTruncated:true,NextKeyMarker:key,NextVersionIdMarker:"one"} as never)
    .mockResolvedValueOnce({DeleteMarkers:[{Key:key,VersionId:"two"}]} as never)
    .mockResolvedValueOnce({} as never);
  if(fail) send.mockRejectedValueOnce(Error("denied"));
  else send.mockResolvedValueOnce({} as never);
  send.mockResolvedValueOnce({DeleteMarkers:fail?[{Key:key,VersionId:"two"}]:[]} as never);
  const rpc = vi.fn().mockResolvedValue({data:null,error:null});
  const storage = new S3Storage({AWS_REGION:"ap-northeast-2",S3_PUBLIC_BUCKET:"test",S3_PRIVATE_BUCKET:"private",ASSET_PUBLIC_BASE_URL:"https://example.org"}, {rpc} as never,s3);
  const result=await storage.purgeImageVersions("cms-assets","test.webp",8);
  expect(result).toEqual({deletedVersionIds:fail?["one"]:["one","two"],remainingVersions:fail?1:0});
  expect(send.mock.calls.slice(2,4).map(([cmd])=>cmd.input)).toEqual(["one","two"].map(VersionId=>({Bucket:"test",Key:key,VersionId})));
  expect(rpc).toHaveBeenCalledWith("finish_admin_image_purge",expect.objectContaining({p_remaining:fail?1:0}));
});
