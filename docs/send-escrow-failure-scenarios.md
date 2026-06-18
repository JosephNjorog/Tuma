# Send/Escrow Failure-Scenario Matrix

This matrix tracks the current resilience posture for the send and escrow flows. It is intentionally operational: each row says what happens today, what risk remains, and what to build next.

## Status Legend

| Status | Meaning |
| --- | --- |
| Implemented | Covered by current code. |
| Partial | Some protection exists, but an important gap remains. |
| Gap | Not meaningfully handled yet. |

## Send Request And Quote Boundary

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Client retry | Same `/api/send` retried after timeout | `idempotencyKey` replays existing transaction for the same sender. In-flight duplicate returns `409`. | Implemented | Only works if the client reuses the same key. | Generate and persist idempotency keys in the frontend send flow. |
| Client retry | Same intent retried with a new idempotency key or no key | Treated as a new send. | Gap | Backend cannot infer user intent safely from request shape alone. | Require idempotency keys for production sends. |
| Quote | FX quote expired or already consumed | Request fails before transaction creation. | Implemented | User must request a new quote. | Add clearer frontend retry copy. |
| Quote | DB insert fails after quote consumption | No money movement has happened, but quote may be lost. | Partial | User may need a new quote. | Consider quote consumption inside a DB-backed transaction/outbox flow. |
| Sender checks | Wallet missing or balance insufficient | Request fails before transaction creation and before money movement. | Implemented | None significant. | Add tests around no-transaction guarantee. |

## Direct Send To Existing TUMA User

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| On-chain transfer | Avalanche transfer fails before broadcast | Transaction is marked `requires_review` with the failure stage. | Partial | Some failures are clearly no-move, but RPC errors can be ambiguous. | Classify provider/RPC errors into definite failure vs unknown outcome. |
| On-chain transfer | Broadcast succeeds but API times out before tx hash is stored | Transaction can be marked `requires_review`; operators can attach a confirmed chain hash through `/api/ops/review/:transactionId/reconcile-chain-hash`. | Partial | Direct ERC-20 transfers do not include an app reference, so automatic matching by sender, recipient, amount, and time window can be ambiguous. | Add a direct-transfer matcher or DB outbox for initiated/review transactions without `txHash`. |
| Merchant fee | Main transfer succeeds but fee transfer fails | Fee transfer error is logged and does not roll back the main send. | Implemented | Platform revenue collection may need manual follow-up. | Track merchant-fee failure as a separate event or alert. |
| Rail queue | Rail queue unavailable in local/demo mode | API falls back to inline rail payout. | Implemented | Inline fallback is not durable if the process dies mid-call. | Use a DB outbox for production-like fallback. |
| Rail queue | Queue add throws in production | Transaction is marked `requires_review`; the rail dead-letter retry endpoint can rebuild and retry the provider-keyed rail job. | Implemented | Visibility is API-level, not a dashboard. | Add alerts and SLA filters. |
| Rail worker | Provider transient failure | BullMQ retries with backoff. | Implemented | User may remain `onchain` until retry succeeds. | Add user-facing "payout in progress" copy per rail. |
| Rail worker | Provider fails after final retry | Worker marks transaction `requires_review` with provider idempotency metadata; `/api/ops/rail/dead-letter` lists affected rail payouts and `/retry` requeues or runs the same provider-keyed payout. | Implemented | Visibility is API-level, not a full dashboard; operators still need an `OPERATIONS_API_TOKEN` and runbook. | Add UI/dashboard, alerts, and SLA filters. |
| Rail worker | Worker receives duplicate job | Worker skips terminal or already-routed transactions; provider calls receive stable idempotency keys derived from transaction and rail failure stage. | Implemented | Provider support varies: MoMo uses the key directly, Paystack/Wave use it as request reference, and M-Pesa stores it as request metadata. | Add provider-specific duplicate-behavior tests/sandbox checks. |
| Receipt notification | WhatsApp received notification fails | Best-effort notification; money movement is not rolled back. | Partial | Direct-send notification failures are not currently escalated to review. | Decide whether receipt notification failure should be review, alert-only, or ignored. |

