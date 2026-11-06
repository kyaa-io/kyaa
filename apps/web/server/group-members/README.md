# Group members, friends and fan ranking

`GET /api/groups/:id/people` requires an active authenticated page member and the shared page visibility gate. Query: `mode=members|friends|ranking`, literal nickname `search` (max 100), UUID `cursor`, `limit` (1–100), and supported app `locale` (legacy public names map to ko/en).

All rows belong to that page and exclude bilateral blocks. Friends reuse accepted global or legacy Creator relationships. Ranking filters the existing Creator top 100 by page membership; existing ranks/points and the 100-fan availability rule are preserved. Gaps in displayed ranks are intentional. Hobby pages without a Creator return `creator_required`; this adapter does not create points or invent a hobby ranking.

Rows carry `tier` (the fan grade, null on anonymous and non-fan pages). Sanctioned members are left out, as in the signed-out list. The UI uses three internal modes, search before server pagination, and a profile modal (`features/group-social/profile-modal.tsx`). Management's original `/members?search=…` retains its original roles/answers DTO and joined-at cursor.

SQL regressions: `supabase/tests/group_members.sql`; browser fixture: `node apps/web/e2e/groups-local/members-run.mjs` against the existing loopback groups harness.

## Signed-out reads

`GET /api/groups/:id/public-people`, `public-ranking` and `public-rooms` are the only member and room reads open without a login. They never call the member APIs above and are read-only.

- Fans: `nickname`, `avatarUrl`, `tier` and nothing else. Every active member, because profiles have no public or private setting any more (`social_profile_is_public`). Members under an active moderation restriction are left out, and an anonymous page lists nobody. A signed-in viewer also loses people in a bilateral block. `limit` 1–30, `offset` 0–270, so a page publishes at most 300 fans. No search and no profile ids.
- Ranking: the published top 100 with `rank`, `score`, `nickname`, `characterId` and the same people left out. Ranks stay as computed, so gaps are expected. `read_page_ranking` behind `/api/pages/:slug/rankings` applies the same exclusions. Scores and ranks are public; the name, picture and tier limit is for the fan list.
- Rooms: `roomCount` plus `name` and `minimumTier`. Closed and ended rooms are left out. Fan pages list their default rooms even before they exist, without writing them.
- Response schemas are strict, so a new SQL field returns 503 until someone adds it to the whitelist here on purpose.

Definer owners: an owner that is neither superuser nor BYPASSRLS reads no row of a FORCE RLS table without a policy, and a `not exists` filter then passes everyone. `group_public_directory_owner_access()` sets up what such an owner needs and `group_public_directory_owner_check()` fails with `PUBLIC_DIRECTORY_OWNER_GAP`. Run both again if these functions change owner.

SQL regressions: `supabase/tests/group_public_directory.sql`, `supabase/tests/group_public_directory_owner.sql`, `supabase/tests/social_profile_all_public.sql`.
