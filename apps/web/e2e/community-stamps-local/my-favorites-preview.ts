// Local-only synthetic owner data; renders the real MY screen without production access.
const params = new URLSearchParams(location.search);
if (params.get("view") === "my-favorites") {
  const entries = [
    ["aryeom", "아렴", "/images/calendar/aryeom-profile.jpg"],
    ["wena", "위나", "/images/kyaa-wave/wena-profile.webp"],
    ["yuna", "유나", "/images/calendar/yuna-portrait.jpg"],
    ["ifewknow", "이퓨", "/images/celebrities/ifewknow/hero-studio.jpg"],
    ["thisisj-official", "제희", "/images/celebrities/thisisj-official/hero-editorial-portrait-20260911.webp"],
    ["changha", "창하", "/images/celebrities/changha/portrait-20261021.webp"],
    ["elina", "엘리나", "/images/guest-home/elina-card.jpg"],
    ["jenny-jeong", "제니정", "/images/calendar/jenny-jeong-profile.jpg"],
    ["xin-group", "X:IN", "/images/celebrities/xin/hero-concept-mobile.jpg"],
    ["park-myungho", "박명호", "/images/celebrities/park-myungho/hero-portrait.jpg"],
    ["kara", "KARA", "/images/guest-home/kara-card.jpg"],
    ["katseye", "KATSEYE", "/images/celebrities/katseye/card.webp"],
    ["nchive", "NCHIVE", "/images/celebrities/nchive/official-emblem-20261014.jpg"],
    ["wena-live", "위나 LIVE", "/images/kyaa-wave/wena-profile.webp"],
    ["long-name", "Aleksandra Wiśniewska-Kowalczyk", "/images/guest-home/elina-card.jpg"],
  ];
  const creators = entries.map(([slug, name, image], index) => ({
    celebrity: { slug, name, image, isPublic: true }, relationship: "passport",
    passport: { id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`, tier: "Silver", score: 15, remainingToNextTier: 35 },
    ticketBalance: 4, firstReaction: null,
  }));
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.pathname === "/api/me/summary") {
      if (params.get("data") === "error") return Promise.resolve(Response.json({}, { status: 503 }));
      return Promise.resolve(Response.json({ summary: {
        profile: { nickname: "별빛팬" }, creators: params.get("data") === "empty" ? [] : creators,
        live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] },
        collection: { passportCount: creators.length, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0,
      } }));
    }
    if (url.pathname === "/api/community-stamps") return Promise.resolve(Response.json({ stamps: [], today: "2026-10-30" }));
    if (url.pathname === "/api/me/avatar") return Promise.resolve(Response.json({ avatar: { initialCharacterId: "star-cream", characterId: "star-cream", source: "character", hasImage: false, revision: 1 } }));
    if (url.pathname.startsWith("/api/")) return Promise.resolve(Response.json({ raffles: [], count: 0, notifications: [], celebritySlugs: [] }));
    return originalFetch(input, init);
  };
}
