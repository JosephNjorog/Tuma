# ADR 0002: Review State For Unclear Money Movement

## Status

Accepted

## Context

Payment systems often hit states where the API request failed, but the money movement may have already happened. Examples:

- Avalanche transaction broadcast succeeded, but the backend timed out before persisting the hash.
- Escrow deposit succeeded, but claim-link delivery failed.
- Rail payout was accepted by a provider, but final settlement has not arrived.
- A webhook reports a failure after a transaction was already routed.

Treating these cases as plain `failed` can mislead users and operators. Keeping them as `pending` forever is also dangerous.

## Decision

Add a first-class transaction status: `requires_review`.

When the backend cannot confidently mark a transaction as settled, failed, expired, or safely retryable, it records:

- `status = requires_review`
- `failureStage`
- `failureReason`
- `failedAt`
- a `settlement_events` row with metadata for the stage that needs attention

History and tracking APIs expose this metadata. The frontend stops polling and shows "Needs review" instead of leaving the transfer in an indefinite pending state.

## Consequences

Positive:

- Operators can distinguish "definitely failed" from "outcome unclear".
- Users get an honest status instead of a spinner.
- Failure context is stored close to the transaction and in the settlement event trail.
- The model supports different recovery actions per stage, such as resend claim link, reconcile chain state, or retry rail payout.

Tradeoffs:

- The product now needs an operator workflow. `requires_review` is only useful if somebody can act on it.
- More statuses increase frontend and support complexity.
- Some failures may generate duplicate settlement events if the same stage is retried repeatedly.
- `requires_review` does not itself resolve money state. It is a stop sign, not a repair tool.

## Alternatives Considered

- Use `failed` for all unrecoverable-looking errors: simpler, but risks telling users a transfer failed when funds moved.
- Keep all uncertain outcomes as `pending`: simple for users, but bad for operations and support.
- Store failure metadata only in logs: fragile, hard to query, and easy to lose during incident response.

## Follow-up Work

- Build an operator dashboard filtered by `requires_review`.
- Add recovery actions for known stages: resend claim link, retry rail payout, reconcile on-chain hash, refund escrow.
- Add alerting when `requires_review` transactions are created or remain unresolved past an SLA.
