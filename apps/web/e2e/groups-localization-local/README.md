# F03 functional-copy localization — local evidence

## Scope and result

Production owners changed only under `apps/web/features/groups/ui/`:

- `gift-copy.ts`
- `group-invitation-copy.ts`
- `activity-evidence-task.tsx`
- `group-survey-form.tsx`
- new `activity-evidence-copy.ts`
- new `group-survey-copy.ts`
- new `functional-copy-localization.test.tsx`

All four copy owners use exhaustive `Record<AppLocale, ...>` maps, including Japanese, both Chinese scripts, Spanish, Indonesian, Vietnamese, Thai, Portuguese, French and Russian instead of the prior English fallback. Existing Korean/English strings are preserved. New translations are generated product-interface translations, not text extracted from the Korean design source. User names, gift/provider/conditions, survey questions/options, review titles/bodies, invitation answers, stored reasons and original content are not translated or replaced.

The provided current004 HTML was read from `<design-source>/work/pen-dev-loop-20261103/reextract-current-004/source-live.html`; SHA256 verified as `056b235f042c45698de727d6fe809c3431b4d4909609c87c6e900fd945976141`. The current checkout DESIGN contract (locale completeness and activity/survey roles) and F03 audit governed the copy-only change. Korean/English preservation was separately compared against Git HEAD: all original ternary strings remain in their extracted maps, and gift/invitation constants remain byte-identical.

## Observed verification

- `npm exec -- vitest run features/groups/ui/functional-copy-localization.test.tsx features/groups/ui/activity-evidence-task.test.tsx features/groups/ui/group-gifts.test.tsx`: **58 tests passed**, 3 files.
- Focused TypeScript program over the four copy maps, using the real locale type and strict options: **0 diagnostics**.
- Scoped `git diff --check`: passed.
- Chromium: **144 cases** = 12 APP_LOCALES × 390/1440px × gift/invite/consent/survey/photo/review.
- **240 screenshot entries** in `artifacts/checks.json`; each includes exact URL, reported viewport, screenshot path and measured geometry. Target repository, HEAD and hashes of the six production files are included. `task-*.png` are additional native task crops, `sheet-*.png` are 12 review contact sheets.
- No horizontal document overflow, off-viewport controls, page exceptions or unexpected network destinations in those cases. Intentional 409/503 fixtures and associated resource-console errors are recorded separately.
- Gift: long original input survives conflict; expectedRevision remains 3; repeated mutation payload/request ID is identical.
- Invitation: retry ID retained, localized queued state means consent request received, not member registration or delivered email.
- Acceptance: both affirmative consents and original question answer are required; consent versions, original answer and retry ID retained.
- Photo: real upload hook sees failed reservation then re-selection and ready completion; action requires photo and affirmative original attestation; original body/asset ID retained. Focused tests verify uploaded evidence is marked used only after acknowledged success.
- Survey: original title/question/options retained, selected index and optional opinion survive failure.
- Review: original title/body retained, optional photo remains optional, attendance/permission controls translated.

## Render review

All locale contact sheets at both widths were inspected, with native-size Russian gift, French review and French consent checks. Translated headings, labels, errors, attestation and primary actions wrap without overlap or truncation in these component conditions. The first harness capture revealed missing inherited font on the isolated gift mount; the harness now supplies the production Pretendard inheritance, and the final matrix/captures were regenerated. Consent error captures explicitly scroll the task body to the error; a separate top capture preserves the opening context. Product CSS and shared shells were not edited.

Non-blocking existing visual issue outside this copy change: narrow Cancel actions wrap inside words in some locales (e.g. ES/PT/FR/JA), inherited from existing shared action sizing. They remain reachable, complete, and do not overlap. No blanket full-page/design-parity or accessibility-certification claim is made.

## Boundaries and remaining gaps

- `group-gifts.tsx` still owns KO/EN literals for **Remove image** and **Choose a method**. It is outside the expressly authorized file list and was not edited.
- `group-membership-invitation.tsx` still owns the KO/EN **Later** literal, visible in consent captures. It is also outside scope.
- Existing gift-form behavior sends `fulfillmentDescription: c[method]`: translating the map now sends the selected locale's generated method label on a new/revised submission. This is existing label-to-payload behavior, not replacement of stored descriptions or user input. The enum, revision, request IDs and other payload fields are unchanged.
- Full-repository `tsc --noEmit --pretty false --incremental false` did not complete: first command timed out at 180s, second tool call timed out at 420s without diagnostics. Full typecheck is **not passed**; strict copy-map typecheck and focused tests did pass.
- These are isolated production-component renders with synthetic loopback API responses and synthetic identities. The invitation's unrelated shared shell is replaced with a children-only harness boundary. No real account, credential, email, membership, DB or storage operation was used. No DEV/production route, real delivery, VoiceOver, native-speaker/legal approval or complete shell integration was verified.
- No commits, deploys, dependencies, SQL/API, shared harness, DESIGN, coverage or release-note changes were made by this worker. Parent port3128 was left untouched.

## Reproduce

From the exact repository root:

```sh
node apps/web/e2e/groups-localization-local/server.mjs
# In another terminal; server is loopback-only port3136, strictPort enabled:
node apps/web/e2e/groups-localization-local/run.mjs
```

Harness files: `server.mjs`, `index.html`, `main.tsx`, `shell.tsx`, `run.mjs`, this README, and generated `artifacts/`.

## Parent integration follow-up (supersedes the remaining UI gaps above)

- Added localized Remove image / Choose a method / Later through the same copy owners and actual gift/consent consumers. The eight-file lineage in the regenerated `artifacts/checks.json` includes those consumers.
- Gift edits preserve the stored fulfillment description when the enum is unchanged; switching language alone no longer overwrites it. A new French revision test proves original-text preservation. New or explicitly changed methods still use their selected label.
- `functional-copy-localization.test.tsx` and `group-gifts.test.tsx`:54tests passed; scoped ESLint passed. This is a narrow parent run, not a rerun of the worker's entire58-test set.
- Regenerated the144-case/240-capture browser matrix after the changes, adding image-removal/method-placeholder/Later assertions and unchanged fulfillment-description checks.
- Directly inspected French review and consent captures. Fixed the observed mobile Annuler word split with activity-evidence.module.css-only cancel padding20→8px; source88px target and48px height remain. `cancel-polish.mjs` passed48checks across12locales×390/1440×photo/review, with every cancel label on one line. Its final captures/checks are in `artifacts/cancel-polish/`; older broad-matrix photo/review captures predate this padding-only correction.
- No live membership/email/media operation or deployment was performed. Full integration and DEV verification remain separate.
