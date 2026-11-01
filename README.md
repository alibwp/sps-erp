# SPS ERP

| Folder          | What it is                                   |
| --------------- | -------------------------------------------- |
| `erp-frontend/` | Next.js 16 website (welcome page, sign-in)   |
| `erp-backend/`  | NestJS 12 API, PostgreSQL through TypeORM    |

## Run everything locally

Requires Docker Desktop (or Docker Engine with Compose v2). After cloning:

```bash
git clone git@github.com:alibwp/sps-erp.git
cd sps-erp
docker compose up            # database + backend + frontend
```

No `.env` file or `npm install` is needed; local defaults are built in.
Add `--watch` (`docker compose up --watch`) to reload automatically when you edit code.

| Service      | URL                                                   |
| ------------ | ----------------------------------------------------- |
| Frontend     | http://localhost:3000                                 |
| Backend      | http://localhost:5000 and http://localhost:5000/api (status message) |
| Health check | http://localhost:5000/api/health (includes database)  |
| PostgreSQL   | `localhost:5433`, user `sps`, password `sps_password`, database `sps_erp` |

Other commands:

```bash
docker compose down              # stop (database data is kept)
docker compose down -v           # stop and delete local database data
docker compose up --build        # after adding npm packages
docker compose logs -f backend

# Tests and checks, run inside the containers
docker compose exec backend npm test
docker compose exec backend npm run test:e2e
docker compose exec backend npm run lint
docker compose exec backend npm run typecheck
docker compose exec frontend npm run lint
docker compose exec frontend npm run typecheck
```

Ports and local database credentials can be changed in a root `.env` file
(copy `.env.example`).

## How the pieces connect

```
Browser ──NEXT_PUBLIC_API_URL──▶ Backend ──DATABASE_URL──▶ PostgreSQL
                                (CORS_ORIGIN lets the frontend in)
```

## Switch to the live database

The backend reads one connection string, `DATABASE_URL`, in every environment.
Changing the variables below is enough; no code or compose changes are needed.

> **Warning:** `DB_SYNCHRONIZE` must be `false` whenever `DATABASE_URL` points at
> the live database. When `true`, TypeORM alters tables to match the code. As a
> second safeguard the backend ignores `DB_SYNCHRONIZE=true` for any database
> that is not local.

### Backend variables

| Variable                     | Live value (placeholder)                          |
| ---------------------------- | ------------------------------------------------- |
| `DATABASE_URL`               | `postgresql://USER:PASSWORD@HOST:5432/DATABASE`   |
| `DB_SSL`                     | `true`                                            |
| `DB_SSL_REJECT_UNAUTHORIZED` | `true` (verifies the certificate)                 |
| `DB_SYNCHRONIZE`             | `false`                                           |
| `CORS_ORIGIN`                | `https://your-frontend-domain.com`                |
| `NODE_ENV`, `PORT`           | `production`, `5000` (deployed backend only)      |

### Frontend variable

| Variable              | Live value (placeholder)              |
| --------------------- | ------------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://api.your-domain.com/api`     |

`NEXT_PUBLIC_API_URL` is baked in when the frontend is built, so rebuild after changing it.
It is required for production builds: `npm run build` (and the `prod` Docker target)
fails with an error when it is not set, instead of quietly pointing at localhost.

### Where the values go

| Situation                                         | Put the values in                                       |
| ------------------------------------------------- | ------------------------------------------------------- |
| Point this Docker Compose stack at the live DB    | Root `.env`: uncomment the "Switch to the live database" block from `.env.example` |
| Deployed backend on a server                      | `erp-backend/.env.production` (copy `.env.production.example`) |
| Deployed frontend build                           | `erp-frontend/.env.production` (copy `.env.production.example`) |
| Hosting platform or `docker run`                  | The platform's environment settings, or `docker run --env-file ...` |

Notes:

- URL-encode special characters in the password (`@` → `%40`, `#` → `%23`).
- The database's firewall or security group must allow connections from where the backend runs.
- **AWS RDS:** the RDS certificate bundle is committed at
  `erp-backend/certs/rds-global-bundle.pem` and the backend Docker image trusts it, so keep
  `DB_SSL_REJECT_UNAUTHORIZED=true`. Outside Docker, start Node with the environment
  variable `NODE_EXTRA_CA_CERTS=certs/rds-global-bundle.pem` (run from `erp-backend/`).
  Setting `DB_SSL_REJECT_UNAUTHORIZED=false` turns certificate checking off; use it only as a last resort.
  To refresh the bundle when AWS adds new authorities, replace the file with
  `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` and commit it.
- Tables are not created automatically on the live database. Once entities exist, use TypeORM migrations.

## Production images

```bash
docker build --target prod -t sps-erp-backend  ./erp-backend
docker build --target prod -t sps-erp-frontend ./erp-frontend
docker run --env-file erp-backend/.env.production -p 5000:5000 sps-erp-backend
```
