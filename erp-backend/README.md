# SPS ERP backend

NestJS 12 API with PostgreSQL through TypeORM. Normally started together with
the database and frontend by `docker compose up` from the repository root; see
the root `README.md`.

## Endpoints

| URL               | Returns                                                  |
| ----------------- | -------------------------------------------------------- |
| `GET /`           | Status message (same as `/api`)                          |
| `GET /api`        | `{ "status": "ok", "message": "SPS ERP backend server is active", ... }` |
| `GET /api/health` | Server and database health; `503` when the database is down |

## Running outside Docker

```bash
docker compose up db          # from the repository root: database only
cp .env.example .env          # local values pointing at localhost:5433
npm install
npm run start:dev             # http://localhost:5000/api
```

## Scripts

| Command            | What it does                         |
| ------------------ | ------------------------------------ |
| `npm run start:dev`| Start with live reload               |
| `npm run build`    | Compile to `dist/`                   |
| `npm run lint`     | Lint `src/` and `test/`              |
| `npm run typecheck`| TypeScript check, including tests    |
| `npm test`         | Unit tests                           |
| `npm run test:e2e` | End-to-end tests (needs the database)|

Inside Docker: `docker compose exec backend npm test` and
`docker compose exec backend npm run test:e2e`.

## Environment variables

See `.env.example` (local) and `.env.production.example` (live).
