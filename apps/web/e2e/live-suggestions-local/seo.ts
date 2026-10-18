export async function loadSeoLive() {
  return { live: { title: "팬들과 함께하는 일요일 밤", celebrity: { slug: "sample-creator", name: "예시 크리에이터" }, watch: { provider: new URLSearchParams(location.search).get("platform") ?? "tiktok" } } };
}
