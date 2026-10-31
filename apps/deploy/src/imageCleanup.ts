const SHA_TAG = /^sha-[0-9a-f]{12,40}$/;

export type DockerExec = (args: string[]) => Promise<string>;

async function docker(args: string[], timeoutMs = 30_000): Promise<string> {
	const proc = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => {
		try {
			proc.kill();
		} catch {
			// ignored
		}
	}, timeoutMs);

	try {
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const code = await proc.exited;
		if (code !== 0) {
			throw new Error(`docker ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`);
		}
		return stdout;
	} finally {
		clearTimeout(timer);
	}
}

export async function removeStaleImages(
	services: readonly string[],
	registry: string,
	exec: DockerExec = docker
) {
	for (const service of services) {
		const repository = `${registry}/cvsa-${service}`;
		const listed = await exec([
			"image",
			"ls",
			"--format",
			"{{.Repository}}\t{{.Tag}}",
			"--filter",
			`reference=${repository}`,
		]);
		const stale = listed
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)
			.map((line) => {
				const [name, tag] = line.split("\t");
				return { reference: `${name}:${tag}`, tag };
			})
			.filter((entry) => SHA_TAG.test(entry.tag));

		for (const entry of stale) {
			const holders = await exec(["ps", "-aq", "--filter", `ancestor=${entry.reference}`]);
			if (holders.trim().length > 0) continue;
			try {
				await exec(["image", "rm", entry.reference]);
			} catch (error) {
				console.warn(
					`Keeping image ${entry.reference}: ${error instanceof Error ? error.message : String(error)}`
				);
			}
		}
	}
}
