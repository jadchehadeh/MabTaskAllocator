# MAB Task Allocator — Production Audit

## Executive assessment

The product has strong functional breadth: role-scoped task allocation, projects, review workflows,
chat, attachments, attendance, achievements, productivity reports, notifications, and bilingual UI.
The principal technical risk is concentration: the API is a single large HTTP module and the main
React application is a single large component. This increases regression risk and makes independent
testing, ownership, and deployment difficult as the product grows.

## Improvements completed in the enterprise pass

- Completed task chatter coverage for views, claims, assignment, edits, status/priority/deadline
  changes, comments, files, worker submissions, approvals, rejections, completion, and reopen cycles.
- Prevented manual edits from bypassing submit/approval state transitions.
- Added explainable delay prediction, smart priority, burnout/workload risk, portfolio health, and
  advisory workload-balancing suggestions.
- Added a management audit log that survives entity deletion.
- Added idempotent hourly reminders for due, overdue, blocked, and review work.
- Added per-notification read state and an explicit mark-all action.
- Added login throttling, password policy, production bootstrap credentials, configurable CORS,
  request IDs, API security headers, and Nginx browser security headers.
- Reduced polling frequency, paused polling in hidden tabs, prevented overlapping refreshes, and
  batched performance-task relation queries.
- Added deterministic tests for operational intelligence and repaired Windows local development.

## Important remaining launch work

### P0 — before broad external deployment

1. Split `server.mjs` into route, service, policy, repository, job, and serialization modules.
2. Split `App.tsx` into routed feature modules with a real localization framework; direct DOM text
   translation should be retired.
3. Move attachments to S3-compatible object storage with malware scanning, signed URLs, retention,
   and backup policy.
4. Add CI for API tests, frontend tests, linting, migrations, dependency scanning, and container scans.
5. Add database backup/restore drills, migration versioning, production secrets management, and
   disaster-recovery objectives.
6. Add centralized logs, metrics, traces, uptime checks, job health, and alerting.

### P1 — enterprise capability

- SSO/OIDC, MFA, password reset, account lock administration, and session/device management.
- Fine-grained permission policies beyond the current three roles.
- Durable queue workers for reminders, emails, exports, imports, and attachment processing.
- WebSocket or SSE change delivery instead of bootstrap polling.
- Task dependencies, milestones, recurring task templates, calendars, SLA policies, and escalation.
- Saved filters, custom views, bulk operations, CSV exports, and configurable dashboards.
- API pagination, field selection, optimistic concurrency/version fields, idempotency keys, and
  documented OpenAPI contracts.
- Data retention, legal hold, privacy export/deletion policies, and audit export.

## Algorithm governance

Operational scores are advisory. They expose contributing reasons, use bounded factors, and do not
automatically reassign work. Before using scores for compensation or disciplinary decisions, validate
them against real outcomes, monitor departmental bias, establish minimum sample sizes, and provide a
formal manager/employee appeal process.
