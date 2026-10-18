import "server-only";
import { createHash } from "node:crypto";
import {
  Environment, SignedDataVerifier, type JWSTransactionDecodedPayload, type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { z } from "zod";
import type { VerifiedStoreTransaction } from "./domain";

const MAX_SIGNED_VALUE_BYTES = 64 * 1024;
const environmentHintSchema = z.object({ environment: z.enum([Environment.SANDBOX, Environment.PRODUCTION]) }).passthrough();

export class AppleStoreVerificationError extends Error {
  constructor(readonly reason: "FORMAT" | "CERTIFICATE" | "SIGNATURE" | "TRANSACTION" | "CONFIGURATION") { super(`APPLE_STORE_${reason}`); }
}

interface AppleVerifierLike {
  verifyAndDecodeTransaction(value: string): Promise<JWSTransactionDecodedPayload>;
  verifyAndDecodeNotification(value: string): Promise<ResponseBodyV2DecodedPayload>;
}
type AppleVerifierFactory = (roots: Buffer[], onlineChecks: boolean, environment: Environment, bundleId: string, appAppleId?: number) => AppleVerifierLike;

export interface AppleVerifierOptions {
  trustedRootsPem: string;
  bundleId: string;
  appAppleId?: number;
  verifierFactory?: AppleVerifierFactory;
}

function rootCertificates(pem: string): Buffer[] {
  const blocks = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/gu) ?? [];
  const roots = blocks.map((block) => Buffer.from(block.replace(/-----[^-]+-----|\s/gu, ""), "base64"));
  if (roots.length === 0 || roots.some((root) => root.byteLength === 0)) throw new AppleStoreVerificationError("CONFIGURATION");
  return roots;
}

function environmentHint(value: string, notification: boolean): Environment.SANDBOX | Environment.PRODUCTION {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > MAX_SIGNED_VALUE_BYTES) throw new AppleStoreVerificationError("FORMAT");
  const parts = value.split(".");
  if (parts.length !== 3) throw new AppleStoreVerificationError("FORMAT");
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return environmentHintSchema.parse(notification ? payload.data : payload).environment;
  }
  catch { throw new AppleStoreVerificationError("FORMAT"); }
}

function verifierFor(value: string, options: AppleVerifierOptions, notification = false): AppleVerifierLike {
  const environment = environmentHint(value, notification);
  if (environment === Environment.PRODUCTION && options.appAppleId === undefined) throw new AppleStoreVerificationError("CONFIGURATION");
  const factory = options.verifierFactory ?? ((roots, online, target, bundleId, appAppleId) =>
    new SignedDataVerifier(roots, online, target, bundleId, appAppleId));
  try { return factory(rootCertificates(options.trustedRootsPem), true, environment, options.bundleId, options.appAppleId); }
  catch (error) { if (error instanceof AppleStoreVerificationError) throw error; throw new AppleStoreVerificationError("CONFIGURATION"); }
}

function milliunitsToKrw(value: number | undefined): number | null {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0 || value % 1000 !== 0) return null;
  return value / 1000;
}

export async function verifyAppleNotification(signedPayload: string, options: AppleVerifierOptions): Promise<ResponseBodyV2DecodedPayload> {
  try { return await verifierFor(signedPayload, options, true).verifyAndDecodeNotification(signedPayload); }
  catch (error) { if (error instanceof AppleStoreVerificationError) throw error; throw new AppleStoreVerificationError("SIGNATURE"); }
}

export async function verifyAppleTransaction(signedTransactionInfo: string, options: AppleVerifierOptions): Promise<VerifiedStoreTransaction> {
  let payload: JWSTransactionDecodedPayload;
  try { payload = await verifierFor(signedTransactionInfo, options).verifyAndDecodeTransaction(signedTransactionInfo); }
  catch (error) { if (error instanceof AppleStoreVerificationError) throw error; throw new AppleStoreVerificationError("SIGNATURE"); }
  if (!payload.transactionId || !payload.productId || !payload.environment || ![Environment.SANDBOX, Environment.PRODUCTION].includes(payload.environment as Environment)) {
    throw new AppleStoreVerificationError("TRANSACTION");
  }
  const amountKrw = payload.currency === "KRW" && payload.quantity === 1 ? milliunitsToKrw(payload.price) : null;
  const eventAt = payload.revocationDate ?? payload.purchaseDate ?? payload.signedDate;
  return {
    store: "apple", environment: payload.environment === Environment.SANDBOX ? "sandbox" : "production",
    externalTransactionId: payload.transactionId, profileId: payload.appAccountToken ?? null,
    productId: payload.productId, currency: payload.currency ?? null, amountKrw,
    refundedKrw: payload.revocationDate && amountKrw ? amountKrw : 0,
    storeState: payload.revocationDate ? "revoked" : "purchased",
    verificationFingerprint: createHash("sha256").update(signedTransactionInfo).digest("hex"),
    storeEventAt: eventAt === undefined ? null : new Date(eventAt).toISOString(),
  };
}
