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
test('entering a video cue autoplays only with an output; app recovery stays paused', () => {
 const show={cues:[{id:'slide',type:'slide'},{id:'video',type:'video'},{id:'html',type:'html'}]};
 const state=initialState(show),reduce=createReducer(show,state);
 reduce({type:'command',id:'without-output',revision:0,action:'goto',cueId:'video'});
 assert.equal(state.media.playing,false);
 state.outputConnected=true;
 assert.deepEqual(reduce({type:'command',id:'video',revision:1,action:'goto',cueId:'video'}),{action:'media',operation:'restart'});
 assert.equal(state.media.playing,true);
 assert.equal(initialState(show,state).media.playing,false);
 reduce({type:'command',id:'html',revision:2,action:'next'});
 assert.equal(state.media.playing,true);
 reduce({type:'command',id:'slide',revision:3,action:'goto',cueId:'slide'});
 assert.equal(state.media.playing,false);
});
