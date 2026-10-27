#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(cd "${script_dir}/.." && pwd)"
template_file="${script_dir}/cvsa-deploy.service.template"
target_file="/etc/systemd/system/cvsa-deploy.service"

bun_bin="$(command -v bun || true)"
if [ -z "${bun_bin}" ]; then
	echo "Error: bun executable not found in PATH" >&2
	exit 1
fi

current_user="$(id -un)"

echo "Installing cvsa-deploy.service for user '${current_user}' at '${project_root}'"
sed \
	-e "s|%USER%|${current_user}|g" \
	-e "s|%WORKING_DIR%|${project_root}|g" \
	-e "s|%BUN_PATH%|${bun_bin}|g" \
	"${template_file}" | sudo tee "${target_file}" > /dev/null

sudo systemctl daemon-reload
echo "Service installed to ${target_file}. Enable and start with:"
echo "  sudo systemctl enable --now cvsa-deploy"
