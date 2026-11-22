/** Keyboard play for 최애 런. The on-screen key guide reads from these lists, so what it shows is what works. */
export const RUN_KEYS = {
  jump: ["Space", "ArrowUp", "KeyW"],
  slide: ["ShiftLeft", "ShiftRight", "ArrowDown", "KeyS"],
  pause: ["KeyP", "Escape"],
  confirm: ["Enter", "NumpadEnter"],
} as const;

/** Keycaps shown in the guide: the first two keys of each action. */
export const RUN_KEYCAPS = { jump: ["Space", "↑"], slide: ["Shift", "↓"], pause: ["P", "Esc"], confirm: ["Enter"] } as const;

/** `aria-keyshortcuts` value for the pause button. */
export const RUN_PAUSE_SHORTCUT = "P Escape";

export type RunKeyStage = "ready" | "play" | "paused" | "over";
export type RunKeyAction = "start" | "jump" | "jumpUp" | "slideDown" | "slideUp" | "pause" | "resume";
/** Where the key went: a focused button or link handles Enter (and Space) itself; a text field keeps every key. */
export type RunKeyTarget = "control" | "field" | "page";
export type RunKey = { code: string; type: "keydown" | "keyup"; repeat: boolean; modifier: boolean; target: RunKeyTarget };

const has = (list: readonly string[], code: string) => list.includes(code);

export function runKeyAction(key: RunKey, stage: RunKeyStage): RunKeyAction | undefined {
  const { code, target } = key;
  if (target === "field") return undefined;
  if (key.type === "keyup") {
    if (has(RUN_KEYS.jump, code)) return "jumpUp";
    if (has(RUN_KEYS.slide, code)) return "slideUp";
    return undefined;
  }
  if (key.repeat || key.modifier) return undefined;
  const nativeClick = target === "control" && (code === "Space" || has(RUN_KEYS.confirm, code));
  if (stage === "ready") {
    if (nativeClick) return undefined;
    if (has(RUN_KEYS.jump, code) || has(RUN_KEYS.confirm, code)) return "start";
  } else if (stage === "play") {
    // While running, Space always jumps — even when the sound or pause button still has focus from a click.
    if (has(RUN_KEYS.jump, code)) return "jump";
    if (has(RUN_KEYS.slide, code)) return "slideDown";
    if (has(RUN_KEYS.pause, code)) return "pause";
  } else if (stage === "paused") {
    if (has(RUN_KEYS.pause, code)) return "resume";
    if (!nativeClick && has(RUN_KEYS.confirm, code)) return "resume";
  }
  return undefined;
}

export function runKeyTarget(target: EventTarget | null): RunKeyTarget {
  if (!(target instanceof HTMLElement)) return "page";
  if (target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return "field";
  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return "control";
  return "page";
}

export function readRunKey(event: KeyboardEvent): RunKey {
  return {
    code: event.code,
    type: event.type === "keyup" ? "keyup" : "keydown",
    repeat: event.repeat,
    modifier: event.metaKey || event.ctrlKey || event.altKey,
    target: runKeyTarget(event.target),
  };
}
