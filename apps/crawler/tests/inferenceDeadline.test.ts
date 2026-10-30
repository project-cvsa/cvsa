import { expect, test } from "bun:test";
import { IsolatedAkariClassifier } from "../src/ml/isolatedAkari";
import { runTaskWithDeadline } from "../src/crawler/shared/taskContext";

test("terminates stuck native work and processes the next request in a replacement process", async () => {
	let deadline = 100;
	const classifier = new IsolatedAkariClassifier(
		() => deadline,
		new URL("./support/akariProcessFixture.ts", import.meta.url)
	);
	try {
		await expect(classifier.classify({ title: "hang" })).rejects.toThrow("timed out");
		deadline = 2000;
		expect(await classifier.classify({ title: "healthy" })).toMatchObject({
			isAccepted: true,
			modelVersion: "fixture",
		});
		await expect(
			runTaskWithDeadline(50, () => classifier.classify({ title: "hang" }))
		).rejects.toThrow("deadline");
		expect(await classifier.checkHealth()).toMatchObject({
			status: "healthy",
			modelLoaded: true,
		});
	} finally {
		classifier.close();
	}
});
