import { z } from "zod";
import { raffleFulfillmentPolicySchema } from "./raffle-fulfillment-policy";

export const raffleSchema = z.object({
  requiresFanVerification: z.boolean().optional(),
  id: z.string().uuid(),
  benefitId: z.string().uuid().nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  imageUrl: z.union([z.string().url(), z.string().regex(/^\/(?!\/)[^\s@]+$/)]).nullable(),
  winnerQuantity: z.number().int().positive(),
  status: z.enum(["preparing", "open", "closed", "cancelled"]),
  entryOpensAt: z.string().datetime({ offset: true }).nullable(),
  entryClosesAt: z.string().datetime({ offset: true }).nullable(),
  resultsPublishedAt: z.string().datetime({ offset: true }).nullable().optional(),
  fulfillmentMethod: z.enum(["digital", "physical_shipping", "on_site_pickup"]),
  fulfillmentPolicy: raffleFulfillmentPolicySchema.nullable().optional(),
  perFanTicketLimit: z.number().int().positive().nullable(),
});

export const raffleListSchema = z.object({ raffles: z.array(raffleSchema) });
export type RaffleList = z.infer<typeof raffleListSchema>;

export function raffleStatus(raffle: RaffleList["raffles"][number], now: number): RaffleList["raffles"][number]["status"] {
  if (raffle.status === "cancelled" || raffle.status === "closed") return raffle.status;
  if (raffle.entryClosesAt && now >= Date.parse(raffle.entryClosesAt)) return "closed";
  if (raffle.entryOpensAt && now < Date.parse(raffle.entryOpensAt)) return "preparing";
  return raffle.status;
}

type ListedRaffle = RaffleList["raffles"][number];
/** List place by state (QA-i M2): open, then upcoming, then closed (awaiting or published results), then cancelled. */
const LIST_RANK: Record<ListedRaffle["status"], number> = { open: 0, preparing: 1, closed: 2, cancelled: 3 };

/** Gift list order: an open draw is never pushed under closed ones. Same state keeps the server order (entry opening time); the sort is stable. */
export function sortRafflesForList<T extends ListedRaffle>(raffles: readonly T[], now: number): T[] {
  return raffles.map((raffle, index) => ({ raffle, index, rank: LIST_RANK[raffleStatus(raffle, now)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ raffle }) => raffle);
}
