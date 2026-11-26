# Chemi browser gate

From the candidate checkout, prepare the workspace with `kyaa-t3 deps` and install the matching Chromium with `node node_modules/@playwright/test/cli.js install chromium`. Run against DEV or a local server with Chemi enabled.

```sh
kyaa-t3 chemi-check https://dev.kyaa.io
kyaa-t3 chemi-check http://localhost:3479
```

The portable equivalent is `node apps/web/e2e/chemi-regression/check.mjs <url>`. Run from the checkout containing the suite. Each failure reports screen, locale, check and reason. Exit 1 means at least one check failed. The catalogue is read from the checkout, so target the matching deployment when reviewing candidate copy.

For the question screen, set `CHEMI_STORAGE_STATE` to a private Playwright storage-state file for a seeded test account (`kyaa-t3 chemi-check` fills it for DEV). The suite builds the question route from that account's newest saved Saju reading; set `CHEMI_ASK_PATH` to a same-origin saved result route with `ask=topic` only to pin a different one. Keep the file and reading ID outside Git. The test requires the actual question step to render. The optional `CHEMI_FORTUNE_SCENE_PATH` selects the fortune scene to inspect.

The translation checks detect missing or empty catalogue keys, Hangul in non-Korean visible copy, and visible English reference paragraphs reused in other locales. They are fallback detectors based on source strings and a rendered English control, with no semantic language classification. Browser variants cover 390×844 and 1440×900 at DPR 1. Motion uses real media advancement on first play and verifies zero playback and no media attachment on stopped visits. The entry banner videos repeat on every visit, so their revisit check expects playback; only the one-time first-transformation videos must stay stopped on a revisit.

The pixel checks cover the entry banner, match round table and run controls. They allow at most 1% of pixels to differ by more than 24 levels in any RGB channel. The reference captures use Chromium, Korean, and reduced motion. Use a consistent Chromium build and font environment for comparisons. A missing reference is a failed check.

To capture a reviewed candidate, use a new directory. Capture mode never updates committed references in place.

```sh
CHEMI_CAPTURE_DIR=/tmp/chemi-review node apps/web/e2e/chemi-regression/check.mjs <url> --capture-only
```

Review each image against the fixed-item evidence before replacing its reference. Set `CHEMI_BASELINE_DIR` to compare against a separately prepared set of reviewed images.
