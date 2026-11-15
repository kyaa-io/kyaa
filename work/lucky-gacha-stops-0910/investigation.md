# 09:10 priority: mobile animation stops

A single iOS screenshot cannot identify the exact runtime event. Code investigation found two reproducible lifecycle faults and a timing fault:

- Low-FPS decisions accumulate the physics-clamped dt (at most 50ms), so a real 1 FPS device is measured as 20 FPS; detection takes far too long, and the intentional stop can be delayed while the scene appears frozen.
- MachineCanvas does not listen for pagehide/pageshow. A retained running flag after page restoration can leave no fresh rAF request. Visibilitychange alone does not cover that lifecycle.
- On WebGL loss, the current native handler stops/clears the engine, but the next React render calls sync() and restarts it without testing context loss. The canvas also stays visible over the fallback picture.

IntersectionObserver transitions and ordinary visibility return already call start/stop; retain these contracts and test them. Keep physical integration clamped, use actual frame elapsed time for performance policy, keep lost contexts stopped/hidden until caller remounts, and explicitly suspend/resume the page lifecycle. Low-performance fallback should display the existing complete still artwork rather than a stale canvas. Real iPhone low-power mode and the exact production event remain unverified.

This priority fix will be committed independently from the already-existing high-resolution/modal commits so the supervisor can pick it first.

## Verified changes

- `machine-canvas.test.tsx`: pagehide/pageshow suspension and lost-canvas assertions failed before implementation. All 5 tests now pass, including existing tests and offscreen/visible-tab return. The full capsule suite passed 32 tests; the last visibility-handler stop/reschedule adjustment was checked by its focused 5 tests and the final browser matrix. Unchanged callers' test results are reused.
- `lifecycle-checks.json`: Chromium and desktop WebKit at 390/1440 passed actual IntersectionObserver pause/resume, synthetic persisted pagehide/pageshow, native WEBGL_lose_context loss/restore, hidden lost canvas, still artwork, rebuild and no page errors. WebKit's GPU eligibility function is forced true in the test route only because this desktop benchmark is not an iPhone measurement; actual WebGL rendering/events still run. This does not validate iPhone hardware or iOS Low Power Mode.
- `slow-before.json`: with delayed 1-second rAF timestamps, after 109 further callbacks the old code still kept 3D. `slow-after.json`: the delayed-frame simulation now removes the canvas and shows the complete still (final readiness-guarded probe: 8 further callbacks; exact counters in JSON). These counts document outcomes, not a device speed comparison. Physics remains capped at 50ms; only performance-policy clocks use actual frame intervals. The scripted after probe asserts still/no canvas. This is a synthetic throttle, not a device FPS benchmark.
- Stable post-transition still/recovery captures were inspected at 390/1440; the existing complete illustration shows instead of a frozen/lost canvas. No extra copy or artwork changes are part of this priority fix.
- `npm run typecheck --workspace apps/web`: pass. Scoped eslint: pass. `design-lint --base HEAD`: no new violations. No live production writes/deployment performed.

## First-batch handoff

This priority change touches only MachineCanvas lifecycle, its existing stylesheet, the engine FPS clock, regression tests, release note and this independent fixture. It does not require the high-resolution/modal commits. The production/test diff passed `git apply --cached --check` against an alternate index of origin/main `74576120881a1510e6f2b96fa9255f707b3b0b9c`, without changing the working index or main. Pick the resulting fix commit alone before the high-resolution/modal changes.

Fixture: start `node work/lucky-gacha-stops-0910/server.mjs`, then run `node work/lucky-gacha-stops-0910/lifecycle-probe.mjs` and `node work/lucky-gacha-stops-0910/slow-frame-probe.mjs after` sequentially (they share the GPU). The server reconstructs the pre-modal card/stage from the pinned baseline, using current production engine/canvas/CSS and existing local auth/Next shims; no previous high-resolution task fixture is required.

The exact cause of the reported production iPhone stop cannot be concluded from one screenshot. The reproduced clock/lifecycle faults are fixed; real iPhone Safari, Low Power Mode and the production version still require supervisor integration/device verification. The existing main-only pre-push receipt policy remains in force; do not bypass it or deploy from this branch.
