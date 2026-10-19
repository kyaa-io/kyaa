import { earningStatusSchema, supportRankingsSchema } from "../../server/mobile-fan-economy/domain";
import { fanCommunitySchema } from "../../features/fanpage/domain/fan-community";
import { feedPageSchema } from "../../features/fan-posts/domain/feed";
import { benefitCatalogItemSchema } from "../../features/benefit/domain/benefit";
import { benefitEntryResultSchema } from "../../features/benefit/domain/benefit-entry";
import { balance, fixtureCreators, id } from "./fixtures";

export function installRecentTodoFixtures() {
  const previous = window.fetch.bind(window);
  const entries = new Map<string, unknown>();
  const totals = new Map<string, number>();
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const params = new URLSearchParams(location.search);
    const state = params.get("state");
    if (state === "error" || state === "loading") return previous(input, init);
    const creators = fixtureCreators(state === "long");
    const slug = url.searchParams.get("celebritySlug") ?? params.get("creator") ?? creators[0].slug;
    const owner = params.get("owner") ?? "a";
    const b = balance(owner, slug);
    if (url.pathname === `/api/content-assets/${id(401)}`) return previous("/images/kyaa-wave/wena-profile.webp");
    const totalKey = `${owner}:${slug}`;
    const enteredTickets = totals.get(totalKey) ?? 0;
    const benefit = () => benefitCatalogItemSchema.parse({ id: id(200), slug: "example-lucky", creatorSlug: slug, title: "함께하는 순간의 선물", summary: "로컬 검수용 선물", imageUrl: "/images/raffles/elina-prize-collection-20260912.webp", eligibilityLabel: "팬 인증 완료", deliveryLabel: "디지털 수령", deliveryType: "text", allocationMode: "application_selection", applicationStatus: null, claimOpensAt: "2026-01-01T00:00:00Z", claimClosesAt: "2099-01-01T00:00:00Z", minimumScore: 0, minimumLevel: "Bronze", requiredStampType: null, requiredActivityType: null, state: "eligible", entry: { requiresFanVerification: true, fanVerified: true, campaignId: id(201), creatorTicketBalance: b.lucky, enteredTickets, perFanTicketLimit: 3, remainingBenefitTickets: 3 - enteredTickets, entryOpensAt: "2026-01-01T00:00:00Z", entryClosesAt: "2099-01-01T00:00:00Z", canEnter: b.lucky > 0 && enteredTickets < 3, entries: [] } });
    if (url.pathname === "/api/benefits") return Response.json({ benefits: [benefit()] });
    if (url.pathname === `/api/benefits/${id(200)}`) return Response.json({ benefit: benefit() });
    if (url.pathname === `/api/benefits/${id(200)}/entries` && init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      if (entries.has(body.idempotencyKey)) return Response.json(entries.get(body.idempotencyKey));
      if (!Number.isSafeInteger(body.ticketAmount) || body.ticketAmount < 1 || body.ticketAmount > Math.min(b.lucky, 3 - enteredTickets)) return Response.json({ error: { code: "INSUFFICIENT_TICKETS" } }, { status: 409 });
      b.lucky -= body.ticketAmount;
      totals.set(totalKey, enteredTickets + body.ticketAmount);
      const entry = benefitEntryResultSchema.parse({ entryId: id(601), benefitId: id(200), campaignId: id(201), ticketAmount: body.ticketAmount, benefitTicketTotal: enteredTickets + body.ticketAmount, perFanTicketLimit: 3, remainingBenefitTickets: 3 - enteredTickets - body.ticketAmount, ticketLedgerId: id(602), resultingBalance: b.lucky, replayed: false });
      entries.set(body.idempotencyKey, entry);
      return Response.json(entry);
    }
    if (url.pathname.includes("/mobile-fan-economy/support/rankings")) {
      return Response.json(supportRankingsSchema.parse({ items: state === "empty" ? [] : creators.map((c, i) => ({ rank: i + 1, celebrityId: id(i + 1), celebritySlug: c.slug, name: c.name, imageUrl: c.image.url, supportUnits: [12540, 7250, 0][i], supportKrw: [1254000, 725000, 0][i] })), nextOffset: null }));
    }
    if (url.pathname.endsWith("/earning-status")) {
      return Response.json(earningStatusSchema.parse({ celebrityId: id(1), policy: state === "unconfigured" ? { status: "unconfigured", version: null } : { status: "configured", version: "fixture-v1" }, actions: state === "unconfigured" ? [] : (["comment", "reaction", "verification", "certification", "share", "live_reservation"] as const).map((key, i) => ({ key, pointAmount: [5, 2, 20, 10, 3, 5][i], scope: "daily", dailyLimit: 3, usedToday: i === 1 ? 3 : 0, remainingToday: i === 1 ? 0 : 3, lifetimeLimit: null, lifetimeUsed: 0, status: i === 1 ? "daily_limit" : "available", sourceId: null, ledgerId: null })) }));
    }
    if (/\/api\/celebrities\/[^/]+\/fans$/.test(url.pathname)) {
      return Response.json(fanCommunitySchema.parse({ likeCount: 3, fanCount: 3, publicFanCount: 3, fans: state === "empty" ? [] : [{ profileId: id(501), nickname: "하루의 기록", avatarUrl: "/images/avatars/star-pink.webp" }] }));
    }
    if (/\/api\/celebrities\/[^/]+\/feed$/.test(url.pathname)) {
      return Response.json(feedPageSchema.parse({ items: state === "empty" ? [] : [{ kind: "fan_post", id: id(301), celebritySlug: slug, body: "오늘도 함께 응원해요 💗\n함께 나눈 순간을 오래 기억하고 싶어요.", visibility: "public", revision: 1, author: { nickname: "하루의 기록", avatarUrl: "/images/avatars/star-pink.webp" }, assets: params.get("photo") === "on" ? [{ id: id(401), width: 1200, height: 1200 }] : [], createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z", isOwner: false, likeCount: 3, liked: false, commentCount: 1 }], nextCursor: null }));
    }
    return previous(input, init);
  };
}
