# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app
# Next.js sends anonymous usage telemetry by default; keep it off.
ENV NEXT_TELEMETRY_DISABLED=1

# ---- Dependencies (installed inside Linux, never copied from Windows) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Development: used by docker-compose.yml, hot reload via --watch ----
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ---- Production build ----
FROM deps AS build
# Live backend URL: --build-arg NEXT_PUBLIC_API_URL=https://.../api
ARG NEXT_PUBLIC_API_URL
COPY . .
# Next.js treats an empty variable as set, so drop it when no value was given.
RUN if [ -z "$NEXT_PUBLIC_API_URL" ]; then unset NEXT_PUBLIC_API_URL; fi \
  && npm run build

# ---- Production runtime: docker build --target prod -t sps-erp-frontend . ----
FROM base AS prod
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
