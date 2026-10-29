import { describe, expect, spyOn, test } from "bun:test";
import { DiscoveryFilterService } from "../src/crawler/discovery/filter";
import {
	VideoClassifierClient,
	type ClassifierHealth,
	type LocalClassifier,
} from "../src/crawler/discovery/classifier";
import {
	LocalAkariClassifier,
	type AkariHealth,
	type AkariPrediction,
	type AkariStatus,
} from "../src/ml/akari";

function localStatus(overrides: Partial<AkariStatus> = {}): AkariStatus {
	return {
		ready: true,
		modelVersion: "3.17",
		modelDir: "/models",
		embeddingPath: "/models/embedding/model.onnx",
		classifierPath: "/models/akari/3.17.onnx",
		embeddingExists: true,
		classifierExists: true,
		lastError: null,
		...overrides,
	};
}

function healthy(overrides: Partial<AkariHealth> = {}): AkariHealth {
	return {
		status: "healthy",
		modelLoaded: true,
		modelVersion: "akari-3.17",
		latencyMs: 4,
		...overrides,
	};
}

function prediction(overrides: Partial<AkariPrediction> = {}): AkariPrediction {
	return {
		label: 1,
		probabilities: [0.1, 0.9],
		songProbability: 0.9,
		isAccepted: true,
		modelVersion: "akari-3.17",
		...overrides,
	};
}

/** Deterministic stand-in for `LocalAkariClassifier`. */
function fakeLocal(
	result: AkariPrediction | null,
	health: AkariHealth = healthy(),
	status: AkariStatus = localStatus()
): LocalClassifier & { calls: number } {
	const fake = {
		calls: 0,
		getStatus: () => status,
		getModelVersionLabel: () => "akari-3.17",
		checkHealth: async () => health,
		async classify(): Promise<AkariPrediction | null> {
			fake.calls += 1;
			return result;
		},
	};
	return fake;
}

function clientWith(local: LocalClassifier): VideoClassifierClient {
	return new VideoClassifierClient({ localClassifier: local });
}

