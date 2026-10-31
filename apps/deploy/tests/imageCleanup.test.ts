import { expect, test } from "bun:test";
import { removeStaleImages, type DockerExec } from "../src/imageCleanup";

const registry = "ghcr.io/project-cvsa";

function fakeDocker(options: { listed: string; inUse: string[]; failRemove?: string[] }) {
	const calls: string[][] = [];
	const exec: DockerExec = async (args) => {
		calls.push(args);
		if (args[0] === "image" && args[1] === "ls") return options.listed;
		if (args[0] === "ps") {
			const reference = args[3].replace("ancestor=", "");
			return options.inUse.includes(reference) ? "container-id\n" : "";
		}
		if (args[0] === "image" && args[1] === "rm") {
			if (options.failRemove?.includes(args[2])) throw new Error("image is being used");
			return "";
		}
		throw new Error(`unexpected docker call: ${args.join(" ")}`);
	};
	return { exec, calls };
}

const removals = (calls: string[][]) =>
	calls.filter((args) => args[0] === "image" && args[1] === "rm").map((args) => args[2]);

test("removes only superseded sha tags that no container references", async () => {
	const { exec, calls } = fakeDocker({
		listed: [
			`${registry}/cvsa-web\tsha-000000000001`,
			`${registry}/cvsa-web\tsha-000000000002`,
			`${registry}/cvsa-web\tlatest`,
		].join("\n"),
		inUse: [`${registry}/cvsa-web:sha-000000000002`],
	});
	await removeStaleImages(["web"], registry, exec);
	expect(removals(calls)).toEqual([`${registry}/cvsa-web:sha-000000000001`]);
	expect(calls.find((args) => args[1] === "ls")?.at(-1)).toBe(`reference=${registry}/cvsa-web`);
});

test("keeps images whose removal is rejected", async () => {
	const { exec, calls } = fakeDocker({
		listed: `${registry}/cvsa-crawler\tsha-000000000003`,
		inUse: [],
		failRemove: [`${registry}/cvsa-crawler:sha-000000000003`],
	});
	await removeStaleImages(["crawler"], registry, exec);
	expect(removals(calls)).toEqual([`${registry}/cvsa-crawler:sha-000000000003`]);
});
