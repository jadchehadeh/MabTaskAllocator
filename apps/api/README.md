# API

The API persists users, sessions, tasks, task messages, file metadata, and notifications in PostgreSQL.
It uses a bounded `pg` connection pool and parameterized queries throughout.

```bash
npm run dev:api
```

Set `DATABASE_URL` before starting outside Docker. The API runs the idempotent schema in
`infra/postgres/init.sql` during startup. Passwords use salted scrypt hashes, and browser
sessions use opaque bearer tokens.
