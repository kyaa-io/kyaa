export function initialState(manifest, saved = {}) {
  return {
    revision: 0,
    cueId: manifest.cues.some((c) => c.id === saved.cueId)
      ? saved.cueId
      : manifest.cues[0].id,
    scene: "dashboard",
    scope: "all",
    layout: "center",
    audio: "none",
    media: { playing: false, position: 0 },
    projection: null,
    sourceConnected: false,
    sourceUpdatedAt: null,
    connections: 0,
    outputConnected: false,
    networkUrls: [],
    error: null,
  };
}
export function createReducer(manifest, state) {
  const seen = new Set();
  return (command) => {
    if (
      !command ||
      command.type !== "command" ||
      typeof command.id !== "string" ||
      command.id.length > 100
    )
      throw Error("잘못된 명령입니다.");
    if (seen.has(command.id)) return { duplicate: true };
    const transient = ["pointer", "explorer"].includes(command.action);
    if (!transient && command.revision !== state.revision)
      throw Error("화면이 변경되었습니다. 현재 상태에서 다시 선택해 주세요.");
    const oneOf = (value, values) => {
      if (!values.includes(value)) throw Error("허용되지 않은 값입니다.");
      return value;
    };
    const unit = (v) => {
      if (!Number.isFinite(v) || v < 0 || v > 1)
        throw Error("잘못된 위치입니다.");
      return v;
    };
    let effect = { action: command.action };
    if (["next", "prev", "goto"].includes(command.action)) {
      const index = manifest.cues.findIndex((c) => c.id === state.cueId);
      const cue =
        command.action === "goto"
          ? manifest.cues.find((c) => c.id === command.cueId)
          : manifest.cues[
              Math.max(
                0,
                Math.min(
                  manifest.cues.length - 1,
                  index + (command.action === "next" ? 1 : -1),
                ),
              )
            ];
      if (!cue) throw Error("큐를 찾을 수 없습니다.");
      const repeatedCue = state.cueId === cue.id;
      state.cueId = cue.id;
      state.layout = cue.layout || "center";
      state.media = { playing: state.outputConnected && ["video", "html"].includes(cue.type), position: 0 };
      if (repeatedCue && state.media.playing) effect = { action: "media", operation: "restart" };
      state.audio = "none";
    } else if (command.action === "scene")
      state.scene = oneOf(command.scene, [
        "dashboard",
        "records",
        "explorer",
        "draw",
        "results",
      ]);
    else if (command.action === "scope")
      state.scope = oneOf(command.scope, ["all", "event-day"]);
    else if (command.action === "layout")
      state.layout = oneOf(command.layout, [
        "triptych",
        "center",
        "performance",
      ]);
    else if (command.action === "audio")
      state.audio = oneOf(command.audio, ["none", "changha", "wena"]);
    else if (command.action === "media") {
      effect.operation = oneOf(command.operation, ["play", "pause", "restart"]);
      state.media.playing = command.operation !== "pause";
      if (command.operation === "restart") state.media.position = 0;
    } else if (command.action === "pointer")
      effect = {
        action: "pointer",
        x: unit(command.x),
        y: unit(command.y),
        visible: command.visible === true,
      };
    else if (command.action === "explorer") {
      effect.operation = oneOf(command.operation, [
        "click",
        "scroll",
        "back",
        "return",
      ]);
      if (effect.operation === "click") {
        effect.x = unit(command.x);
        effect.y = unit(command.y);
      }
      if (effect.operation === "scroll") {
        if (!Number.isFinite(command.deltaY))
          throw Error("잘못된 스크롤입니다.");
        effect.deltaY = Math.max(-1000, Math.min(1000, command.deltaY));
      }
    } else if (command.action !== "refresh")
      throw Error("지원하지 않는 명령입니다.");
    seen.add(command.id);
    if (seen.size > 2000) seen.delete(seen.values().next().value);
    if (!transient) state.revision++;
    return effect;
  };
}
export function mediaReport(state, manifest, report) {
  if (
    !report ||
    report.cueId !== state.cueId ||
    typeof report.playing !== "boolean" ||
    !Number.isFinite(report.position) ||
    report.position < 0
  )
    return false;
  state.media = { playing: report.playing, position: report.position };
  const cue = manifest.cues.find((c) => c.id === state.cueId);
  if (
    report.ended === true &&
    cue.nextOnEnd &&
    manifest.cues.some((c) => c.id === cue.nextOnEnd)
  ) {
    state.cueId = cue.nextOnEnd;
    state.layout = "center";
    state.media = { playing: false, position: 0 };
    state.revision++;
  }
  return true;
}
