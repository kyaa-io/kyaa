import { describe, expect, it } from "vitest";
import { RUN_KEYCAPS, RUN_KEYS, runKeyAction, type RunKey, type RunKeyStage } from "./keys";

const down = (code: string, more: Partial<RunKey> = {}): RunKey => ({ code, type: "keydown", repeat: false, modifier: false, target: "page", ...more });
const up = (code: string, more: Partial<RunKey> = {}): RunKey => ({ ...down(code, more), type: "keyup" });

describe("runKeyAction", () => {
  it("starts from the ready veil with any jump key or Enter", () => {
    for (const code of [...RUN_KEYS.jump, ...RUN_KEYS.confirm]) expect(runKeyAction(down(code), "ready"), code).toBe("start");
    expect(runKeyAction(down("ArrowDown"), "ready")).toBeUndefined();
    expect(runKeyAction(down("Escape"), "ready")).toBeUndefined();
  });

  it("leaves Space and Enter to a focused button before the run, so the button is pressed once", () => {
    expect(runKeyAction(down("Space", { target: "control" }), "ready")).toBeUndefined();
    expect(runKeyAction(down("Enter", { target: "control" }), "ready")).toBeUndefined();
    expect(runKeyAction(down("ArrowUp", { target: "control" }), "ready")).toBe("start");
    expect(runKeyAction(down("Enter", { target: "control" }), "paused")).toBeUndefined();
  });

  it("jumps, slides while held and pauses during the run", () => {
    for (const code of RUN_KEYS.jump) expect(runKeyAction(down(code), "play"), code).toBe("jump");
    for (const code of RUN_KEYS.slide) {
      expect(runKeyAction(down(code), "play"), code).toBe("slideDown");
      expect(runKeyAction(up(code), "play"), code).toBe("slideUp");
    }
    for (const code of RUN_KEYS.pause) expect(runKeyAction(down(code), "play"), code).toBe("pause");
    expect(runKeyAction(down("Enter"), "play")).toBeUndefined();
  });

  it("keeps Space as jump while a clicked header button still has focus", () => {
    expect(runKeyAction(down("Space", { target: "control" }), "play")).toBe("jump");
  });

  it("resumes with P, Esc or Enter and ignores jump keys while paused", () => {
    for (const code of [...RUN_KEYS.pause, ...RUN_KEYS.confirm]) expect(runKeyAction(down(code), "paused"), code).toBe("resume");
    expect(runKeyAction(down("Space"), "paused")).toBeUndefined();
  });

  it("ignores held-down repeats, shortcuts with Ctrl·Cmd·Alt, typing in a field and the finished run", () => {
    expect(runKeyAction(down("Space", { repeat: true }), "play")).toBeUndefined();
    expect(runKeyAction(down("KeyP", { repeat: true }), "play")).toBeUndefined();
    expect(runKeyAction(down("KeyW", { modifier: true }), "play")).toBeUndefined();
    expect(runKeyAction(down("Space", { target: "field" }), "play")).toBeUndefined();
    expect(runKeyAction(up("ShiftLeft", { target: "field" }), "play")).toBeUndefined();
    for (const code of [...RUN_KEYS.jump, ...RUN_KEYS.pause, ...RUN_KEYS.confirm]) expect(runKeyAction(down(code), "over"), code).toBeUndefined();
  });

  it("still lets go of a held key whatever the stage, so nothing stays pressed", () => {
    const stages: RunKeyStage[] = ["ready", "play", "paused", "over"];
    for (const stage of stages) {
      expect(runKeyAction(up("Space"), stage)).toBe("jumpUp");
      expect(runKeyAction(up("ArrowDown", { repeat: true }), stage)).toBe("slideUp");
    }
  });

  it("shows only keycaps that the run accepts", () => {
    const names: Record<string, string> = { Space: "Space", "↑": "ArrowUp", Shift: "ShiftLeft", "↓": "ArrowDown", P: "KeyP", Esc: "Escape", Enter: "Enter" };
    for (const [action, caps] of Object.entries(RUN_KEYCAPS)) {
      for (const cap of caps) expect(RUN_KEYS[action as keyof typeof RUN_KEYS] as readonly string[], `${action} ${cap}`).toContain(names[cap]);
    }
  });
});
