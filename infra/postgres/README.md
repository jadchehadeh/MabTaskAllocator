# PostgreSQL Schema

The database is initialized from `infra/postgres/init.sql` when the Docker volume is created.

## Main Tables

- `departments`
- `app_users`
- `tasks`
- `task_activity`

## Seeded Logins

Passwords are stored with PostgreSQL `pgcrypto` hashes.

```text
Superadmin: j.chehade@mabunited.com / jadjadjad1
Super user: super.user@mabunited.com / super12345
Admin: bilal@mabunited.com / bilal123
Normal user: ali@mabunited.com / ali123
```

## Recreate Local Database

If the `postgres-data` Docker volume already exists, PostgreSQL will not rerun `init.sql`.
To rebuild the local database from this schema:

```bash
docker compose down -v
docker compose up postgres
```
