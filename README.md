# MAB Task Allocator

A database-backed task allocation platform with role-based workflows and notifications.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Runtime: Node.js
- API: Node.js built-in HTTP server
- Database: PostgreSQL 16+
- Local environment: Docker Compose

## Project Structure

```text
apps/
  web/        React frontend application
  api/        Node.js PostgreSQL API service
packages/
  shared/     Shared TypeScript models and utilities
infra/
  postgres/   Database initialization files
docs/         Product and technical notes
```

## Start Locally

Install dependencies:

```bash
npm install
```

With PostgreSQL available through `DATABASE_URL`, run the API and frontend together:

```bash
npm run dev
```

Run with Docker:

```bash
docker compose up --build
```

The frontend is available at `http://localhost:5173` and the API at `http://localhost:4000`.
The API uses `DATABASE_URL`. Docker Compose provisions PostgreSQL and initializes it from
`infra/postgres/init.sql` automatically.
Uploaded attachments use a separate persistent volume so database backups and file backups can be
managed independently.

The production web image serves the Vite build through Nginx and proxies `/api` to `API_UPSTREAM`.
