# API

The API persists users, sessions, tasks, task messages, file metadata, and notifications in SQLite.
It uses Node's built-in HTTP and SQLite modules, so no separate database installation is needed locally.

```bash
npm run dev:api
```

The database is created automatically at `apps/api/data/mab.sqlite`. Passwords are stored as salted
scrypt hashes and browser sessions use opaque bearer tokens.
