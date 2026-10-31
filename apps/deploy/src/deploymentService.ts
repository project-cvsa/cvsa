import { randomUUID } from "node:crypto";
import { rename } from "node:fs/promises";
import { resolve } from "node:path";
import { DeployStateSchema, type DeployRequest, type DeployState } from "@cvsa/contracts";
import { z } from "zod";

const ServiceConfigSchema = z
	.object({
		image: z.string().optional(),
	})
	.passthrough();

const ComposeOverrideSchema = z
	.object({
		services: z.record(z.string(), ServiceConfigSchema).optional().default({}),
	})
	.passthrough();

export type ComposeOverride = z.infer<typeof ComposeOverrideSchema>;

export class DeploymentService {
	private active = false;
	private state: DeployState | undefined;
	constructor(
		private root: string,
		private run?: (files: string[], args: string[]) => Promise<void>
	) {}
	async initialize() {
		const file = Bun.file(resolve(this.root, ".deploy.state.json"));
		if (await file.exists()) {
			const parsed = DeployStateSchema.safeParse(await file.json());
			if (!parsed.success) {
				console.warn("Ignoring legacy deployment status; container state is unchanged");
				return;
			}
			this.state = parsed.data;
			if (this.state.status === "deploying") {
				this.state.status = "failed";
				this.state.finishedAt = new Date().toISOString();
				this.state.error = "Deployment interrupted; inspect containers before retrying";
				await this.persist();
			}
		}
	}
	get status() {
		return this.state ?? { status: "idle" };
	}
	start(request: DeployRequest) {
		if (this.active) return undefined;
		this.active = true;
		this.state = {
			id: randomUUID(),
			status: "deploying",
			...request,
			startedAt: new Date().toISOString(),
			finishedAt: null,
			error: null,
		};
		void this.execute(request)
			.catch((error) => console.error(error))
			.finally(() => {
				this.active = false;
			});
		return this.state;
	}
	private async atomic(path: string, value: unknown, format: "json" | "yaml" = "json") {
		const content =
			format === "yaml" ? Bun.YAML.stringify(value) : JSON.stringify(value, null, 2);
		await Bun.write(`${path}.tmp`, content);
		await rename(`${path}.tmp`, path);
	}
	private async persist() {
		await this.atomic(resolve(this.root, ".deploy.state.json"), this.state, "json");
	}
	private async compose(files: string[], args: string[]) {
		if (this.run) return this.run(files, args);
		const proc = Bun.spawn(
			["docker", "compose", ...files.flatMap((file) => ["-f", file]), ...args],
			{ cwd: this.root, stdout: "inherit", stderr: "inherit" }
		);
		if ((await proc.exited) !== 0) throw new Error(`docker compose ${args[0]} failed`);
	}
	private async execute(request: DeployRequest) {
		try {
			await this.persist();
			const base = resolve(this.root, "docker-compose.yml");
			const override = resolve(this.root, "docker-compose.override.yml");
			const candidate = resolve(this.root, ".deploy.candidate.json");
			const previousFile = Bun.file(override);
			const previous: ComposeOverride = (await previousFile.exists())
				? ComposeOverrideSchema.parse(Bun.YAML.parse(await previousFile.text()))
				: { services: {} };
			const next = structuredClone(previous);
			if (!next.services) next.services = {};
			for (const service of request.services) {
				const existingService = next.services[service] ?? {};
				next.services[service] = {
					...existingService,
					image: `${process.env.IMAGE_REGISTRY ?? "ghcr.io/project-cvsa"}/cvsa-${service}:${request.tag}`,
				};
			}
			await this.atomic(candidate, next, "json");
			const files = [base, candidate];
			await this.compose(files, ["config", "--quiet"]);
			await this.compose(files, ["pull", ...request.services]);
			await this.compose(files, [
				"up",
				"-d",
				"--no-deps",
				"--no-build",
				"--wait",
				"--wait-timeout",
				"180",
				...request.services,
			]);
			await this.atomic(override, next, "yaml");
			if (this.state) this.state.status = "success";
		} catch (error) {
			if (this.state) {
				this.state.status = "failed";
				this.state.finishedAt = new Date().toISOString();
				this.state.error = error instanceof Error ? error.message : String(error);
			}
		} finally {
			if (this.state) this.state.finishedAt = new Date().toISOString();
			await this.persist();
		}
	}
}
