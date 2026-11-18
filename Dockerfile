FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps ./apps
ARG VITE_TILE_URL
ARG VITE_TILE_ATTRIBUTION
RUN npm run build && npm prune --omit=dev
FROM node:26-bookworm-slim AS api
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api ./apps/api
COPY database ./database
COPY deploy/migrate.mjs ./deploy/migrate.mjs
ENV NODE_ENV=production HOST=0.0.0.0
USER node
CMD ["sh","-ec","node deploy/migrate.mjs && exec node apps/api/dist/src/main.js"]
FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
