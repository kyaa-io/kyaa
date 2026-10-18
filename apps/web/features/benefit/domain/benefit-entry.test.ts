import { describe, expect, it } from "vitest";
import {
  enterBenefitRequestSchema,
  benefitEntryResultSchema,
  benefitEntryStateSchema,
} from "./benefit-entry";

describe("Benefit Ticket entry contract", () => {
  it("preserves campaign cancellation while accepting older entry responses", () => {
    const state = {
      campaignId: "11111111-1111-4111-8111-111111111111", creatorTicketBalance: 0, enteredTickets: 0,
      perFanTicketLimit: null, remainingBenefitTickets: null,
      entryOpensAt: "2026-10-18T00:00:00Z", entryClosesAt: "2026-10-25T14:59:59Z", canEnter: false, entries: [],
    };
    for (const cancelledAt of [undefined, null, "2026-10-20T12:00:00Z"]) {
      expect(benefitEntryStateSchema.parse({ ...state, cancelledAt }).cancelledAt).toBe(cancelledAt);
    }
    expect(() => benefitEntryStateSchema.parse({ ...state, cancelledAt: "invalid" })).toThrow();
  });
  it.each([1, 25])("accepts positive integer amount %i", (ticketAmount) => {
    expect(
      enterBenefitRequestSchema.parse({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        ticketAmount,
      }),
    ).toEqual(expect.objectContaining({ ticketAmount }));
  });

  it.each([0, -1, 1.5])("rejects invalid amount %s", (ticketAmount) => {
    expect(() =>
      enterBenefitRequestSchema.parse({
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
        ticketAmount,
      }),
    ).toThrow();
  });

  it("parses the canonical replay-safe result", () => {
    expect(
      benefitEntryResultSchema.parse({
        entryId: "22222222-2222-4222-8222-222222222222",
        benefitId: "33333333-3333-4333-8333-333333333333",
        campaignId: "44444444-4444-4444-8444-444444444444",
        ticketAmount: 2,
        benefitTicketTotal: 5,
        perFanTicketLimit: null,
        remainingBenefitTickets: null,
        ticketLedgerId: "55555555-5555-4555-8555-555555555555",
        resultingBalance: 20,
        replayed: true,
      }),
    ).toMatchObject({ benefitTicketTotal: 5, replayed: true });
  });
});
