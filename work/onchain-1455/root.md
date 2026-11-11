# ONCHAIN-1455

ROOT: Finalized head minus the declared first deployment block exceeds MAX_SCAN_BLOCKS=5,000,000. The action verifier throws before scanning, scheduled refresh cannot publish, and public snapshots expire after 15 minutes, returning 503.

Evidence: production web log onchain_dashboard_verification state=failed phase=actions elapsedMs=182 code=VERIFICATION_FAILED. A read-only live public-RPC reproduction failed at action-public-snapshot.ts:144 with Action public snapshot block range cap exceeded. GIWA_PUBLIC_READ_RPC_URL exists in production configuration (value never printed).

Fix: remove the chain-age limit while retaining deadline cancellation, bounded chunk size, log/action/event caps and all provenance/finality verification. A 5,100,020-block fixture verifies earliest records remain present.

UI: FanHeading, common card radius/spacing, numeric tokens; section numbers preserved. Unavailable metrics display 집계 중; a fully validated expired payload can disclose only its last verified timestamp.

No localdev server or production DB writes. No migration or post/48 needed for the block-range defect. Production API recovery awaits deployment and a successful scheduled refresh. Static browser verification is recorded below.

Live read verification: production-configured RPC completed in 326 seconds without DB writes; finalized block 41030337. Local projection and public payload validation passed: active wallets 584, current valid actions 4316, original NFT mints 4728, Passport credentials 412, raw lifecycle transactions 4536. Live source includes 4535 records and 4536 lifecycle transactions. Static SSR renders at 390/1440 use these actual records, inspected directly; no horizontal overflow. Client hydration/interactions and deployed API recovery are not verified.

Tests: 37 web + 27 worker passed; worker typecheck passed. Web typecheck blocked by six unrelated KeyLike/CryptoKey errors in Apple/Google authentication tests.
