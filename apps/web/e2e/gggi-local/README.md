# GGGI local preview

Run `node apps/web/e2e/gggi-local/server.mjs`, then open <http://127.0.0.1:4198/gggi>.
Run checks against that server with `node apps/web/e2e/gggi-local/run.mjs`.

The actual `CelebrityFanPage`, shared controls, locale provider, and CMS draft at
`content/gggi/celebrity.json` are rendered. `?viewer=guest` previews a guest;
`?viewer=fan` selects a synthetic local participant. Selection lasts within the tab.
Likes, event entry and plain-text public posts persist in that browser's localStorage.

This harness does not use production credentials, database, Cognito authentication,
analytics delivery, or blockchain. External fetches are blocked and unknown API
routes return 501. The local login page only switches to the synthetic participant.
News, schedules, the general raffle catalog, and attendance start empty. Image uploads, post detail,
editing, deletion, post reactions, and full account flows are not simulated.

The GGGI goods event is open only in this local fixture. Use `?tab=events` to open
the event tab, or `?eventState=draft` / `?eventState=closed` to inspect unavailable
states. Like first, then use the separate entry button. The fixture follows
`gggiEventSchema` and keeps the first entry timestamp. Run
`node apps/web/e2e/gggi-local/run-event.mjs` to check login, like prerequisite,
explicit keyboard entry, duplicate requests, reload, and failures before/after
commit. This command starts and closes its own loopback server on port 4227;
set `GGGI_LOCAL_BASE_URL=http://127.0.0.1:4198` to use an existing preview.
Production route and database behavior have separate tests; this browser
fixture does not establish a real authentication-to-database connection.
