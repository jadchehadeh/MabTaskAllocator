# MAB Task Allocator

A database-backed task allocation platform with role-based workflows and notifications.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Runtime: Node.js
- API: Node.js built-in HTTP server
- Local database: SQLite via Node.js
- Local environment: Docker Compose

## Project Structure

```text
apps/
  web/        React frontend application
  api/        Future Node.js API service
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

Run the API and frontend together:

```bash
npm run dev
```

Run with Docker:

```bash
docker compose up --build
```

The frontend is available at `http://localhost:5173` and the API at `http://localhost:4000`.
The local database is created automatically at `apps/api/data/mab.sqlite`.
