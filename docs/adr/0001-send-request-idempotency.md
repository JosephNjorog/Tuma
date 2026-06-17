# ADR 0001: Send Request Idempotency

## Status

Accepted

## Context

`POST /api/send` can consume a short-lived FX quote and then trigger on-chain and off-chain money movement. Clients may retry this request after mobile network drops, API timeouts, app restarts, or duplicate taps.

Without an idempotency boundary, the same user intent can become multiple transactions, multiple quote consumptions, or duplicate rail payouts.

## Decision

`/api/send` accepts an idempotency key from either:

- JSON body: `idempotencyKey`
- HTTP header: `Idempotency-Key`
- HTTP header: `X-Idempotency-Key`

The backend validates the key length and character set, then scopes it to the authenticated sender. The database stores the key on `transactions` and enforces uniqueness on `(sender_id, idempotency_key)`.

Before consuming the FX quote, the backend attempts to acquire a short Redis `SET NX` lock for `(sender, idempotencyKey)`. If a matching transaction already exists, the API returns that transaction as an idempotent replay. If another request with the same key is still in flight, the API returns `409 CONFLICT`.

## Consequences

Positive:

- Mobile clients can safely retry the same logical send after a timeout.
- Duplicate retries do not consume another quote once a transaction exists.
- The key is sender-scoped, so two users can choose the same key without conflict.
- PostgreSQL's nullable unique-index behavior still allows sends without idempotency keys.

Tradeoffs:

- Clients must reuse the same idempotency key for the same user intent. If they generate a new key on every retry, the backend cannot know it is a retry.
- A short in-flight lock can temporarily return `409` while the first request is still processing.
- The Redis lock is a guardrail, not the final source of truth. The database unique index is still required.
- If a process crashes after a transaction row is created but before later stages are recorded, a reconciler is still needed to recover the exact state.

## Alternatives Considered

- No idempotency key: simpler API, but unsafe for mobile retries and payment timeouts.
- Server-generated keys only: does not protect retries after the client loses the first response.
- Hashing the request body as the key: attractive, but small legitimate differences such as note text or quote refreshes can make intent ambiguous.
- Database unique index without Redis lock: simpler, but can consume the quote or do extra work before the unique constraint is hit.

## Follow-up Work

- Generate and persist idempotency keys in the frontend send flow.
- Add integration tests for duplicate send replay and concurrent duplicate send conflict.
- Add a recovery job for transactions stuck after creation but before on-chain or rail events are fully recorded.
