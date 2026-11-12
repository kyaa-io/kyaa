# Community compact local verification

Run `node apps/web/e2e/community-compact-local/legacy-cheer-run.mjs` from the repository root. It renders the real FanPostFeed and PostCard with synthetic feed JSON on loopback port 4228; mutation endpoints reject writes and no production API is used. Add `legacy=1` to the query for the cheer page, `auth=off` for the guest state.
