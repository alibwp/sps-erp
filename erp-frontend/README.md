# SPS ERP frontend

Next.js 16 website: the welcome page, navbar and sign-in page. Normally started
together with the backend and database by `docker compose up` from the
repository root; see the root `README.md`.

| Route    | Page                                                      |
| -------- | --------------------------------------------------------- |
| `/`      | Welcome page with modules and a live backend status card  |
| `/login` | Sign-in form (not connected to authentication yet)        |

## Running outside Docker

```bash
npm install
npm run dev                   # http://localhost:3000
```

The backend must be reachable at `NEXT_PUBLIC_API_URL`
(default `http://localhost:5000/api`).

## Scripts

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Development server with fast refresh |
| `npm run build`     | Production build                     |
| `npm run lint`      | ESLint                               |
| `npm run typecheck` | TypeScript check                     |

## Environment variables

See `.env.example` (local) and `.env.production.example` (live).
`NEXT_PUBLIC_` values are baked in at build time, so rebuild after changing them.
