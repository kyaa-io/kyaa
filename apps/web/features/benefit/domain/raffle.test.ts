import { describe, expect, it } from "vitest";
import { sortRafflesForList, type RaffleList } from "./raffle";

type R = RaffleList["raffles"][number];
const NOW = Date.parse("2026-11-09T00:00:00Z");
const raffle = (id: string, status: R["status"], opens: string | null, closes: string | null): R => ({
  id, benefitId: null, title: id, summary: id, imageUrl: null, winnerQuantity: 1, status,
  entryOpensAt: opens, entryClosesAt: closes, fulfillmentMethod: "digital", perFanTicketLimit: null,
});

describe("sortRafflesForList", () => {
  it("puts open draws first, then upcoming, closed and cancelled, keeping the server order inside a state", () => {
    const list = [
      raffle("closed-a", "closed", "2026-10-20T00:00:00Z", "2026-10-27T00:00:00Z"),
      raffle("closed-b", "closed", "2026-10-22T00:00:00Z", "2026-10-29T00:00:00Z"),
      raffle("cancelled", "cancelled", "2026-10-25T00:00:00Z", "2026-11-20T00:00:00Z"),
      raffle("open-a", "open", "2026-11-01T00:00:00Z", "2026-11-12T00:00:00Z"),
      raffle("upcoming", "open", "2026-11-10T00:00:00Z", "2026-11-20T00:00:00Z"),
      raffle("open-b", "open", "2026-11-05T00:00:00Z", null),
      raffle("ended-by-time", "open", "2026-10-01T00:00:00Z", "2026-11-08T00:00:00Z"),
    ];
    expect(sortRafflesForList(list, NOW).map(item => item.id)).toEqual(["open-a", "open-b", "upcoming", "closed-a", "closed-b", "ended-by-time", "cancelled"]);
  });

  it("returns a new array and leaves the input order alone", () => {
    const list = [raffle("closed", "closed", null, null), raffle("open", "open", null, null)];
    expect(sortRafflesForList(list, NOW).map(item => item.id)).toEqual(["open", "closed"]);
    expect(list.map(item => item.id)).toEqual(["closed", "open"]);
  });
});
