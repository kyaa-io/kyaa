import { describe, expect, it } from "vitest";
import { goodSchema } from "./domain";

const id = "10000000-0000-4000-8000-000000000001";
const good = {
  id,
  benefitId: "20000000-0000-4000-8000-000000000001",
  title: "Published prize",
  imageUrl: null,
  fulfillmentMethod: "digital",
  fulfillmentStatus: "digital_delivered",
  wonAt: "2030-01-01T00:00:00Z",
  digitalDelivery: null,
  recipientDeadlineAt: null,
  recipientPolicy: null,
};

describe("mobile benefit good share capability", () => {
  it("accepts only the canonical public benefit path or null", () => {
    expect(goodSchema.safeParse({ ...good, shareUrl: `/benefits/${good.benefitId}` }).success).toBe(true);
    expect(goodSchema.safeParse({ ...good, shareUrl: null }).success).toBe(true);
    expect(goodSchema.safeParse({ ...good, shareUrl: `/my/goods/${id}` }).success).toBe(false);
    expect(goodSchema.safeParse({ ...good, shareUrl: `https://private.example/${id}` }).success).toBe(false);
  });
});
