#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.prod}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-60}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-2}"
CRAWLER_DRAIN_TIMEOUT="${CRAWLER_DRAIN_TIMEOUT:-30}"

compose() {
	docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

container_status() {
	local svc="$1"
	docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "cvsa-${svc}" 2>/dev/null || echo "missing"
}

container_running() {
	local svc="$1"
	[[ "$(docker inspect --format='{{.State.Running}}' "cvsa-${svc}" 2>/dev/null || echo "false")" == "true" ]]
}

check_service() {
	local svc="$1"
	local attempts="$2"
	local status="missing"
	for _ in $(seq 1 "$attempts"); do
		status="$(container_status "$svc")"
		if [[ "$status" == "healthy" || "$status" == "running" ]]; then
			return 0
		fi
		sleep "$HEALTH_INTERVAL"
	done
	echo "Service cvsa-${svc} failed health verification (last status: ${status})" >&2
	return 1
}

# The crawler is the only dispatcher: more than one running instance would let
# two generations drain the same queue with different code versions.
check_single_crawler() {
	local running
	running="$(compose ps --status running --quiet crawler | wc -l | tr -d '[:space:]')"
	if [[ "$running" != "1" ]]; then
		echo "Expected exactly one running crawler, found ${running}" >&2
		return 1
	fi
}

# Stop the crawler and wait until it has fully exited, so no two dispatcher
# generations overlap while the rest of the stack is replaced.
drain_crawler() {
	if ! container_running "crawler"; then
		echo "Crawler is not running; nothing to drain."
		return 0
	fi
	echo "Draining crawler (grace ${CRAWLER_DRAIN_TIMEOUT}s)..."
	compose stop --timeout "$CRAWLER_DRAIN_TIMEOUT" crawler
	for _ in $(seq 1 $((CRAWLER_DRAIN_TIMEOUT + 10))); do
		if ! container_running "crawler"; then
			echo "Crawler drained."
			return 0
		fi
		sleep 1
	done
	echo "Crawler did not stop within ${CRAWLER_DRAIN_TIMEOUT}s" >&2
	return 1
}

verify_stack() {
	# Infrastructure first: everything below depends on it.
	check_service "db" "$HEALTH_ATTEMPTS"
	check_service "snapshot-db" "$HEALTH_ATTEMPTS"
	check_service "redis" "$HEALTH_ATTEMPTS"
	check_service "meili" "$HEALTH_ATTEMPTS"

	# Application services. `inference` is verified through `/ready`, so a
	# container that cannot load its ONNX assets fails the rollout instead of
	# silently degrading the crawler's classification stage.
	check_service "backend" "$HEALTH_ATTEMPTS"
	check_service "web" "$HEALTH_ATTEMPTS"
	check_service "embedding" "$HEALTH_ATTEMPTS"
	check_service "inference" "$HEALTH_ATTEMPTS"

	# The crawler is verified last so it never observes a half-rolled stack.
	check_service "crawler" "$HEALTH_ATTEMPTS"
	check_single_crawler

	check_service "caddy" "$HEALTH_ATTEMPTS"

	echo "All CVSA services verified healthy."
}

case "${1:-verify}" in
drain)
	drain_crawler
	;;
verify)
	verify_stack
	;;
*)
	echo "Usage: $0 [verify|drain]" >&2
	exit 2
	;;
esac
