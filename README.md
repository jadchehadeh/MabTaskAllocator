# MAB Task Allocator

A frontend-first project scaffold for a company task allocation platform.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Runtime: Node.js
- Database: PostgreSQL
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

Run the frontend:

```bash
npm run dev
```

Run with Docker and PostgreSQL:

```bash
docker compose up --build
```

The frontend will be available at `http://localhost:5173`.
