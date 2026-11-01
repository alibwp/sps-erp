# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app
# Trust the AWS RDS certificate authorities, so SSL to an RDS database works
# with certificate verification on (DB_SSL_REJECT_UNAUTHORIZED=true).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/certs/rds-global-bundle.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem

# ---- Dependencies (installed inside Linux, never copied from Windows) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Development: used by docker-compose.yml, hot reload via --watch ----
FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 5000
# --no-shell: the slim image has no `ps`, so the CLI can only stop the old
# server on reload if it is its direct child (otherwise: EADDRINUSE).
CMD ["npm", "run", "start:dev", "--", "--no-shell"]

# ---- Production build ----
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Production runtime: docker build --target prod -t sps-erp-backend . ----
FROM base AS prod
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 5000
CMD ["node", "dist/main.js"]
