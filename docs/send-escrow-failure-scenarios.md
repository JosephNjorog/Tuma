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
| On-chain transfer | Broadcast succeeds but API times out before tx hash is stored | Transaction can be marked `requires_review`, but may lack the chain anchor. | Partial | Requires manual chain lookup by sender/recipient/reference. | Add chain reconciliation for initiated/review transactions without `txHash`. |
| Merchant fee | Main transfer succeeds but fee transfer fails | Fee transfer error is logged and does not roll back the main send. | Implemented | Platform revenue collection may need manual follow-up. | Track merchant-fee failure as a separate event or alert. |
| Rail queue | Rail queue unavailable in local/demo mode | API falls back to inline rail payout. | Implemented | Inline fallback is not durable if the process dies mid-call. | Use a DB outbox for production-like fallback. |
| Rail queue | Queue add throws in production | Transaction is marked `requires_review`. | Implemented | Operator must decide whether to enqueue/retry manually. | Add operator retry action. |
| Rail worker | Provider transient failure | BullMQ retries with backoff. | Implemented | User may remain `onchain` until retry succeeds. | Add user-facing "payout in progress" copy per rail. |
| Rail worker | Provider fails after final retry | Worker marks transaction `requires_review` with provider idempotency metadata; `/api/ops/rail/dead-letter` lists affected rail payouts and `/retry` requeues or runs the same provider-keyed payout. | Implemented | Visibility is API-level, not a full dashboard; operators still need an `OPERATIONS_API_TOKEN` and runbook. | Add UI/dashboard, alerts, and SLA filters. |
| Rail worker | Worker receives duplicate job | Worker skips terminal or already-routed transactions; provider calls receive stable idempotency keys derived from transaction and rail failure stage. | Implemented | Provider support varies: MoMo uses the key directly, Paystack/Wave use it as request reference, and M-Pesa stores it as request metadata. | Add provider-specific duplicate-behavior tests/sandbox checks. |
| Receipt notification | WhatsApp received notification fails | Best-effort notification; money movement is not rolled back. | Partial | Direct-send notification failures are not currently escalated to review. | Decide whether receipt notification failure should be review, alert-only, or ignored. |

## Escrow Creation For Non-TUMA Recipient

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Escrow approval | Approval fails before deposit | Transaction is marked `requires_review`. | Partial | In many cases no funds moved, but the status is conservative. | Split definite pre-money failures from unknown post-broadcast failures. |
| Escrow deposit | Deposit fails before broadcast | Transaction is marked `requires_review`. | Partial | Same ambiguity as other chain calls. | Classify RPC failures and add chain reconciliation. |
| Escrow deposit | Deposit succeeds but DB update or escrow row insert fails | Transaction is marked `requires_review` if the catch path runs. | Partial | The on-chain escrow may exist without a complete local escrow row. | Reconcile escrow deposits from chain events. |
| Expiry scheduling | Redis queue disabled, schedule call returns false, or delayed job is lost | Escrow worker scans expired pending escrows and either re-enqueues a deterministic expiry job or processes inline when the queue is unavailable. | Implemented | Recovery depends on the escrow worker running and being able to reach the database. | Add scanner heartbeat/alerting. |
| Claim-link notification | Queue/send fails after funds escrowed | Transaction is marked `requires_review`; funds remain escrowed. | Implemented | Operator must resend the link or contact recipient. | Add operator resend action and alerting. |
| Claim-link notification | Queue accepts job but final delivery fails | Notify worker marks transaction `requires_review` after final retry. | Implemented | Requires operator follow-up. | Add notification failure dashboard. |

