import { describe, expect, it } from "vitest";
import {
  ACTIVITY_SOURCE_BY_TYPE,
  mintFactsSchema,
  passportActivityContextSchema,
  stampSummarySchema,
  stampTypeLabel,
  stampShortLabel,
} from "./passport-read-model";

const sourceId = "11111111-1111-4111-8111-111111111111";

describe("membership Passport read model", () => {
  it("accepts certification-backed membership activity without LIVE context", () => {
    expect(ACTIVITY_SOURCE_BY_TYPE.membership).toBe("certification_submission");
    expect(passportActivityContextSchema.parse({
      sourceType: "certification_submission",
      sourceId,
      live: null,
    })).toEqual({ sourceType: "certification_submission", sourceId, live: null });
    expect(stampTypeLabel("ko", "membership")).toBe("멤버십 인증");
    expect(stampTypeLabel("en", "membership")).toBe("Membership Verification");
    expect(stampShortLabel("ko", "membership")).toBe("멤버십");
    expect(stampShortLabel("en", "membership")).toBe("MEMBER");
  });

  it("rejects LIVE context for certification submissions", () => {
    expect(passportActivityContextSchema.safeParse({
      sourceType: "certification_submission",
      sourceId,
      live: { slug: "kara-live", title: "KARA LIVE", linkable: true },
    }).success).toBe(false);
  });

  it("defaults membership to zero for old summaries and includes it in the total check", () => {
    expect(stampSummarySchema.parse({
      knowledge: 1,
      reservation: 0,
      attendance: 0,
      survey: 0,
      total: 1,
    }).membership).toBe(0);
    expect(stampSummarySchema.parse({
      knowledge: 1,
      reservation: 0,
      attendance: 0,
      survey: 0,
      membership: 1,
      total: 2,
    }).membership).toBe(1);
    expect(stampSummarySchema.safeParse({
      knowledge: 1,
      reservation: 0,
      attendance: 0,
      survey: 0,
      membership: 1,
      total: 1,
    }).success).toBe(false);
  });
});


describe("direct kyaa Stamp provenance", () => {
  const mint = { status: "minted", txHash: `0x${"1".repeat(64)}`, tokenId: "9", nftContract: "0x527a70c0f7cf129650dc282b709327c5958a4ccf" };
  it("accepts the approved direct contract without inventing replacement facts", () => {
    expect(mintFactsSchema.parse(mint)).toEqual(mint);
    expect(mintFactsSchema.parse({ status: "minted", txHash: mint.txHash, tokenId: "8" })).not.toHaveProperty("nftContract");
  });
  it.each([
    { ...mint, nftContract: `0x${"2".repeat(40)}` },
    { ...mint, metadataUri: "ipfs://unsupported-direct-field" },
    { ...mint, status: "queued" },
    { ...mint, txHash: null },
    { ...mint, tokenId: "0" },
    { ...mint, replacement: { batchId: mint.txHash, sourceActionId: mint.txHash, sourceHub: mint.nftContract, blockNumber: "1", blockHash: mint.txHash } },
  ])("rejects incomplete or unsupported facts %#", (value) => {
    expect(mintFactsSchema.safeParse(value).success).toBe(false);
  });
  it("retains the complete replacement provenance contract", () => {
    const replacement = { ...mint, metadataUri: "ipfs://replacement", originalAsset: { nftContract: `0x${"3".repeat(40)}`, tokenId: "8", metadataUri: "ipfs://original", txHash: mint.txHash }, replacement: { batchId: mint.txHash, sourceActionId: mint.txHash, sourceHub: `0x${"4".repeat(40)}`, blockNumber: "1", blockHash: mint.txHash } };
    expect(mintFactsSchema.parse(replacement)).toEqual(replacement);
    const { replacement: _proof, ...partial } = replacement;
    expect(mintFactsSchema.safeParse(partial).success).toBe(false);
  });
});
