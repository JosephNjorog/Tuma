# ADR 0005: Worker And Scanner Heartbeats

Status: Accepted

## Context

The send and escrow flows depend on background workers and scanners:

- settlement polling worker
- rail disbursement worker
- WhatsApp notification worker
- escrow expiry worker
- expired-escrow scanner
- escrow-claim reconciliation scanner
- escrow chain-event scanner

Before this decision, failures were visible only indirectly: queues stopped
draining, scanner repair stopped happening, or operators noticed old
`requires_review` records. That is too slow for money movement.

## Decision

Workers and scanners write liveness rows to `worker_heartbeats`.

Each row stores:

- component name
- component kind (`worker` or `scanner`)
- current status (`ok` or `error`)
- stale threshold in seconds
- last heartbeat, start, success, and failure timestamps
- latest error and metadata

The protected operations API exposes:

- `GET /api/ops/health/heartbeats`
- `GET /api/ops/health/heartbeats?staleOnly=true`
- `GET /api/ops/health/heartbeats?failOnStale=true`

`failOnStale=true` returns HTTP `503` when any expected component is missing,
stale, or in error. This makes the endpoint suitable for Render health checks,
UptimeRobot, PagerDuty, or another external monitor.

## Consequences

Positive:

- Operators can see whether workers and scanners are alive without shell access.
- Stopped scanner loops are distinguishable from ordinary empty scans.
- The same health endpoint can power both a dashboard and external alerting.
- Missing components are reported even if they have never written a heartbeat.

Tradeoffs:

- This is API-level alerting, not paging by itself. Production still needs an external monitor to poll the endpoint.
- A database outage can prevent heartbeat writes, so stale status may indicate DB trouble, worker trouble, or both.
- `worker_heartbeats` stores only the latest status. Detailed history still lives in logs unless metrics/history are added later.
- Transient worker job failures may be cleared by the next successful heartbeat.

## Alternatives Considered

- Rely only on Render process status: simpler, but it does not show scanner-level failures inside a running worker process.
- Emit logs only: useful for debugging, but hard to query for current health.
- Add a full metrics stack now: better long term, but heavier than this repo currently needs.

## Follow-up Work

- Configure an external monitor to call the heartbeat endpoint with `failOnStale=true`.
- Add dashboard views for stale components and latest scanner metadata.
- Add historical metrics or heartbeat events if incident reviews need a timeline.
