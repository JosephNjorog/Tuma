# ADR 0004: Escrow Claim, Notification, And Expiry Boundaries

## Status

Accepted

## Context

Non-user transfers create an escrow payment. This flow has several separate failure domains:

- approving and depositing USDC into `TumaEscrow`
- recording the escrow row and transaction anchor
- sending the WhatsApp claim link
- allowing the recipient to claim on-chain
- paying the recipient out through a local rail
- refunding the sender after expiry

These steps should not be treated as one atomic HTTP request because some happen on-chain, some happen through external providers, and some happen days later.

## Decision

Escrow deposit is the money boundary. After the escrow deposit succeeds, notification and later payout are treated as recoverable side effects.

Current behavior:

- Create the transaction before on-chain movement.
- Deposit funds into `TumaEscrow` for non-TUMA recipients.
- Persist the escrow reference and on-chain transaction hash as soon as possible.
- Queue the claim-link notification. If queueing is unavailable, send directly as a local fallback.
- If claim-link delivery fails after funds are escrowed, mark the transaction `requires_review` instead of reporting the transfer as failed.
- On claim, persist `claimTxHash`, attach the recipient wallet, record the on-chain claim, then queue the rail payout through the shared rail-disbursement path.
- Schedule an escrow-expiry job for refund after the claim window, using a deterministic job id and retry backoff.
- Run a periodic expiry scanner in `escrow.worker` to find expired pending escrows whose delayed jobs were missed or lost, then re-enqueue or process them inline when queues are unavailable.
- Mark refund failures as `requires_review` after the final queue retry.

## Consequences

Positive:

- Funds are not rolled back just because notification delivery failed.
- A claimed escrow and a rail payout failure are distinguishable states.
- The claim path reuses the same retry and review semantics as direct sends.
- Persisting `claimTxHash` gives reconciliation a concrete on-chain anchor.
- Expired pending escrows no longer rely only on a single delayed queue job.

Tradeoffs:

- A user can see a successful escrow deposit while the recipient has not received the claim link yet.
- If claim-link delivery fails, operators need a resend or manual contact workflow.
- Marking escrow claimed before rail payout prevents double claim, but means payout failure must be resolved operationally.
- Expiry recovery now depends on the `escrow.worker` scanner being alive and able to reach PostgreSQL.
- Deterministic expiry job ids reduce duplicate queue buildup, but operational monitoring is still needed.
- Some post-on-chain claim failure paths still need stronger reconciliation around DB update failures.

## Alternatives Considered

- Send the claim link before escrow deposit: avoids notifying after a failed deposit, but can send a link for funds that do not exist yet.
- Treat claim-link failure as transfer failure: misleading after funds are already escrowed.
- Pay the rail inline during claim: simpler control flow, but loses worker retry and makes provider failures user-facing.
- Rely only on the delayed expiry queue: enough for happy path, but not enough for missed jobs or worker downtime.
- Run refunds directly in the API request: simpler to reason about locally, but impossible for the 7-day expiry window and unsafe for request availability.

## Follow-up Work

- Add scanner heartbeat/alerting so a stopped expiry worker is visible.
- Add an operator action to resend claim links.
- Add an operator action to retry or manually resolve failed escrow refunds.
- Add claim reconciliation for cases where on-chain claim succeeds but DB updates fail.
- Add idempotency or locking around claim submission to protect against duplicate taps and retry races.
