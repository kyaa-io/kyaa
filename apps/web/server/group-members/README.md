# Group members, friends and fan ranking

`GET /api/groups/:id/people` requires an active authenticated page member and the shared page visibility gate. Query: `mode=members|friends|ranking`, literal nickname `search` (max 100), UUID `cursor`, `limit` (1–100), and supported app `locale` (legacy public names map to ko/en).

All rows belong to that page and exclude bilateral blocks. Friends reuse accepted global or legacy Creator relationships. Ranking filters the existing Creator top 100 by page membership; existing ranks/points and the 100-fan availability rule are preserved. Gaps in displayed ranks are intentional. Hobby pages without a Creator return `creator_required`; this adapter does not create points or invent a hobby ranking.

The UI uses three internal modes, search before server pagination, and `/my/friends?profileId=…` for existing public profiles. Management's original `/members?search=…` retains its original roles/answers DTO and joined-at cursor.

SQL regressions: `supabase/tests/group_members.sql`; browser fixture: `node apps/web/e2e/groups-local/members-run.mjs` against the existing loopback groups harness.
