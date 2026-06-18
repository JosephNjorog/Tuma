# Architecture Decision Records

This directory records product and engineering decisions that shape the money movement flow.

ADR status values:

- `Accepted`: implemented or intentionally adopted.
- `Proposed`: direction agreed enough to discuss, not fully implemented.
- `Superseded`: replaced by a later ADR.

Current ADRs:

| ADR | Decision | Status |
| --- | --- | --- |
| [0001](0001-send-request-idempotency.md) | Require client-supplied idempotency for send retries | Accepted |
| [0002](0002-review-state-for-unclear-money-movement.md) | Use `requires_review` for unclear outcomes after money movement | Accepted |
| [0003](0003-retryable-rail-disbursement-worker.md) | Move rail payouts behind a retryable worker | Accepted |
| [0004](0004-escrow-claim-notification-and-expiry-boundaries.md) | Treat escrow notification, claim, and expiry as separate recoverable steps | Accepted |
| [0005](0005-worker-and-scanner-heartbeats.md) | Record worker and scanner liveness for operational alerting | Accepted |

Related operational doc:

- [Send/escrow failure-scenario matrix](../send-escrow-failure-scenarios.md)