## Escrow Creation For Non-TUMA Recipient

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Escrow approval | Approval fails before deposit | Transaction is marked `requires_review`. | Partial | In many cases no funds moved, but the status is conservative. | Split definite pre-money failures from unknown post-broadcast failures. |
| Escrow deposit | Deposit fails before broadcast | Transaction is marked `requires_review`. | Partial | Same ambiguity as other chain calls. | Classify RPC failures and add chain reconciliation. |
| Escrow deposit | Deposit succeeds but DB update or escrow row insert fails | `escrow.worker` scans `Deposited` events with a persistent chain cursor. If the local transaction already has the escrow ref, the scanner can attach the tx hash, rebuild a missing escrow row, and reschedule expiry. Operators can still attach a confirmed chain hash manually. | Partial | If PostgreSQL was unavailable before `escrowRef` was written to the transaction, the chain event cannot be tied back to local intent without an external lookup. | Persist the escrow ref before broadcast or add an outbox/prepared-send record. |
| Expiry scheduling | Redis queue disabled, schedule call returns false, or delayed job is lost | Escrow worker scans expired pending escrows and either re-enqueues a deterministic expiry job or processes inline when the queue is unavailable. | Implemented | Recovery depends on the escrow worker running and being able to reach the database. | Add expiry scanner integration tests and an external heartbeat monitor. |
| Claim-link notification | Queue/send fails after funds escrowed | Transaction is marked `requires_review`; operators can resend the claim link through `/api/ops/review/:transactionId/resend-claim-link`. | Implemented | The recovery action is API-level; production still needs alerts and a dashboard. | Add notification failure dashboard and SLA alerts. |
| Claim-link notification | Queue accepts job but final delivery fails | Notify worker marks transaction `requires_review` after final retry; the same resend endpoint can queue or send the claim link again. | Implemented | Requires operator follow-up and a runbook. | Add notification failure dashboard. |

## Escrow Claim

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Claim validation | Wrong phone, expired link, already claimed/refunded | Request fails before money movement. | Implemented | User may need clearer support path for expired/refunded claims. | Improve frontend claim-state copy. |
| Claim signing | Recipient wallet missing | Request fails before on-chain claim. | Implemented | Recipient must retry after wallet deployment. | Add frontend retry/backoff while wallet is deploying. |
| On-chain claim | Claim succeeds | Escrow row stores `claimTxHash`, claiming wallet, and claim timestamp. Transaction records on-chain claim event. | Implemented | None significant in happy path. | Add tests. |
| On-chain claim | Claim succeeds but DB update fails | The claim route records `escrow_claim_db_update` review metadata when it can. If PostgreSQL was unavailable before that metadata was written, `escrow.worker` scans `Claimed` events and replays local claim persistence plus rail handoff from the contract event and local escrow row. | Implemented | Requires the scanner cursor to run and the claimed wallet to map to a local user. | Add integration tests for review-metadata-missing recovery. |
| Rail payout after claim | Rail queue unavailable in local/demo mode | Claim path falls back to inline rail payout. | Implemented | Inline fallback is not durable. | Use DB outbox or require Redis in production. |
| Rail payout after claim | Rail submission fails after retries | Transaction becomes `requires_review` with claim metadata; the rail dead-letter retry endpoint can retry the payout with the same provider idempotency key. | Implemented | Recipient has claimed on-chain but still needs fiat/mobile-money payout resolution if the provider outcome remains ambiguous. | Add operator runbook and refund decision policy. |
| Duplicate claim tap | Recipient submits claim twice quickly | Claim submission uses a short escrow-ref lock; once claimed, the same recipient gets an idempotent replay response instead of a second chain attempt. | Implemented | The lock is best-effort and TTL-based, so the on-chain contract remains the final duplicate-claim guard. | Add duplicate-tap and lock-expiry tests. |

