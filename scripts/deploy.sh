#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
cd "${project_root}"

lock_dir="${project_root}/.deploy.lock"
state_file="${project_root}/.deploy.state.json"

acquire_lock() {
	if ! mkdir "${lock_dir}" 2>/dev/null; then
		if [ -f "${lock_dir}/pid" ]; then
			local pid
			pid="$(cat "${lock_dir}/pid" 2>/dev/null || true)"
			if [ -n "${pid}" ] && kill -0 "${pid}" 2>/dev/null; then
				echo "Error: deployment is already in progress (PID: ${pid})" >&2
				exit 409
			fi
		fi
		rm -rf "${lock_dir}" 2>/dev/null || true
		if ! mkdir "${lock_dir}" 2>/dev/null; then
			echo "Error: failed to acquire deployment lock" >&2
			exit 409
		fi
	fi
	echo "$$" > "${lock_dir}/pid"
}

release_lock() {
	rm -rf "${lock_dir}" 2>/dev/null || true
}

acquire_lock

tag="${1:-${IMAGE_TAG:-latest}}"
export IMAGE_TAG="${tag}"
started_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

update_state() {
	local status="$1"
	local code="$2"
	local finished_at
	finished_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
	local temp_file="${state_file}.tmp.$$"
	cat <<EOF > "${temp_file}"
{
  "status": "${status}",
  "tag": "${IMAGE_TAG}",
  "startedAt": "${started_at}",
  "finishedAt": "${finished_at}",
  "exitCode": ${code}
}
EOF
	mv -f "${temp_file}" "${state_file}"
}

temp_initial_state="${state_file}.tmp.$$"
cat <<EOF > "${temp_initial_state}"
{
  "status": "deploying",
  "tag": "${IMAGE_TAG}",
  "startedAt": "${started_at}",
  "finishedAt": null,
  "exitCode": null
}
EOF
mv -f "${temp_initial_state}" "${state_file}"

cleanup() {
	local exit_code=$?
	trap - EXIT INT TERM
	if [ "${exit_code}" -eq 0 ]; then
		update_state "success" 0
	else
		update_state "failed" "${exit_code}"
	fi
	release_lock
	exit "${exit_code}"
}
trap cleanup EXIT INT TERM

echo "Deploying CVSA stack with IMAGE_TAG=${IMAGE_TAG}"

if [ ! -f .env ]; then
	if [ -f .env.example ]; then
		echo "Warning: .env not found, initializing from .env.example"
		cp .env.example .env
	else
		echo "Error: neither .env nor .env.example exists in ${project_root}" >&2
		exit 1
	fi
fi

if grep -q "^IMAGE_TAG=" .env 2>/dev/null; then
	sed -i.bak "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env && rm -f .env.bak
else
	echo "IMAGE_TAG=${IMAGE_TAG}" >> .env
fi

if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${GHCR_PULL_TOKEN:-}" ]; then
	echo "Logging into ghcr.io registry"
	echo "${GHCR_PULL_TOKEN}" | docker login ghcr.io --username "${GHCR_USERNAME}" --password-stdin
fi

echo "Pulling application images"
docker compose pull backend crawler embedding web

echo "Starting data backing services"
docker compose up -d --wait --wait-timeout 120 db snapshot-db redis meili

echo "Draining crawler dispatcher"
docker compose stop -t 30 crawler || true
docker compose rm -f crawler || true

echo "Applying database migrations"
docker compose run --rm --no-deps -T backend bun run --filter @cvsa/db migrate:deploy
docker compose run --rm --no-deps -T crawler bun run --filter @cvsa/snapshot-db migrate:deploy

echo "Starting application stack"
docker compose up -d --wait --wait-timeout 120 --remove-orphans

echo "Deployment completed successfully"
docker compose ps
