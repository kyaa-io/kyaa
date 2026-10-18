import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only",()=>({}));
import { CertificationImageError, MAX_CERTIFICATION_FILE_BYTES, normalizeCertificationImage, normalizeBroadcastCertificationImage, MAX_BROADCAST_CERTIFICATION_FILE_BYTES } from "./certification-image";

describe("manual certification proof normalization",()=>{
  it("accepts JPEG and emits bounded metadata-free WebP",async()=>{
    const source=await sharp({create:{width:160,height:90,channels:3,background:"#ee3366"}}).jpeg().withMetadata({orientation:6}).toBuffer();
    const normalized=await normalizeCertificationImage(new Uint8Array(source));
    const metadata=await sharp(normalized.bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.orientation).toBeUndefined();
    expect(normalized.width).toBe(90);
    expect(normalized.height).toBe(160);
    expect(normalized.bytes.byteLength).toBeLessThanOrEqual(MAX_CERTIFICATION_FILE_BYTES);
  });
  it("rejects non-images and oversized requests",async()=>{
    await expect(normalizeCertificationImage(new TextEncoder().encode("not an image"))).rejects.toMatchObject({code:"INVALID_IMAGE"});
    await expect(normalizeCertificationImage(new Uint8Array(MAX_CERTIFICATION_FILE_BYTES+1))).rejects.toEqual(expect.objectContaining<Partial<CertificationImageError>>({code:"BODY_TOO_LARGE"}));
  });
});

it("accepts broadcast raw proofs up to10MiB while preserving ordinary3MiB and normalized3MiB limits", async () => {
 const jpeg=await sharp({create:{width:40,height:30,channels:3,background:"#336699"}}).jpeg().toBuffer();
 const bytes=new Uint8Array(MAX_CERTIFICATION_FILE_BYTES+1);bytes.set(jpeg);
 await expect(normalizeCertificationImage(bytes)).rejects.toMatchObject({code:"BODY_TOO_LARGE"});
 const broadcast=await normalizeBroadcastCertificationImage(bytes);
 expect(broadcast.bytes.byteLength).toBeLessThanOrEqual(MAX_CERTIFICATION_FILE_BYTES);
 expect((await sharp(broadcast.bytes).metadata()).format).toBe("webp");
 await expect(normalizeBroadcastCertificationImage(new Uint8Array(MAX_BROADCAST_CERTIFICATION_FILE_BYTES+1))).rejects.toMatchObject({code:"BODY_TOO_LARGE"});
});
it("keeps the24MP decompression limit for broadcast images", async () => {
 const bytes=await sharp({create:{width:6000,height:4001,channels:3,background:"#336699"}}).png().toBuffer();
 await expect(normalizeBroadcastCertificationImage(bytes)).rejects.toMatchObject({code:"INVALID_IMAGE"});
});