## Expiry And Refund

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Expiry worker | Delayed job fires before expiry | Worker checks `expiresAt` and skips if too early; the scanner catches still-pending escrows after `expiresAt`. | Implemented | Early jobs rely on the scanner for later repair. | Add a metric for early skips. |
| Expiry worker | Escrow already claimed/refunded | Worker skips non-pending escrow. | Implemented | None significant. | Add idempotency tests. |
| Expiry worker | Refund transaction fails | Worker retries with BullMQ backoff and marks `requires_review` after final retry failure; operators can retry the refund through `/api/ops/review/:transactionId/refund-escrow`. | Implemented | On-chain expiry and pending-state checks still decide whether a refund is valid. | Add refund retry tests and operator runbook. |
| Expiry worker | Refund succeeds but DB update or review metadata write fails | `escrow.worker` scans `Refunded` events and repairs local escrow/transaction status to refunded/expired. | Implemented | Requires the local escrow row to exist and the chain-event cursor to advance. | Add refund event integration tests. |
| Missed expiry | Queue job was never scheduled, Redis lost data, or worker was down long-term | Periodic scanner finds `pending` escrows with `expiresAt < now` and repairs by enqueuing or inline processing. | Implemented | Scanner must be running; deterministic job ids avoid duplicate queue buildup but do not replace monitoring. | Add expiry scanner integration tests and an external heartbeat monitor. |

## Webhooks And Settlement

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Rail webhook | M-Pesa/MoMo success arrives | Transaction records `settled`. | Implemented | Depends on provider reference matching. | Add signature verification tests. |
| Rail webhook | M-Pesa/MoMo failure arrives | Transaction records `failed`. | Implemented | Some failures may need review instead of final failure if payout outcome is ambiguous. | Map provider error codes to final vs review. |
| Rail webhook | Timeout webhook arrives | Logged and treated as pending. | Implemented | Needs poller or later webhook to resolve. | Ensure M-Pesa timeout path has a reconciliation strategy. |
| Settlement poll | Non-M-Pesa rail remains pending | Settlement worker polls and retries. | Implemented | Long-lived pending state can still happen. | Add max-age review transition and alerts. |

## Worker And Scanner Liveness

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Worker liveness | Settlement, rail, notification, or escrow worker stops | Workers write rows to `worker_heartbeats`; `GET /api/ops/health/heartbeats` reports missing/stale/error components and can return `503` with `failOnStale=true`. | Implemented | The endpoint is an alert signal, not a pager by itself. | Wire an external monitor or Render alert to poll with `failOnStale=true`. |
| Scanner liveness | Expiry, claim-reconciliation, or chain-event scanner stops running | Each scanner writes success/failure heartbeats with result metadata after every scan loop. | Implemented | A database outage can prevent heartbeat writes and make the monitor report stale rather than the exact root cause. | Add dashboard panels and log/metric correlation. |
| Scanner failure | Scanner catches an exception but worker process remains alive | Scanner heartbeat status becomes `error` with the latest error message until the next successful scan. | Implemented | A later success clears the active error; detailed history remains in logs, not in heartbeat rows. | Add historical heartbeat events or metrics if needed. |

## Test And CI Coverage

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Unit tests | Pure resilience helper behavior regresses | Bun unit tests cover KMS signing conversion, rail provider idempotency keys, heartbeat status calculation, and escrow chain-event value decoding. | Implemented | Unit tests do not prove DB/Redis behavior. | Keep adding pure helper tests as failure handling branches are extracted. |
| Integration tests | Operator heartbeat or rail dead-letter flow regresses | Bun integration tests run against real Postgres and Redis, migrate schema first, reset DB/Redis between specs, and cover heartbeat stale/fail behavior plus rail dead-letter list/retry queue handoff. | Partial | First clusters are covered, but duplicate send/claim, expiry scanner, claim reconciliation, chain-event repair, and refund paths still need integration tests. | Expand resilience-path integration clusters in priority order. |
| CI | Resilience regressions merge unnoticed | GitHub Actions runs backend typecheck, backend unit tests, backend integration tests with Postgres/Redis services, frontend production build, and Foundry contract build/tests. | Implemented | Frontend lint is not yet a CI gate because of a pre-existing formatting baseline; provider sandbox tests are still outside CI. | Clean frontend lint baseline and add provider sandbox checks. |

## Current Priority Order

1. Expand integration tests around duplicate sends, duplicate claims, queue failure, operator recovery actions, chain-event repair, expiry scanner repair, and escrow claim failure paths.
2. Wire an external monitor or Render alert to poll the heartbeat endpoint.
3. Add a direct-transfer matcher or DB outbox for direct sends whose tx hash was never stored.
4. Add an operator dashboard over the existing dead-letter/review APIs.
5. Add provider-specific duplicate-behavior sandbox tests.
