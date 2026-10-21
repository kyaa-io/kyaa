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
test('video and HTML wait for an explicit play; returning to a cue resets and pauses', () => {
 const show={cues:[{id:'slide',type:'slide'},{id:'video',type:'video'},{id:'html',type:'html'}]};
 const state=initialState(show),reduce=createReducer(show,state);
 const send=(action,values={})=>reduce({type:'command',id:crypto.randomUUID(),revision:state.revision,action,...values});
 send('goto',{cueId:'video'});
 assert.equal(state.media.playing,false);
 assert.throws(()=>send('media',{operation:'play'}),/디스플레이/);
 state.outputConnected=true;
 send('goto',{cueId:'video'});
 assert.equal(state.media.playing,false);
 send('media',{operation:'play'});
 assert.equal(state.media.playing,true);
 state.media.position=12;
 assert.deepEqual(send('goto',{cueId:'video'}),{action:'media',operation:'pause',position:0});
 assert.deepEqual(state.media,{playing:false,position:0});
 send('next');assert.equal(state.media.playing,false);
 send('media',{operation:'play'});assert.equal(state.media.playing,true);
 send('prev');assert.equal(state.media.playing,false);
 assert.equal(initialState(show,state).media.playing,false);
});
test('LIVE defaults to Changha only and WeNa remains muted', () => {
  const manifest = { cues: [{ id: 'a' }, { id: 'live', type: 'live' }] };
  const state = initialState(manifest), reduce = createReducer(manifest, state);
  reduce({ type: 'command', id: 'live', revision: 0, action: 'next' });
  assert.equal(state.audio, 'changha');
  assert.throws(() => reduce({ type: 'command', id: 'wena', revision: 1, action: 'audio', audio: 'wena' }));
});
