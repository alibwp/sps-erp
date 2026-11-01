# SPS ERP

Enterprise resource planning app: Next.js frontend, NestJS backend and PostgreSQL.

## Run locally

Requires Docker Desktop.

```bash
git clone git@github.com:alibwp/sps-erp.git
cd sps-erp
docker compose up
```

| Service    | URL                                                                     |
| ---------- | ----------------------------------------------------------------------- |
| Frontend   | http://localhost:3000                                                   |
| Backend    | http://localhost:5000                                                   |
| Health     | http://localhost:5000/api/health                                        |
| PostgreSQL | `localhost:5433` (user `sps`, password `sps_password`, database `sps_erp`) |

## Useful commands

```bash
docker compose down                    # stop (keeps database data)
docker compose down -v                 # stop and delete database data
docker compose up --build              # rebuild after changing dependencies
docker compose logs -f backend         # follow backend logs
docker compose exec backend npm test   # backend unit tests
```

## Switch to the live database

1. Copy `.env.example` to `.env`.
2. Uncomment the live database lines and fill in your values.
3. Run `docker compose up`.

**Warning:** keep `DB_SYNCHRONIZE=false` on the live database.