describe("VideoClassifierClient (in-process ONNX)", () => {
	test("classifies without any HTTP traffic", async () => {
		const fetchSpy = spyOn(globalThis, "fetch");

		try {
			const local = fakeLocal(prediction());
			const result = await clientWith(local).classify({
				title: "song",
				tags: ["洛天依"],
			});

			expect(result?.label).toBe(1);
			expect(local.calls).toBe(1);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});

	test("derives song probability and acceptance from the not-a-song class", async () => {
		const local = fakeLocal(
			prediction({ label: 2, probabilities: [0.1, 0.2, 0.7], songProbability: 0.9 })
		);

		const result = await clientWith(local).classify({ title: "song" });

		expect(result?.label).toBe(2);
		expect(result?.songProbability).toBeCloseTo(0.9, 5);
		expect(result?.isAccepted).toBe(true);
		expect(result?.modelVersion).toBe("akari-3.17");
	});

	test("marks label 0 predictions as rejected", async () => {
		const local = fakeLocal(
			prediction({
				label: 0,
				probabilities: [0.85, 0.15],
				songProbability: 0.15,
				isAccepted: false,
			})
		);

		const result = await clientWith(local).classify({ title: "not a song" });

		expect(result?.isAccepted).toBe(false);
		expect(result?.songProbability).toBeCloseTo(0.15, 5);
	});

	test("returns null when the model is unavailable", async () => {
		const local = fakeLocal(null);

		expect(await clientWith(local).classify({ title: "song" })).toBeNull();
		expect(local.calls).toBe(1);
	});

	test("returns null instead of throwing when the classifier fails", async () => {
		const failing: LocalClassifier = {
			checkHealth: async () => healthy(),
			classify: async () => {
				throw new Error("onnx exploded");
			},
		};

		expect(await clientWith(failing).classify({ title: "song" })).toBeNull();
	});

	test("exposes the rich in-process health status", async () => {
		const local = fakeLocal(prediction(), healthy({ latencyMs: 12 }));

		expect(await clientWith(local).checkHealth()).toEqual({
			status: "healthy",
			modelLoaded: true,
			modelVersion: "akari-3.17",
			latencyMs: 12,
		});
	});

	test("reports healthy models as reachable and loaded", async () => {
		const local = fakeLocal(prediction());

		const health: ClassifierHealth = await clientWith(local).health();

		expect(health).toEqual({
			reachable: true,
			modelsLoaded: true,
			modelVersion: "akari-3.17",
			error: null,
		});
	});

	test("reports degraded models as reachable but not loaded", async () => {
		const local = fakeLocal(
			null,
			healthy({ status: "degraded", modelLoaded: false, error: "files missing" }),
			localStatus({ embeddingExists: false, classifierExists: false, ready: false })
		);

		expect(await clientWith(local).health()).toEqual({
			reachable: true,
			modelsLoaded: false,
			modelVersion: "akari-3.17",
			error: "files missing",
		});
	});

	test("reports unreachable when the health probe itself fails", async () => {
		const failing: LocalClassifier = {
			checkHealth: async () => {
				throw new Error("probe failed");
			},
			classify: async () => null,
		};

		const client = clientWith(failing);

		expect(await client.checkHealth()).toEqual({
			status: "unreachable",
			modelLoaded: false,
			error: "probe failed",
		});
		expect(await client.health()).toEqual({
			reachable: false,
			modelsLoaded: null,
			modelVersion: null,
			error: "probe failed",
		});
	});

	test("the default client wires the in-process ONNX classifier", () => {
		const client = new VideoClassifierClient();

		expect(client.local).toBeInstanceOf(LocalAkariClassifier);
	});
});

describe("LocalAkariClassifier without ONNX artifacts", () => {
	test("degrades gracefully instead of throwing", async () => {
		const classifier = new LocalAkariClassifier({
			modelDir: "/tmp/cvsa-missing-onnx-models",
		});

		const status = classifier.getStatus();
		expect(status.embeddingExists).toBe(false);
		expect(status.classifierExists).toBe(false);
		expect(await classifier.classify({ title: "song" })).toBeNull();

		const health = await classifier.checkHealth();
		expect(health.status).toBe("degraded");
		expect(health.modelLoaded).toBe(false);
		expect(health.modelVersion).toBe("akari-3.17");
		expect(health.error).toContain("ONNX model files not found");
	});

	test("resolves default artifacts from the repository instead of the process working directory", () => {
		const previous = process.env.CRAWLER_MODEL_DIR;
		delete process.env.CRAWLER_MODEL_DIR;
		try {
			const classifier = new LocalAkariClassifier();
			expect(classifier.embeddingPath).toBe(
				new URL("../../../model/embedding/model.onnx", import.meta.url).pathname
			);
			expect(classifier.classifierPath).toBe(
				new URL("../../../model/akari/3.17.onnx", import.meta.url).pathname
			);
		} finally {
			if (previous !== undefined) process.env.CRAWLER_MODEL_DIR = previous;
		}
	});

	test("resolves artifacts from CRAWLER_MODEL_DIR", () => {
		const previous = process.env.CRAWLER_MODEL_DIR;
		process.env.CRAWLER_MODEL_DIR = "/srv/cvsa/model";
		try {
			const classifier = new LocalAkariClassifier();
			expect(classifier.embeddingPath).toBe("/srv/cvsa/model/embedding/model.onnx");
			expect(classifier.classifierPath).toBe("/srv/cvsa/model/akari/3.17.onnx");
		} finally {
			if (previous === undefined) delete process.env.CRAWLER_MODEL_DIR;
			else process.env.CRAWLER_MODEL_DIR = previous;
		}
	});
});

describe("DiscoveryFilterService.evaluateCandidate with the model", () => {
	const baseInput = {
		title: "Some title",
		tags: ["游戏"],
		description: "description",
		duration: 180,
	};

	test("accepts when P(song) clears the threshold", async () => {
		const local = fakeLocal(prediction({ probabilities: [0.2, 0.8], songProbability: 0.8 }));
		const service = new DiscoveryFilterService({ modelThreshold: 0.5 });

		const decision = await service.evaluateCandidate(baseInput, clientWith(local));

		expect(decision.action).toBe("accept");
		expect(decision.reason).toBe("model_hit");
		expect(decision.confidence).toBeCloseTo(0.8, 5);
		expect(decision.model?.label).toBe(1);
	});

	test("rejects when P(song) stays under the threshold", async () => {
		const local = fakeLocal(
			prediction({
				label: 0,
				probabilities: [0.9, 0.1],
				songProbability: 0.1,
				isAccepted: false,
			})
		);
		const service = new DiscoveryFilterService({ modelThreshold: 0.5 });

		const decision = await service.evaluateCandidate(baseInput, clientWith(local));

		expect(decision.action).toBe("reject");
		expect(decision.reason).toBe("model_rejected");
	});

	test("routes non-whitelist candidates to the ONNX model regardless of keywords or duration", async () => {
		const local = fakeLocal(prediction());
		const service = new DiscoveryFilterService();

		const decision = await service.evaluateCandidate(
			{ ...baseInput, title: "原神 live", duration: 10 },
			clientWith(local)
		);

		expect(decision.action).toBe("accept");
		expect(decision.reason).toBe("model_hit");
		expect(local.calls).toBe(1);
	});

	test("strong whitelist hit skips the model entirely", async () => {
		const local = fakeLocal(prediction());
		const service = new DiscoveryFilterService();

		const decision = await service.evaluateCandidate(
			{ ...baseInput, title: "洛天依 原创曲", tags: ["vocaloid"] },
			clientWith(local)
		);

		expect(decision.action).toBe("accept");
		expect(decision.reason).toBe("whitelist_hit");
		expect(local.calls).toBe(0);
	});

	test("falls back to rules and flags model_unavailable when the model is down", async () => {
		const local = fakeLocal(
			null,
			healthy({ status: "degraded", modelLoaded: false, error: "files missing" }),
			localStatus({ embeddingExists: false, classifierExists: false, ready: false })
		);
		const service = new DiscoveryFilterService();

		const withSinger = await service.evaluateCandidate(
			{ ...baseInput, title: "洛天依 live" },
			clientWith(local)
		);
		expect(withSinger.action).toBe("accept");
		expect(withSinger.reason).toBe("model_unavailable");

		const withoutSinger = await service.evaluateCandidate(baseInput, clientWith(local));
		expect(withoutSinger.action).toBe("reject");
		expect(withoutSinger.reason).toBe("model_unavailable");
	});

	test("modelEnabled=false keeps rule-only behaviour", async () => {
		const local = fakeLocal(prediction());
		const service = new DiscoveryFilterService({ modelEnabled: false });

		const decision = await service.evaluateCandidate(baseInput, clientWith(local));

		expect(decision.action).toBe("reject");
		expect(local.calls).toBe(0);
	});
});
