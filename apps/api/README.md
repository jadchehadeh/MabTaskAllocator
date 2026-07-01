# API

The API persists users, sessions, tasks, task messages, file metadata, and notifications in PostgreSQL.
It uses a bounded `pg` connection pool and parameterized queries throughout.

```bash
npm run dev:api
```

Set `DATABASE_URL` before starting outside Docker. The API runs the idempotent schema in
`infra/postgres/init.sql` during startup. Passwords use salted scrypt hashes, and browser
sessions use opaque bearer tokens.

## Optional AI assistant

Set `GEMINI_API_KEY` in the API environment to enable the in-app assistant. The key is
used only by the server and is never returned to the browser. `GEMINI_MODEL` is optional
and defaults to `gemini-2.5-flash-lite`. Without a key, chat remains fully functional and
the assistant displays a configuration notice instead of failing the application.
