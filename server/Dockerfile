FROM node:24-bookworm-slim AS build
WORKDIR /app/server
# Shared files under /app/src must resolve as ESM with NodeNext.
COPY package.json /app/package.json
COPY server/package*.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
COPY server/sql ./sql
COPY server/scripts ./scripts
COPY src/core/scoring.ts /app/src/core/scoring.ts
COPY src/core/types.ts /app/src/core/types.ts
COPY src/config/progression.ts src/config/difficulty.ts /app/src/config/
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app/server
# Preserve the ESM boundary for emitted shared modules in dist/src.
COPY --from=build --chown=node:node /app/package.json /app/package.json
COPY --from=build --chown=node:node /app/server/node_modules ./node_modules
COPY --from=build --chown=node:node /app/server/dist ./dist
COPY --from=build --chown=node:node /app/server/package.json ./package.json
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/server/src/migrate.js && exec node dist/server/src/index.js"]
