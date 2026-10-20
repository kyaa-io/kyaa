import { createRoot } from "react-dom/client";
import { WaveStageOperations } from "../../features/wave-stage/ui/wave-stage-screen";
import { WaveStageView } from "../../features/wave-stage/ui/wave-stage-view";
import { stageFixture, completedStage, metricsFixture } from "./fixture";
import "../../app/globals.css";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
const query = new URLSearchParams(location.search);
const locale = query.get("locale") === "en" ? "en" : "ko";
const scenario = query.get("scenario");
document.documentElement.lang = locale;
const portrait = <video aria-label="Changha LIVE framing fixture" autoPlay muted loop playsInline style={{ width: "100%", height: "100%", objectFit: "contain" }} poster="/images/kyaa-wave/changha-cheer.jpg" />;
createRoot(document.getElementById("root")!).render(query.get("mode") === "presentation" ?
  <WaveStageView locale={locale} stage={scenario === "results" || scenario === "long" ? completedStage(scenario === "long") : stageFixture} metrics={metricsFixture} role={query.get("role") ?? "admin"} video={portrait} onDraw={() => {}} onRefresh={() => {}} /> :
  <WaveStageOperations owner="fixture-owner" locale={locale} role={query.get("role") ?? "admin"} getAccessToken={async () => "local-fixture-token"} />);
