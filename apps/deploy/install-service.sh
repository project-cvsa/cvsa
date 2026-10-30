#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/../.." && pwd)"
template_file="${script_dir}/cvsa-deploy.service.template"
target_file="/etc/systemd/system/cvsa-deploy.service"

if ! command -v systemctl >/dev/null 2>&1; then
	echo "Error: systemctl not found. This installation script requires a Linux systemd environment." >&2
	exit 1
fi

if [ ! -f "${template_file}" ]; then
	echo "Error: template file not found at ${template_file}" >&2
	exit 1
fi

target_user="${SUDO_USER:-$(id -un)}"
target_group="$(id -gn "${target_user}" 2>/dev/null || echo "${target_user}")"

bun_bin="$(command -v bun || true)"
if [ -z "${bun_bin}" ] && [ -n "${SUDO_USER:-}" ]; then
	bun_bin="$(su - "${target_user}" -c 'command -v bun' 2>/dev/null || true)"
fi

if [ -z "${bun_bin}" ]; then
	target_home="$(getent passwd "${target_user}" 2>/dev/null | cut -d: -f6 || true)"
	if [ -n "${target_home}" ] && [ -x "${target_home}/.bun/bin/bun" ]; then
		bun_bin="${target_home}/.bun/bin/bun"
	fi
fi

if [ -z "${bun_bin}" ]; then
	echo "Error: bun executable not found in PATH or ~/.bun/bin." >&2
	exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
	echo "Warning: docker command not found in PATH." >&2
fi

if [ "${target_user}" != "root" ]; then
	if ! id -nG "${target_user}" 2>/dev/null | grep -qw "docker"; then
		echo "Warning: User '${target_user}' does not belong to the 'docker' group." >&2
		echo "To allow running docker commands without root, run:" >&2
		echo "  sudo usermod -aG docker ${target_user}" >&2
	fi
fi

echo "Installing cvsa-deploy.service for user '${target_user}' (${target_group}) at '${project_root}'"

current_path="${PATH}"
sed \
	-e "s|%USER%|${target_user}|g" \
	-e "s|%GROUP%|${target_group}|g" \
	-e "s|%WORKING_DIR%|${project_root}|g" \
	-e "s|%BUN_PATH%|${bun_bin}|g" \
	-e "s|%PATH%|${current_path}|g" \
	"${template_file}" | sudo tee "${target_file}" > /dev/null

sudo systemctl daemon-reload

if systemctl is-active --quiet cvsa-deploy 2>/dev/null; then
	echo "cvsa-deploy is already active. Restarting service to apply changes..."
	sudo systemctl restart cvsa-deploy
else
	echo "Service installed to ${target_file}. Enable and start with:"
	echo "  sudo systemctl enable --now cvsa-deploy"
fi
