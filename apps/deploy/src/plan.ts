import { appendFile } from "node:fs/promises";
import { z } from "zod";
const services = ["backend", "crawler", "embedding", "web"];
const selection = process.env.RELEASE_SERVICE ?? "affected";
let targets: string[];
if (selection !== "affected") {
	targets = selection === "all" ? services : services.filter((service) => service === selection);
	if (targets.length === 0) throw new Error("Invalid release service");
} else {
	const proc = Bun.spawn(["bunx", "--bun", "turbo", "ls", "--affected", "--output", "json"], {
		stdout: "pipe",
		stderr: "inherit",
	});
	const output = await new Response(proc.stdout).text();
	if ((await proc.exited) !== 0) throw new Error("Affected package detection failed");
	const result = z
		.object({ packages: z.object({ items: z.array(z.object({ name: z.string() })) }) })
		.parse(JSON.parse(output));
	const affected = new Set(result.packages.items.map((item) => item.name));
	// Type-only aliases are absent from the workspace dependency graph.
	if (affected.has("@cvsa/crawler")) affected.add("@cvsa/backend");
	if (affected.has("@cvsa/backend")) affected.add("@cvsa/web");
	targets = services.filter((service) => affected.has(`@cvsa/${service}`));
}
await appendFile(
	process.env.GITHUB_OUTPUT ?? "/dev/stdout",
	`services=${JSON.stringify(targets)}\ntag=sha-${(process.env.GITHUB_SHA ?? "").slice(0, 12)}\n`
);
