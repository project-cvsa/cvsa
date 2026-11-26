# Deploy Instructions (`apps/deploy`)

Owns the webhook deployment daemon (`src/index.ts`, `src/deploymentService.ts`, `src/imageCleanup.ts`), Turborepo release target planner (`src/plan.ts`), and systemd unit templates (`install-service.sh`, `cvsa-deploy.service.template`).

Read [CI/CD & Deployment](../../apps/docs/content/references/ci-cd-and-deployment.md).

## Boundaries & Invariants

- **Webhook auth & validation**: `src/index.ts` enforces a 16 KB body limit, constant-time `timingSafeEqual` verification against `DEPLOY_WEBHOOK_SECRET`, and `DeployRequestSchema` validation from `@cvsa/contracts`.
- **Atomic state & compose lifecycle**: `DeploymentService` rejects concurrent deploys (`409`), writes `.deploy.state.json` and `.deploy.candidate.json` atomically (`.tmp` + `rename`), validates Compose config before `pull` and `up -d --no-deps --no-build --wait`, and updates `docker-compose.override.yml` only after healthy startup.
- **Credential safety**: Never log or expose `DEPLOY_WEBHOOK_SECRET`, registry passwords, or `.env` values in command output or error fields.
- **Release planning**: `src/plan.ts` cascades `crawler -> backend -> web` and marks `locale/` and root config changes as affecting all services.

## Verification

```bash
bun run --cwd apps/deploy typecheck
bun run --cwd apps/deploy test
bun run ci
```
