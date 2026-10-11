# --- Build: dependencias (better-sqlite3 compila nativo) y build del cliente ---
FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY server/package*.json server/
RUN npm ci --prefix server
COPY client/package*.json client/
RUN npm ci --prefix client

COPY server server
COPY client client
RUN npm run build --prefix client && npm prune --omit=dev --prefix server

# --- Runtime: un solo proceso sirve /api y el cliente ---
FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/draft.db \
    IMG_DIR=/data/champions
WORKDIR /app/server

COPY --from=build /app/server /app/server
COPY --from=build /app/client/dist /app/client/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

VOLUME /data
EXPOSE 8787
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/index.ts"]
