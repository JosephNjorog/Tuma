# ADR 0006: Gate Resilience Changes With Unit And Integration CI

Status: Accepted

Date: 2026-06-18

## Context

The send/escrow resilience work now depends on several moving parts that can regress independently:

- pure helper decisions such as provider idempotency key generation
- Postgres-backed review, heartbeat, and cursor state
- Redis/BullMQ queue handoff
- Hono route behavior for operator endpoints
- smart contract behavior tested separately with Foundry

Unit tests are fast enough to run on every change, but they cannot prove that Drizzle schema, Redis queue construction, and route-level recovery responses still work together. Integration tests are slower, but they catch the failures most likely to strand money in `requires_review` or hide a broken recovery path.

## Decision

Use a layered test gate:

- `bun run typecheck` checks the shared package and backend.
- `bun run --cwd backend test:unit` runs fast Bun unit tests, including pure resilience helpers.
- `bun run --cwd backend test:integration` runs migrations and Bun integration tests against real Postgres and Redis.
- GitHub Actions runs backend typecheck, backend unit tests, backend integration tests with Postgres/Redis services, frontend production build, and contract build/tests with Foundry.
- Integration tests reset app tables and Redis before each spec so each failure scenario starts from known state.

The resilience integration clusters now cover:

- ops heartbeat visibility, stale/missing behavior, and `failOnStale=true`
- rail dead-letter list and retry, including provider idempotency key preservation through Redis queue handoff
- duplicate `/api/send` replay and in-flight send lock conflicts
- duplicate escrow claim replay and in-flight claim lock conflicts
- expiry scanner repair for missed delayed jobs, including refund-review marking when the sender wallet is missing
- claim DB-reconciliation replay from `escrow_claim_db_update` review metadata
- escrow contract `Deposited`, `Claimed`, and `Refunded` event scanner repairs
- non-rail operator recovery routes for claim-link resend, chain-hash reconciliation, and unsafe refund retry rejection

## Tradeoffs

- Integration tests require Postgres and Redis, so they are slower and need container/service setup in CI.
- The harness runs migrations before integration tests, which catches schema drift but adds setup time.
- Current integration tests are route/service-level. They do not call real payment providers or Avalanche RPC endpoints.
- Provider-specific duplicate behavior still needs sandbox tests because not every rail treats idempotency keys identically.
- Frontend lint is not a CI gate yet because the current frontend has a large pre-existing Prettier baseline. CI gates frontend build until that baseline is cleaned up.
- Local contract tests require Foundry installed; CI installs Foundry before running `forge build` and `forge test -vvv`.

## Consequences

- Backend resilience regressions can be caught before merge without requiring external providers.
- New failure-scenario rows should include either a unit test, an integration test, or an explicit pending test gap.
- CI is useful immediately without being blocked by unrelated frontend formatting churn.

## Pending Gaps

- Add contract-backed or mock-injected success-path tests for operator refund retry and full on-chain claim/send flows.
- Add provider sandbox tests for duplicate rail submissions.
- Clean up frontend formatting/lint baseline, then turn frontend lint into a required CI gate.
- Add external monitor configuration for `GET /api/ops/health/heartbeats?failOnStale=true`.
