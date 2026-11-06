#!/usr/bin/env node
// Writes public/lottie/stamp-press.json and its final frame public/lottie/stamp-press-final.svg. kyaa's own drawing: a rubber stamp comes down, hits, lifts away and leaves an ink ring with a check.
// Run: node apps/web/scripts/build-stamp-press-lottie.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FPS = 60, FRAMES = 54, SIZE = 240, C = SIZE / 2; // 0.9 seconds, one play
const HIT = 15;
const INK = "#d11b62", INK_DEEP = "#ad1457", BODY = "#232026", BODY_SOFT = "#4a4450";
const rgb = hex => [1, 3, 5].map(at => Number((parseInt(hex.slice(at, at + 2), 16) / 255).toFixed(4))).concat(1);
const still = k => ({ a: 0, k });
/** Keyframes as [frame, value, optional "in" to ease in towards the next one]. */
function moving(frames) {
  return { a: 1, k: frames.map(([t, s, ease], index) => {
    if (index === frames.length - 1) return { t, s };
    const n = s.length, accelerate = ease === "in";
    return { t, s, i: accelerate ? { x: Array(n).fill(0.9), y: Array(n).fill(0.9) } : { x: Array(n).fill(0.2), y: Array(n).fill(1) }, o: accelerate ? { x: Array(n).fill(0.6), y: Array(n).fill(0) } : { x: Array(n).fill(0.3), y: Array(n).fill(0.6) } };
  }) };
}
const transform = (extra = {}) => ({ ty: "tr", p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0), ...extra });
const group = (nm, it, tr) => ({ ty: "gr", nm, it: [...it, transform(tr)] });
const ellipse = d => ({ ty: "el", nm: "ellipse", p: still([0, 0]), s: still([d, d]) });
const rect = (w, h, r, y = 0) => ({ ty: "rc", nm: "rect", p: still([0, y]), s: still([w, h]), r: still(r) });
const fill = (hex, o = 100) => ({ ty: "fl", nm: "fill", c: still(rgb(hex)), o: still(o), r: 1 });
const stroke = (hex, w) => ({ ty: "st", nm: "stroke", c: still(rgb(hex)), o: still(100), w: still(w), lc: 2, lj: 2 });
const polyline = points => ({ ty: "sh", nm: "path", ks: still({ c: false, v: points, i: points.map(() => [0, 0]), o: points.map(() => [0, 0]) }) });
const layer = (ind, nm, shapes, ks) => ({ ddd: 0, ind, ty: 4, nm, sr: 1, ks: { o: still(100), r: still(0), p: still([C, C, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]), ...ks }, ao: 0, shapes, ip: 0, op: FRAMES, st: 0, bm: 0 });

// The ring tilts slightly, as a hand-pressed stamp does.
const TILT = -8, RING = 168, INNER = 138;
const CHECK = [[-34, 2], [-10, 26], [36, -24]];
const handle = layer(1, "stamp", [
  group("knob", [ellipse(44), fill(BODY)], { p: still([0, -92]) }),
  group("neck", [rect(26, 42, 6, -58), fill(BODY_SOFT)]),
  group("block", [rect(132, 34, 10, -22), fill(BODY)]),
  group("rubber", [rect(148, 12, 4, 0), fill(INK_DEEP)]),
], {
  p: moving([[0, [C, 20, 0], "in"], [HIT, [C, C + 6, 0]], [21, [C, C + 6, 0]], [38, [C, -60, 0]], [FRAMES, [C, -60, 0]]]),
  s: moving([[0, [118, 118, 100], "in"], [HIT, [100, 100, 100]], [17, [108, 90, 100]], [21, [100, 100, 100]], [FRAMES, [100, 100, 100]]]),
  o: moving([[0, [100]], [34, [100]], [39, [0]], [FRAMES, [0]]]),
});
const impression = layer(2, "impression", [
  group("check", [polyline(CHECK), stroke(INK, 14)]),
  group("inner", [ellipse(INNER), stroke(INK, 3)]),
  group("ring", [ellipse(RING), stroke(INK, 8)]),
  ...[[0, -76], [0, 76], [-76, 0], [76, 0]].map(([x, y], index) => group(`mark-${index}`, [ellipse(5), fill(INK)], { p: still([x, y]) })),
], {
  r: still(TILT),
  o: moving([[HIT - 1, [0]], [HIT, [100]], [FRAMES, [100]]]),
  s: moving([[HIT, [114, 114, 100]], [HIT + 12, [100, 100, 100]], [FRAMES, [100, 100, 100]]]),
});
const bleed = layer(3, "ink-bleed", [group("wash", [ellipse(RING), fill(INK)])], {
  o: moving([[HIT - 1, [0]], [HIT, [34]], [FRAMES - 8, [9]], [FRAMES, [9]]]),
  s: moving([[HIT, [62, 62, 100]], [FRAMES - 16, [100, 100, 100]], [FRAMES, [100, 100, 100]]]),
});
const SPLATS = [[-20, 8], [28, 6], [72, 5], [118, 7], [160, 5], [206, 8], [250, 5], [300, 7], [338, 5]];
const splatter = layer(4, "splatter", SPLATS.map(([deg, d], index) => {
  const rad = deg * Math.PI / 180, at = r => [Number((Math.cos(rad) * r).toFixed(2)), Number((Math.sin(rad) * r).toFixed(2))];
  return group(`splat-${index}`, [ellipse(d), fill(INK)], {
    p: moving([[HIT, at(66)], [HIT + 20, at(104 + (index % 3) * 6)], [FRAMES, at(104 + (index % 3) * 6)]]),
    o: moving([[HIT - 1, [0]], [HIT, [100]], [HIT + 18, [0]], [FRAMES, [0]]]),
  });
}));

const animation = { v: "5.7.4", fr: FPS, ip: 0, op: FRAMES, w: SIZE, h: SIZE, nm: "kyaa stamp press", ddd: 0, assets: [], layers: [handle, impression, bleed, splatter] };
const finalFrame = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}"><g transform="translate(${C} ${C})"><circle r="${RING / 2}" fill="${INK}" opacity=".09"/><g transform="rotate(${TILT})" fill="none" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round"><circle r="${RING / 2}" stroke-width="8"/><circle r="${INNER / 2}" stroke-width="3"/><polyline points="${CHECK.map(point => point.join(",")).join(" ")}" stroke-width="14"/><g fill="${INK}" stroke="none">${[[0, -76], [0, 76], [-76, 0], [76, 0]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.5"/>`).join("")}</g></g></g></svg>\n`;
const write = (name, text) => writeFileSync(fileURLToPath(new URL(`../public/lottie/${name}`, import.meta.url)), text);
write("stamp-press.json", `${JSON.stringify(animation)}\n`);
write("stamp-press-final.svg", finalFrame);
