import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestSchema } from "../host/manifest.mjs";
const valid = {
  version: 1,
  revision: "1",
  title: "Show",
  cues: [
    {
      id: "a",
      type: "slide",
      label: "A",
      section: "S",
      script: [],
      asset: "slides/a.png",
    },
  ],
};
test("show import requires typed cues, unique references and relative local assets", () => {
  assert(manifestSchema.safeParse(valid).success);
  for (const cues of [
    [{ ...valid.cues[0], asset: "../secret" }],
    [{ ...valid.cues[0], asset: "https://example.com" }],
    [{ ...valid.cues[0], script: undefined }],
    [...valid.cues, ...valid.cues],
    [{ ...valid.cues[0], nextOnEnd: "missing" }],
  ])
    assert.equal(manifestSchema.safeParse({ ...valid, cues }).success, false);
});
