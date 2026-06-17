# ADR 0003: Retryable Rail Disbursement Worker

## Status

Accepted

## Context

Local rail payouts are external side effects. M-Pesa, MoMo, Paystack, Wave, and future providers can fail transiently, accept a request but settle later, or respond slowly enough that the API request times out.

Before this decision, send and claim paths could call rail disbursement directly from the HTTP request. That made the request path fragile and made retries harder to reason about.

## Decision

Use a `rail_disburse` BullMQ queue for rail payouts after on-chain movement is accepted.

The shared processor:

- calls the selected rail provider
- stores `railReference`
- records the transaction as `routed`
- records `settled` immediately if the provider returns immediate settlement
- schedules settlement polling for non-M-Pesa rails that need later confirmation

The rail worker retries failed jobs with backoff. It marks a transaction `requires_review` only after the final retry attempt. It also skips missing, terminal, or already-routed transactions.

When Redis queues are disabled, the API falls back to inline processing. This keeps local development and demo environments usable without Redis, but is not considered durable production behavior.

## Consequences

Positive:

- Rail payout retries are controlled and observable.
- Direct sends and escrow claims share one payout path.
- The HTTP request can return once the transfer has reached a durable boundary instead of waiting on every provider.
- Final retry failure produces review metadata instead of silently losing the payout attempt.

Tradeoffs:

- Production now needs Redis plus the `worker:rail` process.
- Users may see `onchain` while the worker is still routing the payout.
- Queue delivery is at-least-once. Provider idempotency and transaction-stage checks must prevent duplicate payouts.
- Inline fallback is helpful locally, but if the process dies mid-call there is no queued retry.
- Provider-specific idempotency support still needs to be audited per rail.

## Alternatives Considered

- Keep rail calls inline in `/api/send` and `/api/claim`: simpler, but makes provider instability user-facing.
- Use only webhooks without a queue: does not help with initiating payouts or retrying provider submission failures.
- Build a database outbox before BullMQ: more durable, but larger implementation scope for this iteration.

## Follow-up Work

- Add provider-level idempotency keys where each rail supports them.
- Add a dead-letter queue or dashboard for failed rail jobs.
- Move from inline no-Redis fallback to an outbox-backed fallback for production-like deployments.
- Add tests for worker retry, terminal-transaction skip, and already-routed skip behavior.
