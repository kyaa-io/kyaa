import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createSign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Environment, type JWSTransactionDecodedPayload, type ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";

vi.mock("server-only", () => ({}));
import { verifyAppleNotification, verifyAppleTransaction } from "./apple-verifier";

const bundleId = "kr.kyaa.app";
let certificateDirectory: string;
let rootPem: string;
let certificateChain: string[];
let leafKey: string;

function openssl(...args: string[]) {
  execFileSync("openssl", args, { cwd: certificateDirectory, stdio: "ignore" });
}

function certificateBase64(name: string): string {
  return readFileSync(join(certificateDirectory, name), "utf8")
    .replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/gu, "");
}

function signedTransaction(payload: JWSTransactionDecodedPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", x5c: certificateChain })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${header}.${body}`;
  const signature = createSign("SHA256").update(signingInput).end()
    .sign({ key: leafKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${signingInput}.${signature}`;
}

beforeAll(() => {
  certificateDirectory = mkdtempSync(join(tmpdir(), "byus-apple-verifier-"));
  writeFileSync(join(certificateDirectory, "intermediate.ext"), "basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n");
  writeFileSync(join(certificateDirectory, "leaf.ext"), "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n");
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "root.key");
  openssl("req", "-x509", "-new", "-key", "root.key", "-sha256", "-days", "2", "-subj", "/CN=Generic Root", "-out", "root.pem");
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "intermediate.key");
  openssl("req", "-new", "-key", "intermediate.key", "-subj", "/CN=Generic Intermediate", "-out", "intermediate.csr");
  openssl("x509", "-req", "-in", "intermediate.csr", "-CA", "root.pem", "-CAkey", "root.key", "-CAcreateserial", "-days", "2", "-sha256", "-extfile", "intermediate.ext", "-out", "intermediate.pem");
  openssl("ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", "leaf.key");
  openssl("req", "-new", "-key", "leaf.key", "-subj", "/CN=Generic Leaf", "-out", "leaf.csr");
  openssl("x509", "-req", "-in", "leaf.csr", "-CA", "intermediate.pem", "-CAkey", "intermediate.key", "-CAcreateserial", "-days", "2", "-sha256", "-extfile", "leaf.ext", "-out", "leaf.pem");
  rootPem = readFileSync(join(certificateDirectory, "root.pem"), "utf8");
  leafKey = readFileSync(join(certificateDirectory, "leaf.key"), "utf8");
  certificateChain = ["leaf.pem", "intermediate.pem", "root.pem"].map(certificateBase64);
});

afterAll(() => rmSync(certificateDirectory, { recursive: true, force: true }));

describe("Apple Store transaction verification", () => {
  it("selects the notification environment from signed data and verifies the full envelope", async () => {
    const notification: ResponseBodyV2DecodedPayload = {
      data: { environment: Environment.SANDBOX, bundleId, signedTransactionInfo: "transaction-proof" },
    };
    const decode = vi.fn(async () => notification);
    const verifierFactory = vi.fn(() => ({
      verifyAndDecodeTransaction: vi.fn(), verifyAndDecodeNotification: decode,
    }));
    const value = `e30.${Buffer.from(JSON.stringify(notification)).toString("base64url")}.signature`;
    await expect(verifyAppleNotification(value, { trustedRootsPem: rootPem, bundleId, verifierFactory })).resolves.toEqual(notification);
    expect(decode).toHaveBeenCalledWith(value);
    expect(verifierFactory).toHaveBeenCalledWith([expect.any(Buffer)], true, Environment.SANDBOX, bundleId, undefined);
    decode.mockRejectedValueOnce(new Error("invalid signature"));
    await expect(verifyAppleNotification(value, { trustedRootsPem: rootPem, bundleId, verifierFactory })).rejects.toMatchObject({ reason: "SIGNATURE" });
  });

  it("uses Apple's verifier with online certificate checks and maps a verified transaction", async () => {
    const payload: JWSTransactionDecodedPayload = {
      transactionId: "2000000000000001", productId: "kr.byus.ticket.10", bundleId,
      environment: Environment.SANDBOX, appAccountToken: "57000000-0000-4000-8000-000000000001",
      currency: "KRW", price: 1_000_000, quantity: 1, purchaseDate: Date.parse("2026-10-11T00:00:00Z"),
    };
    const notification: ResponseBodyV2DecodedPayload = {};
    const verifierFactory = vi.fn(() => ({
      verifyAndDecodeTransaction: vi.fn(async () => payload),
      verifyAndDecodeNotification: vi.fn(async () => notification),
    }));
    const value = `e30.${Buffer.from(JSON.stringify({ environment: Environment.SANDBOX })).toString("base64url")}.signature`;

    await expect(verifyAppleTransaction(value, { trustedRootsPem: rootPem, bundleId, verifierFactory })).resolves.toMatchObject({
      store: "apple", environment: "sandbox", externalTransactionId: payload.transactionId,
      profileId: payload.appAccountToken, productId: payload.productId, currency: "KRW", amountKrw: 1000,
      refundedKrw: 0, storeState: "purchased", storeEventAt: "2026-10-11T00:00:00.000Z",
    });
    expect(verifierFactory).toHaveBeenCalledWith([expect.any(Buffer)], true, Environment.SANDBOX, bundleId, undefined);
  });

  it("rejects a normally valid generic certificate chain that lacks Apple's certificate OIDs", async () => {
    const value = signedTransaction({
      transactionId: "2000000000000002", productId: "kr.byus.ticket.10", bundleId,
      environment: Environment.SANDBOX, currency: "KRW", price: 1_000_000, quantity: 1,
      signedDate: Date.now(), purchaseDate: Date.now(),
    });
    await expect(verifyAppleTransaction(value, { trustedRootsPem: rootPem, bundleId }))
      .rejects.toMatchObject({ reason: "SIGNATURE" });
  });
});
