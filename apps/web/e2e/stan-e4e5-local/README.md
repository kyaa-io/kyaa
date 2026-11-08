# 덕질 E4·E5 local harness (261107-2 5회차 묶음 G)

Mounts the production `GroupBenefitsScreen` with the auth and Next adapters replaced (Next adapters shared with `../groups-benefits-local`).
`/api` is proxied to a local app on its own port, so the lucky draws, ranking, wallet and summary are the local DB's answers.
The signed-in state uses the token of a local test login (`kyaa-t3 local-login <account>`), injected by the capture script as `window.__stanToken`; nothing is stored here.

```
node e2e/stan-e4e5-local/server.mjs 5197 http://localhost:3141
```
Query cases: `auth=off` guest · `raffles=empty` no lucky draw · `states=closed,open` only those lucky draws · `nofav=1` no favorite named · `zero=1` wallet 0P·0장 · `locale=<code>`.
Reads only; no write reaches the app. Lucky draws in three states come from `board/tasks/doc-261107-2/dev-apply/e4-raffles-three-states.sql`.
