# Partial production notice recovery

Supervisor gate/main integration is required before execution. This procedure changes only GitHub check receipts and sends notices through the existing production endpoint; it does not redeploy services or change the DB.

## Plan and resume

1. Select the **currently live** AWS production deployment ID. `7748523186` is the requested November 13 candidate, not a guarantee of the live deployment at execution time. `verifyAwsNotice` checks live revision, deployment status and workflow provenance. Source receipt is `130201930767` (deployment `7697046938`).
2. Dispatch the main workflow with `operation=plan-partial`, `environment=prod`, `deployment_id=<live ID>`, `source_receipt_id=130201930767`. This operation does not mutate receipts or send. Preserve the printed plan and its `planHash` in the gate evidence.
3. Review the plan: 36 original hashes, 11 confirmed, 25 remaining. It reconstructs original batches from immutable release notes and the successful historical deployment timestamp. Every recorded delivered payload and Bot API ID must validate. Browser IDs are never substituted. The legacy failure `DEPLOYMENT_VERIFICATION_UNAVAILABLE` is a pre-Telegram failure in the endpoint; transport failures and other uncertain reasons stop separately.
4. Dispatch `operation=resume-partial` with the same fields and `plan_hash=<reviewed planHash>`. A changed source summary, destination, payload, conflicting receipt, pending send, or invalid ID stops execution. The workflow uses the same production lock as normal notices.
5. Inspect the result. Only batches 12–36 are sent, with their original text and image list. Each intent hash is persisted **before** the POST; confirmed response IDs are checkpointed afterwards. A definitely rejected request can resume; an unresolved intent cannot. Never clear an unresolved intent or infer absence from an ID difference. A crash after sending requires separate message reconciliation, not rerun-by-reset.
6. Only after all 25 confirmations does the source receipt become success with original and recovered IDs. The destination recovery receipt then becomes failure: its delivery covered historical source batches, not the destination's new release notes. A failure between these final two writes can be finalized by rerunning the same recovery plan; no Telegram POST repeats.
7. Dispatch existing `operation=recover`, `environment=prod`, `deployment_id=<same live ID>` with **no** unsent receipt override. It now uses the completed source deployment as the baseline and sends only subsequent deployed release notes under existing batching rules. Verify receipt IDs and actual room delivery. If live deployment changed, stop and regenerate a plan for the appropriate destination; do not reuse a plan bound to another deployment.

Example after gate (not executed by the implementation agent):

```sh
gh workflow run deployment-notices.yml --ref main -f operation=plan-partial -f environment=prod -f deployment_id=7748523186 -f source_receipt_id=130201930767
# Copy and review the plan hash from that run before the next dispatch.
gh workflow run deployment-notices.yml --ref main -f operation=resume-partial -f environment=prod -f deployment_id=7748523186 -f source_receipt_id=130201930767 -f plan_hash=REVIEWED_PLAN_HASH
gh workflow run deployment-notices.yml --ref main -f operation=recover -f environment=prod -f deployment_id=7748523186
```

An unresolved target recovery receipt intentionally blocks ordinary delivery. The existing generic resolve-receipt operation is not a replacement for batch reconciliation. No receipt deletion, browser/API ID mapping, or partial-as-full success is permitted.
