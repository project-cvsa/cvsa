# syntax=docker/dockerfile:1.7

# ==============================================================================
# Stage 1: Base Runtime (Bun + OS libraries for ONNX Runtime & OpenCC)
# ==============================================================================
FROM oven/bun:1.4.2-debian AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	libgomp1 \
	libstdc++6 \
	&& rm -rf /var/lib/apt/lists/*

# ==============================================================================
# Stage 2: Dependency Layer (Cached unless package.json or bun.lock changes)
# ==============================================================================
FROM base AS deps
COPY package.json bun.lock turbo.json ./
# Every workspace manifest must be listed here: `bun install --frozen-lockfile`
# validates the whole workspace graph, so a missing `package.json` (for example a
# newly added app) fails the build. Keep in sync with `workspaces` in the root
# package.json.
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/crawler/package.json ./apps/crawler/package.json
COPY apps/inference/package.json ./apps/inference/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/authentication/package.json ./packages/authentication/package.json
COPY packages/catalog/package.json ./packages/catalog/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/embedding/package.json ./packages/embedding/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/network-scheduler/package.json ./packages/network-scheduler/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/snapshot-db/package.json ./packages/snapshot-db/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

# ==============================================================================
# Stage 3: Source & Contract Generation Layer
# ==============================================================================
FROM deps AS source
COPY packages ./packages
COPY locale ./locale
COPY apps ./apps
RUN bun run --filter @cvsa/db gen && bun run --filter @cvsa/snapshot-db gen

# ==============================================================================
# Stage 4: Target - Backend API & Outbox Service
# ==============================================================================
FROM source AS backend
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=16412
EXPOSE 16412
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
	CMD curl -fsS http://127.0.0.1:${PORT:-16412}/v2/health || exit 1
CMD ["bun", "run", "--cwd", "apps/backend", "start"]

# ==============================================================================
# Stage 5: Target - Crawler Daemon & Control Plane
#
# The crawler no longer runs ONNX in-process: it calls the `inference` stage
# over HTTP (`ML_API_URL`). `/app/model` stays mounted as the fallback location
# for operators that keep the legacy on-disk assets around.
# ==============================================================================
FROM source AS crawler
ENV NODE_ENV=production
ENV CONTROL_API_HOST=0.0.0.0
ENV CONTROL_API_PORT=16413
VOLUME ["/app/model"]
EXPOSE 16413
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
	CMD curl -fsS -H "Authorization: Bearer ${CONTROL_API_TOKEN}" http://127.0.0.1:${CONTROL_API_PORT:-16413}/v2/network-runtime/status || exit 1
CMD ["bun", "run", "--cwd", "apps/crawler", "start"]

# ==============================================================================
# Stage 6: Target - Akari ONNX Inference Service (classifier for the crawler)
#
# The ONNX assets are never baked into the image: they are mounted read-only at
# `/app/model` and every path is supplied through `CVSA_INFERENCE_*` variables
# (see `.env.prod.example`). `src/main.ts` is the process entrypoint behind the
# package `start` script; `src/index.ts` only re-exports the library surface.
# ==============================================================================
FROM source AS inference
ENV NODE_ENV=production
ENV CVSA_INFERENCE_HOST=0.0.0.0
ENV CVSA_INFERENCE_PORT=8544
VOLUME ["/app/model"]
EXPOSE 8544
# Liveness only: `/health` answers as soon as the HTTP layer is up, while
# `/ready` stays 503 until every ONNX asset is verified and loaded.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=3 \
	CMD curl -fsS http://127.0.0.1:${CVSA_INFERENCE_PORT:-8544}/health || exit 1
CMD ["bun", "run", "--cwd", "apps/inference", "start"]

# ==============================================================================
# Stage 7: Target - Search Embedding Service
# ==============================================================================
FROM source AS embedding
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=14900
VOLUME ["/app/model"]
EXPOSE 14900
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
	CMD curl -fsS http://127.0.0.1:${PORT:-14900}/health || exit 1
CMD ["bun", "run", "--cwd", "packages/embedding", "start"]

# ==============================================================================
# Stage 8: Build - Web SSR Bundle (Astro + Solid)
# ==============================================================================
FROM source AS web-builder
ENV NODE_ENV=production
RUN bun run --cwd apps/web build

# ==============================================================================
# Stage 9: Target - Web SSR (Astro + Solid under Bun Runtime)
# ==============================================================================
FROM source AS web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10199
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist
EXPOSE 10199
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
	CMD curl -fsS http://127.0.0.1:${PORT:-10199}/ || exit 1
CMD ["bun", "./apps/web/dist/server/entry.mjs"]
