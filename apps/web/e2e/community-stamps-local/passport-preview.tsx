import { PassportCollectionScreen } from "../../features/passport/ui/passport-screens";
import { CreatorRafflesScreen, type Raffle } from "../../features/benefit/ui/creator-raffles-screen";
import type { AppLocale } from "../../i18n/locales";
import type { PublishedCelebrity } from "../../server/content/content-domain";

// Only this local fixture installs synthetic API responses; production never imports it.
if (["passports", "raffle-layout"].includes(new URLSearchParams(location.search).get("view") ?? "")) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.pathname === "/api/passports") {
      const mode = new URLSearchParams(location.search).get("data") ?? "mixed";
      if (mode === "error") return Promise.resolve(Response.json({}, { status: 503 }));
      const names = mode === "demo" ? ["KARA", "위나", "유나"] : ["RUN&MUSIC FESTIVAL", "위나", "유나", "제희", "박병호", "Aleksandra Wiśniewska-Kowalczyk"];
      const passports = names.slice(0, mode === "one" ? 1 : undefined).map((name, index) => ({
        id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
        owner: { nickname: null },
        celebrity: { slug: `fixture-${index}`, name, image: { url: "/images/guest-home/kara-card.jpg", alt: name, position: "center" } },
        businessStatus: "issued", issuedAt: "2026-07-21T00:00:00.000Z",
        mint: { status: mode === "mixed" && index === 1 ? "queued" : mode === "mixed" && index === 2 ? "permanent_failure" : "minted", txHash: mode === "mixed" && (index === 1 || index === 2) ? null : `0x${"a".repeat(64)}`, tokenId: mode === "mixed" && (index === 1 || index === 2) ? null : "42" },
        score: { points: index === 5 ? 1234567 : 1, level: "Bronze" },
        stampSummary: { knowledge: 1, reservation: 1, attendance: 0, survey: 0, total: 2 },
        display: { level: "Bronze", mintStatus: "Issued" },
      }));
      return Promise.resolve(Response.json({ passports: mode === "empty" ? [] : passports }));
    }
    if (url.pathname.includes("/benefits")) return Promise.resolve(Response.json({ benefits: [] }));
    if (url.pathname.startsWith("/api/")) return Promise.resolve(Response.json({ count: 0, notifications: [], celebritySlugs: [] }));
    return originalFetch(input, init);
  };
}

export function PassportPreview() { return <PassportCollectionScreen/>; }

const creator: PublishedCelebrity = { slug: "fixture", locale: "ko", name: "KARA", summary: "", image: { url: "/images/guest-home/kara-card.jpg", alt: "KARA", position: "center" }, roles: ["creator"], themes: [], socialLinks: [], displayOrder: 0, fanCount: 10 };
const raffles: Raffle[] = ["팬을 위한 선물", "함께한 순간을 간직하는 디지털 기념 선물", "새로운 선물"].map((title, index) => ({
  id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`, benefitId: index === 2 ? null : `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
  title, summary: index === 1 ? "팬 활동으로 모은 응모권을 원하는 선물에 사용해 보세요. 함께한 순간을 오래 간직할 수 있어요." : "팬 활동으로 모은 응모권으로 참여하세요.", imageUrl: null, winnerQuantity: index + 1,
  status: index === 2 ? "preparing" : "open", entryOpensAt: null, entryClosesAt: null, fulfillmentMethod: "digital", perFanTicketLimit: 3,
}));
export function RafflePreview({ locale }: { locale: AppLocale }) { return <CreatorRafflesScreen celebrity={creator} locale={locale} raffles={raffles}/>; }
