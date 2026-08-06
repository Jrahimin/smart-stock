# Durable Admin Job Queue

## Purpose

`system_job_executions` is the PostgreSQL-backed operational queue for manual and scheduled
market work. It keeps the existing `backend-api` + `backend-scheduler` topology and does not
introduce Celery, RabbitMQ, a browser worker, or another service.

## Lifecycle

```text
POST /admin/jobs/trigger
  -> insert PENDING (started_at=null, attempt_count=0)
  -> HTTP 202

backend-scheduler (one runner)
  -> SELECT ... FOR UPDATE SKIP LOCKED
  -> RUNNING (started_at, attempt_count + 1)
  -> SUCCEEDED | PARTIAL | SKIPPED | FAILED
```

Terminal rows always receive `completed_at` and `duration_ms`. The request stays in
`metadata`; successful/no-work output is stored in `metadata.result`. Failures store a
sanitized `error_message` and structured `metadata.error` without tracebacks, credentials,
tokens, or secrets.

`SKIPPED` is a valid terminal no-work result, for example when the market-session gate says
the source is not on today's trading session or a scheduled due batch has no eligible stocks.

## Deduplication

Each queued operational request receives a canonical `dedupe_key` derived from job type and
normalized request metadata. PostgreSQL enforces a partial unique index only while status is
`PENDING` or `RUNNING`.

- Equivalent active work returns the existing execution with `deduplicated=true`.
- Terminal history never prevents a later run.
- Scheduled Stock Details uses stable full-scope DSE metadata, so an active due batch cannot
  overlap or be queued twice.

## Worker reliability

The single queue worker lives in `backend-scheduler` and polls every
`SYSTEM_JOB_QUEUE_POLL_SECONDS` (default 10 seconds). Claim and state transition are one
transaction; execution happens after that transaction commits. Only one operational queue job
runs at a time.

On scheduler startup, abandoned `RUNNING` executions are marked `FAILED` with recoverable
shutdown metadata. Abandoned email-campaign execution rows also reconcile their linked campaign
to `FAILED`. Terminal completion writes retry until PostgreSQL is available again.

A daily cleanup deletes terminal execution rows whose `completed_at` is older than 90 days.
Pending/running rows are never age-deleted.

## Scheduler-created jobs

Market Snapshot and Daily Close/News/Finalization schedulers enqueue `SCHEDULER` executions
instead of calling ingestion functions directly. The queue runner still calls the existing
`sync_market_snapshot()` and `run_daily_market_sync()` entrypoints, so atomic MessagePack
publication, coverage guards, DSEX finalization, and cache-rebuild ownership are unchanged.

The optional Stock Details scheduler:

- Sunday–Thursday at `STOCK_DETAILS_SYNC_TIME` (default `15:35` Asia/Dhaka)
- full DSE scope
- existing due/cadence eligibility (`stock_details_sync_frequency_months`)
- at most `STOCK_DETAILS_SYNC_BATCH_SIZE` stocks (default 50)
- disabled by default in backend settings; production enables it explicitly after migration

## Heartbeat and dashboard liveness

`backend-scheduler` upserts the `backend-scheduler` row in `scheduler_heartbeats` at startup
and every minute. Admin dashboard liveness is:

| State | Rule |
|-------|------|
| `ONLINE` | heartbeat age is at most 120 seconds |
| `OFFLINE` | a heartbeat exists but is older than 120 seconds |
| `UNKNOWN` | no heartbeat has ever been recorded |

Enabled flags and calculated next-run timestamps are displayed separately; enabled
configuration is not evidence that the scheduler process is alive.

## Runtime settings

| Environment variable | Default | Production guidance |
|----------------------|---------|---------------------|
| `SYSTEM_JOB_QUEUE_POLL_SECONDS` | `10` | Keep at 10 unless database load requires adjustment |
| `STOCK_DETAILS_SYNC_SCHEDULER_ENABLED` | `false` | Set `true` after the migration/worker rollout |
| `STOCK_DETAILS_SYNC_TIME` | `15:35` | Asia/Dhaka, `HH:MM` |
| `STOCK_DETAILS_SYNC_BATCH_SIZE` | `50` | Due eligible stocks per scheduled batch |

These are environment-owned runtime settings. Recreate `backend-api` and
`backend-scheduler` after changing them so dashboard configuration and scheduler runtime agree.

## Operator checks

1. Apply Alembic migrations before starting API/scheduler.
2. Verify scheduler logs show the queue worker and heartbeat startup.
3. Open `/admin`; scheduler must become `ONLINE` within two minutes.
4. Queue a Market Snapshot from `/admin/jobs`; the API should return `202` with `PENDING`.
5. Observe `PENDING -> RUNNING -> terminal` in the detail drawer.

Related: [`admin_panel.md`](admin_panel.md), [`market_data.md`](market_data.md),
[`deployment_architecture.md`](deployment_architecture.md).
