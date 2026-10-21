import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, createReducer, mediaReport } from "../host/state.mjs";
const manifest = { cues: [{ id: "intro", nextOnEnd: "talk" }, { id: "talk" }] };
test("revision prevents double advance, IDs deduplicate and projection updates need no revision", () => {
  const state = initialState(manifest),
    reduce = createReducer(manifest, state);
  const c = { type: "command", id: "1", revision: 0, action: "next" };
  reduce(c);
  assert.equal(state.cueId, "talk");
  assert.deepEqual(reduce(c), { duplicate: true });
  assert.throws(() => reduce({ ...c, id: "2" }));
  assert.equal(state.revision, 1);
});
test("unsupported mutations and invalid positions fail closed", () => {
  const state = initialState(manifest),
    reduce = createReducer(manifest, state);
  for (const c of [
    { action: "draw" },
    { action: "pointer", x: -1, y: 0 },
    { action: "goto", cueId: "missing" },
  ])
    assert.throws(() =>
      reduce({ type: "command", id: "x", revision: 0, ...c }),
    );
  assert.equal(state.revision, 0);
});
test("only current intro completion advances and restart recovery pauses", () => {
  const state = initialState(manifest, { cueId: "intro" });
  assert.equal(
    mediaReport(state, manifest, {
      cueId: "old",
      playing: false,
      position: 37,
      ended: true,
    }),
    false,
  );
  mediaReport(state, manifest, {
    cueId: "intro",
    playing: false,
    position: 37,
    ended: true,
  });
  assert.equal(state.cueId, "talk");
  assert.equal(initialState(manifest, state).media.playing, false);
});