## Escrow Claim

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Claim validation | Wrong phone, expired link, already claimed/refunded | Request fails before money movement. | Implemented | User may need clearer support path for expired/refunded claims. | Improve frontend claim-state copy. |
| Claim signing | Recipient wallet missing | Request fails before on-chain claim. | Implemented | Recipient must retry after wallet deployment. | Add frontend retry/backoff while wallet is deploying. |
| On-chain claim | Claim succeeds | Escrow row stores `claimTxHash`, claiming wallet, and claim timestamp. Transaction records on-chain claim event. | Implemented | None significant in happy path. | Add tests. |
| On-chain claim | Claim succeeds but DB update fails | The claim route records `escrow_claim_db_update` review metadata with the claim hash and recipient context; recipient retries and `escrow.worker` both replay local claim persistence and rail handoff from that metadata behind a transaction-scoped reconciliation lock. | Implemented | Recovery depends on recording the review event; a full DB outage immediately after the chain claim still needs chain-event/operator reconciliation. | Add chain-event scanner for claims that succeeded before any review metadata could be written. |
| Rail payout after claim | Rail queue unavailable in local/demo mode | Claim path falls back to inline rail payout. | Implemented | Inline fallback is not durable. | Use DB outbox or require Redis in production. |
| Rail payout after claim | Rail submission fails after retries | Transaction becomes `requires_review` with claim metadata. | Implemented | Recipient has claimed on-chain but still needs fiat/mobile-money payout resolution. | Add operator retry/refund decision flow. |
| Duplicate claim tap | Recipient submits claim twice quickly | Claim submission uses a short escrow-ref lock; once claimed, the same recipient gets an idempotent replay response instead of a second chain attempt. | Implemented | The lock is best-effort and TTL-based, so the on-chain contract remains the final duplicate-claim guard. | Add duplicate-tap and lock-expiry tests. |

## Expiry And Refund

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Expiry worker | Delayed job fires before expiry | Worker checks `expiresAt` and skips if too early; the scanner catches still-pending escrows after `expiresAt`. | Implemented | Early jobs rely on the scanner for later repair. | Add a metric for early skips. |
| Expiry worker | Escrow already claimed/refunded | Worker skips non-pending escrow. | Implemented | None significant. | Add idempotency tests. |
| Expiry worker | Refund transaction fails | Worker retries with BullMQ backoff and marks `requires_review` after final retry failure. | Implemented | Operator still needs a retry/refund decision workflow. | Add operator retry action. |
| Missed expiry | Queue job was never scheduled, Redis lost data, or worker was down long-term | Periodic scanner finds `pending` escrows with `expiresAt < now` and repairs by enqueuing or inline processing. | Implemented | Scanner must be running; deterministic job ids avoid duplicate queue buildup but do not replace monitoring. | Add scanner heartbeat/alerting. |

## Webhooks And Settlement

| Stage | Failure scenario | Current handling | Status | Tradeoff / residual risk | Next hardening |
| --- | --- | --- | --- | --- | --- |
| Rail webhook | M-Pesa/MoMo success arrives | Transaction records `settled`. | Implemented | Depends on provider reference matching. | Add signature verification tests. |
| Rail webhook | M-Pesa/MoMo failure arrives | Transaction records `failed`. | Implemented | Some failures may need review instead of final failure if payout outcome is ambiguous. | Map provider error codes to final vs review. |
| Rail webhook | Timeout webhook arrives | Logged and treated as pending. | Implemented | Needs poller or later webhook to resolve. | Ensure M-Pesa timeout path has a reconciliation strategy. |
| Settlement poll | Non-M-Pesa rail remains pending | Settlement worker polls and retries. | Implemented | Long-lived pending state can still happen. | Add max-age review transition and alerts. |

## Current Priority Order

1. Add operator tools for non-rail `requires_review`: resend claim link, reconcile chain hash, refund escrow.
2. Add chain-event scanners for post-chain cases where the DB was unavailable before review metadata could be written.
3. Add scanner/worker heartbeat alerting.
4. Add integration tests around duplicate sends, duplicate claims, rail idempotency, dead-letter retry, queue failure, final retry review, expiry scanner repair, and escrow claim failure paths.
5. Add an operator dashboard over the existing dead-letter/review APIs.
