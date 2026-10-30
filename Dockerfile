# syntax=docker/dockerfile:1.7

# Stage 1: Base Runtime (Bun + OS libraries for ONNX Runtime & OpenCC)
FROM oven/bun:1.4.2-debian AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	libgomp1 \
	libstdc++6 \
	&& rm -rf /var/lib/apt/lists/*

# Stage 2: Dependency Layer (Cached unless package.json or bun.lock changes)
FROM base AS deps
COPY package.json bun.lock turbo.json ./
# Every workspace manifest must be listed here: `bun install --frozen-lockfile`
# validates the whole workspace graph, so a missing `package.json` (for example a
# newly added app) fails the build. Keep in sync with `workspaces` in the root
# package.json.
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/crawler/package.json ./apps/crawler/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/deploy/package.json ./apps/deploy/package.json
COPY apps/docs/package.json ./apps/docs/package.json
COPY packages/authentication/package.json ./packages/authentication/package.json
COPY packages/catalog/package.json ./packages/catalog/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY apps/embedding/package.json ./apps/embedding/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/network-scheduler/package.json ./packages/network-scheduler/package.json
COPY packages/observability/package.json ./packages/observability/package.json
COPY packages/snapshot-db/package.json ./packages/snapshot-db/package.json
COPY packages/typescript-config/package.json ./packages/typescript-config/package.json

RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --ignore-scripts

# Stage 3: Source & Contract Generation Layer
FROM deps AS source
COPY packages ./packages
COPY locale ./locale
RUN bun run --filter @cvsa/db gen && \
	bun run --filter @cvsa/snapshot-db gen && \
	bun run --filter @cvsa/network-scheduler build

# Stage 4: Target - Backend API & Outbox Service
FROM source AS backend
COPY apps/backend ./apps/backend
COPY apps/crawler ./apps/crawler
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=16412
EXPOSE 16412
HEALTHCHECK --interval=3s --timeout=5s --start-period=5s --retries=5 \
	CMD curl -fsS http://127.0.0.1:${PORT:-16412}/v2/health || exit 1
CMD ["sh", "-c", "bun run --filter @cvsa/db migrate:deploy && exec bun run --cwd apps/backend start"]

# Stage 5: Target - Crawler Daemon & Control Plane
#
# Classification runs in-process against the mounted ONNX assets, and the
# HuggingFace tokenizer is prefetched at first boot. `HF_HOME` lives under the
# `/app/model` volume so the tokenizer cache survives container restarts instead
# of being downloaded again on every rollout.
FROM source AS crawler
COPY apps/crawler ./apps/crawler
ENV NODE_ENV=production
ENV CONTROL_API_HOST=0.0.0.0
ENV CONTROL_API_PORT=16413
ENV HF_HOME=/app/model/.cache/huggingface
VOLUME ["/app/model"]
EXPOSE 16413
HEALTHCHECK --interval=3s --timeout=5s --start-period=5s --retries=5 \
	CMD curl -fsS -H "Authorization: Bearer ${CONTROL_API_TOKEN}" http://127.0.0.1:${CONTROL_API_PORT:-16413}/v2/network-runtime/status || exit 1
CMD ["sh", "-c", "bun run --filter @cvsa/snapshot-db migrate:deploy && exec bun run --cwd apps/crawler start"]

# Stage 6: Target - Search Embedding Service
#
# Same caching contract as the crawler: the HuggingFace tokenizer is downloaded
# once into `/app/model/.cache/huggingface` and reused on every subsequent boot.
FROM source AS embedding
COPY apps/embedding ./apps/embedding
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=14900
ENV HF_HOME=/app/model/.cache/huggingface
VOLUME ["/app/model"]
EXPOSE 14900
HEALTHCHECK --interval=3s --timeout=5s --start-period=5s --retries=3 \
	CMD curl -fsS http://127.0.0.1:${PORT:-14900}/health || exit 1
CMD ["bun", "run", "--cwd", "apps/embedding", "start"]

# Stage 7: Build - Web SSR Bundle (Astro + Solid)
#
# `PUBLIC_API_URL` is read by Vite and baked into the bundle: an empty value is
# the supported default when the host proxy serves `/v2/*` and `/` from one
# origin and the browser calls `window.location.origin`. Pass a full origin only
# when the API is served from a different domain.
FROM source AS web-builder
COPY apps/web ./apps/web
COPY apps/backend ./apps/backend
COPY apps/crawler ./apps/crawler
COPY apps/embedding ./apps/embedding
ENV NODE_ENV=production
ARG PUBLIC_API_URL=""
ENV PUBLIC_API_URL=${PUBLIC_API_URL}
RUN bun run --cwd apps/web build

# Stage 8: Target - Web SSR (Astro + Solid under Bun Runtime)
FROM source AS web
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=10199
COPY --from=web-builder /app/apps/web/dist /app/apps/web/dist
EXPOSE 10199
HEALTHCHECK --interval=3s --timeout=5s --start-period=5s --retries=3 \
	CMD curl -fsS -H "Host: zh.projectcvsa.com" http://127.0.0.1:${PORT:-10199}/ || exit 1
CMD ["bun", "./apps/web/dist/server/entry.mjs"]
