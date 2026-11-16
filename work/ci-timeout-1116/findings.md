# CI-TIMEOUT-1116 — 2026-11-16

Evidence: GitHub Actions jobs API, failed run 43793777408 attempt 1 and successful main run 43746849538. See steps.csv. Failed run log: compilation finished in 81s at 02:45:33 UTC; TypeScript began immediately and was cancelled at 02:57:38. No typecheck cache matched. This proves a cold typecheck bottleneck, not a specific runner infrastructure fault.

Dependency restore: failure 10s / main 15s; npm ci skipped in both. Browser installation: 22s / 35s. Local SQL/browser: 42s / 45s. Ordinary build: cancelled after 807s / skipped on main. The successful main run is not evidence that the ordinary build passed.

Fix: extend the existing exact-repository push delegation to release/production. aws-platform tests production-auth against the built DEV image before recording its digest; production promotes that image. Retain ordinary-build checks on PR/manual/called runs and forks. Required backend-security still runs full typecheck on both push branches. No tests or trust checks were removed from the release waiter.

Timeout: latest 50 successful workflow runs at investigation time, job durations (not queue-inclusive workflow durations), nearest-rank p95. Main n=45, p95=122s; production n=5, p95=804s. Use conservative pre-change production p95: ceil(804*1.5/60)=21 minutes. Small production sample and success-only sampling exclude censored failures; this is not a post-change latency estimate. timings.csv preserves all sample run IDs.

Automatic rerun considered, deferred: actual timeout appears as cancelled, which alone cannot distinguish manual cancellation. Safe implementation needs attempt-scoped job/check evidence, one-shot state surviving both pre/post-build invocations, explicit newer-attempt enforcement and actions:write. Existing waiter has actions:read and deliberately rejects cancelled/timed_out. Removing the redundant build addresses this incident without broadening permissions or retrying failed tests.

Validation: node --test scripts/aws-release-ci.test.mjs scripts/aws-release-workflow.test.mjs scripts/ci-workflows.test.mjs scripts/vercel-media-supply.test.mjs. Dependencies for these checks installed in isolated /tmp prefix (js-yaml 4.3.2 and TypeScript 5.9.3 match lockfile). No push or hosted workflow run performed.
