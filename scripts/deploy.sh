#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# CVSA Stack Production Deployment Script
#
# Usage:
#   ./scripts/deploy.sh [IMAGE_TAG]
#
# Examples:
#   ./scripts/deploy.sh
#   ./scripts/deploy.sh sha-1b9edd326579
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

TAG="${1:-latest}"
echo "==> [deploy] Starting CVSA deployment with IMAGE_TAG=${TAG}..."

# Export IMAGE_TAG for docker compose
export IMAGE_TAG="${TAG}"

# Ensure .env exists
if [ ! -f .env ]; then
	if [ -f .env.example ]; then
		echo "==> [deploy] Notice: .env not found, initializing from .env.example..."
		cp .env.example .env
	else
		echo "==> [deploy] Error: .env file not found and .env.example missing." >&2
		exit 1
	fi
fi

# Step 1: Optional Docker registry login if credentials are provided in environment
if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_PULL_TOKEN:-}" ]; then
	echo "==> [deploy] Logging in to GitHub Container Registry (ghcr.io)..."
	echo "${GHCR_PULL_TOKEN}" | docker login ghcr.io --username "${GHCR_USERNAME}" --password-stdin
fi

# Step 2: Pull latest application images
echo "==> [deploy] Pulling application images (backend, crawler, embedding, web)..."
docker compose pull backend crawler embedding web

# Step 3: Ensure data backing services are healthy before migration
echo "==> [deploy] Ensuring data backing services are running and healthy..."
docker compose up -d --wait --wait-timeout 120 db snapshot-db redis meili

# Step 4: Gracefully drain the crawler to avoid overlapping scheduler leases
echo "==> [deploy] Draining and stopping crawler..."
docker compose stop -t 30 crawler || true
docker compose rm -f crawler || true

# Step 5: Run database migrations
echo "==> [deploy] Running database migrations..."
docker compose run --rm --no-deps -T backend bun run --filter @cvsa/db migrate:deploy
docker compose run --rm --no-deps -T crawler bun run --filter @cvsa/snapshot-db migrate:deploy

# Step 6: Bring up the full stack and wait for native healthchecks
echo "==> [deploy] Starting all services with healthchecks..."
docker compose up -d --wait --wait-timeout 120 --remove-orphans

# Step 7: Final health check overview
echo "==> [deploy] Deployment finished successfully! Service status:"
docker compose ps
