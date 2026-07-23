# Slipstream demo image — burnish's pattern: slim Node, tsx runs TypeScript
# directly (no compile step for a demo app), health check on /api/health.
FROM node:20-slim

ENV NODE_ENV=production PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# tsx lives in devDependencies; the runtime needs it, so install everything.
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY web ./web
COPY data ./data
COPY docs/pack ./docs/pack

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8080/api/health || exit 1

EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
