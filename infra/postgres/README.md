# PostgreSQL Schema

The database is initialized from `infra/postgres/init.sql` when the Docker volume is created.

## Main Tables

- `users`
- `sessions`
- `projects`
- `project_members`
- `tasks`
- `task_assignees`
- `task_worker_approvals`
- `task_messages`
- `task_files`
- `notifications`
- `todos`
- `chat_groups`
- `chat_messages`

## Seeded Logins

The API creates the initial superadmin on first startup. Passwords are stored as salted scrypt hashes.

```text
Superadmin: j.chehade@mabunited.com / jadjadjad1
```

## Recreate Local Database

The API also applies the idempotent schema during startup. To completely rebuild a local development
database and intentionally remove its data:

```bash
docker compose down -v
docker compose up postgres
```
