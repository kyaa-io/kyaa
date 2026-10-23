import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async original => ({ ...await original<typeof import("@aws-sdk/client-s3")>(), S3Client: class { send = mocks.send; } }));
import { S3CertificationStorage } from "../src/adapters/s3-certification-storage.js";
const rpc = vi.fn();
beforeEach(() => { rpc.mockReset().mockResolvedValue({ data: "ready", error: null }); mocks.send.mockReset().mockResolvedValue({ ContentLength: 3, ContentType: "image/webp", Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }); });
it("reads proofs only from the private logical namespace with a bounded request", async () => {
  const storage = new S3CertificationStorage("ap-northeast-2", "private-assets", { rpc } as never);
  const data = await storage.download("owner/mission/proof.webp");
  expect(data.size).toBe(3); expect(data.type).toBe("image/webp");
  expect(mocks.send.mock.calls[0]![0].input).toEqual({ Bucket: "private-assets", Key: "certification-proofs/owner/mission/proof.webp" });
  expect(mocks.send.mock.calls[0]![1].abortSignal).toBeInstanceOf(AbortSignal);
});
it.each(["../proof.webp", "owner//proof.webp", "owner\\proof.webp"])("rejects malformed keys before S3: %s", async path => {
  await expect(new S3CertificationStorage("ap-northeast-2", "private-assets", { rpc } as never).download(path)).rejects.toThrow("TELEGRAM_CERTIFICATION_STORAGE_UNAVAILABLE");
  expect(mocks.send).not.toHaveBeenCalled();
});
it.each(["delete_pending", "deleted"])("denies removed proofs before S3 (%s)", async state => {
  rpc.mockResolvedValueOnce({ data: state, error: null });
  await expect(new S3CertificationStorage("ap-northeast-2", "private-assets", { rpc } as never).download("owner/proof.webp")).rejects.toThrow("TELEGRAM_CERTIFICATION_STORAGE_UNAVAILABLE");
  expect(mocks.send).not.toHaveBeenCalled();
});
it("does not buffer oversized or inconsistent proof bodies", async () => {
  mocks.send.mockResolvedValueOnce({ ContentLength: 3145729 });
  const storage = new S3CertificationStorage("ap-northeast-2", "private-assets", { rpc } as never);
  await expect(storage.download("owner/proof.webp")).rejects.toThrow();
  mocks.send.mockResolvedValueOnce({ ContentLength: 2, Body: { transformToByteArray: async () => new Uint8Array([1]) } });
  await expect(storage.download("owner/proof.webp")).rejects.toThrow();
});
