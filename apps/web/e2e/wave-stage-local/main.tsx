import { createRoot } from "react-dom/client";
import { WaveStageOperations } from "../../features/wave-stage/ui/wave-stage-screen";
import { WaveStageView } from "../../features/wave-stage/ui/wave-stage-view";
import { stageFixture, completedStage, metricsFixture, presentationFixture, tiktokFixture } from "./fixture";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
const query = new URLSearchParams(location.search);
const locale = query.get("locale") === "en" ? "en" : "ko";
const scenario = query.get("scenario");
document.documentElement.lang = locale;
createRoot(document.getElementById("root")!).render(query.get("mode") === "presentation" ?
  <WaveStageView locale={locale} stage={scenario === "results" || scenario === "long" ? completedStage(scenario === "long") : stageFixture} metrics={metricsFixture} presentation={{ ...presentationFixture, onchain: presentationFixture.onchain.state === "available" ? { ...presentationFixture.onchain, observedAt: new Date().toISOString() } : presentationFixture.onchain }} tiktok={{ ...tiktokFixture, creators: tiktokFixture.creators.map(item => ({ ...item, observedAt: new Date().toISOString() })) }} role={query.get("role") ?? "admin"} onDraw={() => {}} onRefresh={() => {}} /> :
  <WaveStageOperations owner="fixture-owner" locale={locale} role={query.get("role") ?? "admin"} getAccessToken={async () => "local-fixture-token"} />);
const fixtureLabel = document.createElement("div");
fixtureLabel.textContent = locale === "ko" ? "로컬 검증 화면 · 예시 데이터" : "Local preview · sample data";
fixtureLabel.style.cssText = "position:fixed;bottom:4px;left:36px;z-index:100;font:11px sans-serif;color:#65656d;background:white;padding:2px 4px";
document.body.append(fixtureLabel);
