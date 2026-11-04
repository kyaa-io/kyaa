# Global benefits, capsule and raffle — F01/F07/F06

## Implementation
- `/benefits` selects the real GroupBenefitsScreen only with `KYAA_GROUPS_ENABLED=true`; gate-off retains BenefitsScreen and its validated creator query.
- Benefits uses authenticated `/api/me/wallet`, independent paginated `/api/groups/benefits?kind=raffles|missions`, and the real public creator catalog. Shared request validation, auth, owner-change cancellation and wallet-change refresh are retained. Cursor pages deduplicate IDs and reset on owner changes. Zero mission rewards remain visible. Errors, empty states and guests stay distinct.
- Source section order: balances/history → lucky draws → creator support and point events. Actual data supplies names, images, balances, deadlines and rewards. Capsule is a generic route entry, not a fabricated live campaign. All new interface copy covers APP_LOCALES.
- Capsule and raffle use the global benefits frame without a group identity/tabs or extra group-detail fetch. `pageId` does not select group navigation. Global `/benefits/:id` refresh selects Favorites/덕질 only with the release gate on.
- The real capsule receives the source stacked desktop controls, ticket icon and action arrow without localPresentation. Wrapped radio labels use content-sized rows; the rendered Russian overlap was reproduced and fixed.
- Raffle retains actual provider/consent/limit data, existing one-ticket default, real confirmation/receipt handling and uncropped goods imagery. Shared frame columns and metadata rows now align without the implicit group header.

## Observed verification
- Focused Vitest: **91 passed in 10 files**, `evidence/focused-tests.log`.
- Focused TypeScript including real imported production dependencies and harness: exit 0, `evidence/focused-typecheck.log`; command `node ../../node_modules/typescript/bin/tsc --noEmit -p e2e/groups-benefits-local/tsconfig.json`.
- **147 unique browser cases**, all 12 locales at390/1440; no localPresentation props. Ready benefits/capsule/raffle, capsule10 results, raffle confirmation, plus KO guest/loading/error/empty/long/retry/write-fenced/insufficient/nonmember/one-result/accepted states. **24 additional360/768 cases** cover KO/JA/VI/TH.
- Browser checks: zero horizontal overflow, clipped measured controls, image-load failures, console errors, card baseline failures and radio-label/metadata overlaps. Keyboard focus had a visible solid outline. Synthetic runtime actions prove cursor accumulation, owner reset, retry, no debit on confirmation, one/ten committed results and accepted raffle receipt.
- Exact target: `<repo-root>`, HEAD `ef3b6533dc821130679f58b93efc08ec8d2448f3` **plus dirty-source hashes** in `evidence/checks.json`. Captures/URLs/viewports/requests are in `evidence/manifest.json`; supplemental widths in `responsive-checks.json`. No authenticated DEV or production traffic was used.
- All locale contact sheets were visually inspected; full-size representative default/error/empty/long screens and the Russian fix were inspected. Readability, source section order, intact images and aligned card actions are verified for this fixture matrix, not full source-pixel parity.
- Source export SHA256 `056b235f042c45698de727d6fe809c3431b4d4909609c87c6e900fd945976141`. Governing roots: sX58m/ajFsZ, mF4bM, EqCqG/mC9VD/S38b4C. `source-*.png` are **renders of the byte-identical exported HTML**, not fresh native Pencil PNG exports. Source extraction session remains parent-owned.

## Reproduce
From `apps/web`:
```
node e2e/groups-benefits-local/server.mjs
node e2e/groups-benefits-local/run.mjs
node e2e/groups-benefits-local/responsive.mjs
```
Only the standalone localhost5196 harness is owned here. It mounts production components, replaces authentication/Next adapters and API responses with explicitly synthetic data, and performs mutations only in browser memory. It never imports groups-local previews or passes localPresentation. Evidence and Vite cache are ignored by Git. Parent port3128 was not changed.

## Exact product/test files
All paths relative to `apps/web`:
- `app/benefits/page.tsx`
- `components/fan-shell/fan-app-shell.tsx`
- `components/fan-shell/fan-app-shell.test.tsx`
- `features/groups/ui/group-activity-frame.tsx`
- `features/groups/ui/group-activity-frame.module.css`
- `features/groups/ui/group-activity-frame.test.tsx`
- `features/groups/ui/group-benefits-screen.tsx`
- `features/groups/ui/group-benefits.module.css`
- `features/groups/ui/group-benefits-copy.ts`
- `features/groups/ui/group-benefits-screen.test.tsx`
- `features/groups/ui/group-benefits-route.test.tsx`
- `features/group-capsule/capsule-screen.tsx`
- `features/group-capsule/capsule-screen.test.tsx`
- `features/group-capsule/capsule.module.css`
- `features/group-raffle/raffle.module.css`

`features/group-raffle/raffle-screen.tsx` was verified but did not need editing: its existing consumer now receives the fixed common frame. Added standalone harness files are confined to `e2e/groups-benefits-local/`.

## Evidence entry points
- `evidence/checks.json`, `manifest.json`, `responsive-checks.json`
- `evidence/benefits-ko-390-ready.png`, `benefits-ko-1440-ready.png`
- `evidence/capsule-ko-390-ready.png`, `capsule-ko-1440-ready.png`, `capsule-ru-390-ready.png`
- `evidence/raffle-ko-390-ready.png`, `raffle-ko-1440-ready.png`, `raffle-ko-390-confirm.png`
- `evidence/capsule-ko-1440-result10.png`, `raffle-ko-1440-accepted.png`
- `evidence/sheet-*-ready-*.png`, `sheet-*-result10-*.png`, `sheet-*-confirm-*.png`

## Limits and remaining source differences
- No economic policy was added. Both asset exchange links lead to the existing direct wallet exchange. No official/group ticket split, ad playback/completion, or ad-cancellation interpretation is introduced.
- The source-only campaign promises, aggregate raffle entry total, group tier/first-post/sidebar event fixtures, capsule historical-list/claim destinations are not copied into production. The global rail uses supported attendance/passport/wallet/benefits links; it is not a full pixel copy of the sample creator rail. No missing backend capability is claimed complete.
- Public creator links route to the existing support screen, which still resolves/validates the actual fan group and enforces existing wallet rules. This local test does not certify every deployed creator's support availability.
- Raffle detail and legacy detail Next server hydration were not run against a deployed authenticated server. The real production benefits route gate is exercised in the route unit test; actual components/shared shell are exercised in Vite. Legacy detail browser evidence isolates the real shell's exact URL selection rather than mocking a legacy benefit API.
- Whole-project `tsc --noEmit --incremental false` produced no diagnostics before two timeouts (180s and host420s). The bounded configuration passed; full-project type/build/CI is not claimed.
- Early harness retry loops raced detached buttons; they were corrected to await each actual recovered section. `browser-final.log` is the final clean run. No production code was weakened for these test failures.
- No independent second visual reviewer, full WCAG audit, live wallet mutations, DB changes, release edits, commit, push or deployment. Central DESIGN/coverage/release files and other owners' files were not edited.
