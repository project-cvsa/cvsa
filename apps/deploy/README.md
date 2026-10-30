# @cvsa/deploy

Host deployment service for CVSA. It runs as a systemd daemon on the production server, listens for deployment webhooks, atomically manages `docker-compose.override.yml`, and executes targeted container rollouts.

## Host Installation

```bash
# Install and start the systemd unit
bash apps/deploy/install-service.sh
sudo systemctl enable --now cvsa-deploy

# Check service status and logs
sudo systemctl status cvsa-deploy
journalctl -u cvsa-deploy -f
```

## API Endpoints

All endpoints require `Authorization: Bearer <DEPLOY_WEBHOOK_SECRET>` unless noted otherwise.

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/deploy` | Bearer | Trigger deployment for specified services and tag |
| `GET` | `/status` | Bearer | Query current or last completed deployment status |
| `GET` | `/health` | None | Service liveness probe |

### Payload Example (`POST /deploy`)

```json
{
  "tag": "sha-2943d3cdeca8",
  "services": ["web"]
}
```

- `tag`: Immutable commit SHA tag to deploy (required).
- `services`: Array of target services to update (optional). When omitted or empty, all applications (`backend`, `crawler`, `embedding`, `web`) are rolled out.

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `DEPLOY_WEBHOOK_SECRET` | *(required)* | Secret token for authenticating webhook requests |
| `DEPLOY_PORT` | `9420` | Local port the daemon listens on (reverse-proxied by Caddy) |
| `DEPLOY_HOST` | `127.0.0.1` | Local bind address |

## Development

```bash
# Run unit and integration tests
bun test

# Start daemon locally
bun start
```
