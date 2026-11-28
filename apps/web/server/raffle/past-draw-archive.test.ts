import { expect, it, vi } from "vitest";
import { readPastDrawArchive } from "./past-draw-archive";
import { listPublicRaffles } from "./public-past-raffles";
import type { RaffleList } from "@/features/benefit/domain/raffle";

const rows = vi.hoisted(() => ({ rounds: [] as { id: string; campaign_id: string }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({}) }));
vi.mock("@/server/home-notice/home-notice-dependencies", () => ({ createPublicHomeNoticeRepository: () => ({}) }));
vi.mock("./public-past-raffles", () => ({ listPublicRaffles: vi.fn() }));
vi.mock("@/server/data/client", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => table === "past_draw_public_items"
        ? { in: () => ({ lte: () => ({ order: async () => ({ data: rows.rounds }) }) }) }
        : { lte: async () => ({ data: [] }) },
    }),
  }),
}));

it("does not link a published result to the detail of a different round for the same benefit", async () => {
  const benefitId = "10000000-0000-4000-8000-000000000001";
  const creator = { slug: "creator", name: "Creator", image: "/placeholder.png" };
  const makeRaffle = (id: string, day: number): RaffleList["raffles"][number] => ({
    id, benefitId, title: id, summary: id, imageUrl: null, status: "closed", entryOpensAt: null,
    entryClosesAt: `2026-10-0${day}T00:00:00Z`, resultsPublishedAt: "2026-10-05T00:00:00Z",
    winnerQuantity: 1, fulfillmentMethod: "digital", perFanTicketLimit: null,
  });
  const first = makeRaffle("10000000-0000-4000-8000-000000000002", 1);
  const second = makeRaffle("10000000-0000-4000-8000-000000000003", 2);
  rows.rounds = [{ id: first.id, campaign_id: first.id }, { id: second.id, campaign_id: second.id }];
  vi.mocked(listPublicRaffles).mockResolvedValue([{ raffle: first, creator }, { raffle: second, creator }]);
  const items = await readPastDrawArchive("en", new Date("2026-10-06T00:00:00Z"));
  expect(items.map(item => [item.title, item.resultPath])).toEqual([
    [second.id, null], [first.id, `/c/creator/raffles/${benefitId}`],
  ]);
});
