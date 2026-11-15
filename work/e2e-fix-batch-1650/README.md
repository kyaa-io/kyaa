# E2E-FIX-BATCH-1650 code handoff

Scope: report #2/#4/#5/#8/#9. Existing dirty edits preserved and completed. No push, gate, production/dev DB apply, localdev or individual web server.

- Modal close/button/ESC/backdrop/action persists guest or account-local history; authenticated history reads/writes via owner-authorized service-only RPC. Round key uses raffle ID, independent of publication timestamp. Local history remains when server sync fails and is retried on remount.
- Popular ranking: Korea calendar day/week (Monday)/month post creation filter, recommendations descending, newest/ID tie breaks. Existing visibility checks preserved. 12 localized period headings.
- Board: remove notice-first reshuffle and synthetic pinned result row; keep chronological unified feed. Group board's own pinned-notice API untouched.
- Public Hot API: preserve first ranked row per source+post ID. Same title/author alone does not merge distinct posts.
- Mission empty state: activity-specific copy in 12 languages.

Validation logs in this folder (local, not committed):
- related-tests.log: initial seven-file run, 100 passed.
- regression.log: 48 files passed, including fan-ui/token contracts; old checkbox expectation failed and was corrected.
- final-changed-tests.log: mission, titles (12 locales), modal close paths, API contract passed; fanpage storage assertion subsequently corrected to the Storage API.
- celebrity-final.log: all 73 fanpage tests passed after updating close/storage contract.
- api-final.log: final public API/history/route/directory tests.
- typecheck-final.log, eslint.log, design-lint-final.log: passed, no new design violations.
- sql-self-check.log: standalone disposable PostgreSQL check passed; no listening server, no project DB. Reproduce: node scripts/verify-e2e-fix-batch-1650.mjs.

Baseline comparison: exact main f46034455c28492b4204fdc686a3e37f5c05a75a, directory-top suite 9 passed (main-directory-tests.log). The current branch had inherited a default-image expectation for music-placeholder.svg while its component uses star-pink.webp. Updated that single assertion; this was not a main failure.

Public preview does not contain this commit yet. 390/1440 captures, actual screen/keyboard/navigation checks and release-note images remain required after integration; no current preview capture is represented as an after-image. New release note deliberately has no unrelated image. Both migrations are files only, not applied to dev/production.

Temporary baseline worktree: /Users/jewel/.local/share/kyaa-t3/verification-worktrees/e2e1650-main. project-cleanup register rejected it as outside configured roots; preserved, not deleted or marked complete.
