# November 13 approved summary replacement

This supersedes the 25-batch resume plan. `plan-partial` / `resume-partial` and their implementation have been removed. Do not run commit 0e0b53e.

User decision: keep the 11 confirmed deliveries for deployment 7697046938, permanently suppress the remaining 25 original batches, and replace the backlog with one readable production summary. The source is closed as **neutral / partially delivered, replaced by summary**, never as fully delivered. Its original 11 batch payloads and Bot API IDs remain intact; browser IDs are not mapped or substituted.

The reviewed message and evidence are in `scripts/deployment-notice-summary-1113.json`. It pins source receipt 130201930767 and its exact original summary hash, all 36 original batch hashes, source SHA 08cb013e1bba62fd1e46a2ecfae59bdb96e94cac, destination deployment 7748523186 and SHA c063e57caacc53471cf9dbcf6a2eb82adcc697de. The diff contains 61 immutable release-note files. Eight selected files map to eight human-written highlights; “외 53건” counts the other release-note files, not individual features, deployments, or historical batches. No screenshots or old batches are sent.

## Supervisor execution after gate/main integration

0. The supervisor must provision `TELEGRAM_BUG_REPORT_BOT_TOKEN` in the protected GitHub prod environment through an approved secret-delivery path, using the same bot as the original notices. Only `TELEGRAM_BUG_REPORT_OPERATOR_SECRET` is currently present in repository secrets; it is not a bot token. No token was retrieved or stored during implementation. A missing token stops send-summary before any receipt mutation. Do not put tokens in command arguments, chat, logs, or this repository.
1. Run `plan-summary` on main with environment prod and deployment_id 7748523186. It verifies the exact live revision, deployment/run provenance, pinned release-note set and content hashes, source receipt and confirmed prefix. It prints the exact message and plan hash without writes or sends. If the live SHA is no longer c063e57ca, stop; do not silently expand the summary or substitute another deployment.
2. Review the output, then only on supervisor instruction run `send-summary` with the same destination and reviewed plan_hash. It uses the production notification lock and a dedicated single Telegram sendMessage call. The existing service endpoint rejects [운영] titles, so that endpoint and all service/DB code remain unchanged. It reserves the destination receipt before the single text-only POST. No old batch POST exists in this code.
3. The replacement summary is saved as a successful destination receipt with its API message ID. Only then is the original receipt closed as neutral with explicit suppression count 25 and a reference to that confirmed summary. This order keeps ordinary notifications blocked if summary delivery is uncertain. The normal sender validates that reference and will never resend the old deployment.
4. If the final source PATCH fails, rerun the **same** approved summary plan: it reads the successful destination receipt and only finishes closure, without sending again. An unresolved POST or lost delivery checkpoint blocks reruns. A definitive pre-send rejection permits retry. Do not delete receipts, clear uncertain state, or use generic resolve-receipt to bypass it.
5. Verify the one message in the room and both receipts. Do **not** dispatch `recover` for the same deployment: its summary already covers its new notes. Future automatic notices start after c063e57ca and use normal formatting/batching. No persistent switch or service/DB change is needed.

Commands below are for the supervisor after gate/main and explicit execution instruction; the implementation agent has not run them:

```sh
gh workflow run deployment-notices.yml --ref main -f operation=plan-summary -f environment=prod -f deployment_id=7748523186
# Review the exact output and replace REVIEWED_PLAN_HASH.
gh workflow run deployment-notices.yml --ref main -f operation=send-summary -f environment=prod -f deployment_id=7748523186 -f plan_hash=REVIEWED_PLAN_HASH
```
