import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AkariPrediction, AkariStatus } from "../src/ml/akari";
import { VideoClassifierClient, type LocalClassifier } from "../src/crawler/discovery/classifier";
import { DiscoveryFilterService } from "../src/crawler/discovery/filter";

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
	globalThis.fetch = handler as typeof fetch;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function classifier(): VideoClassifierClient {
	return new VideoClassifierClient({
		baseUrl: "http://ml.test",
		timeoutMs: 1_000,
		// Keep ONNX out of the unit test: the fallback is injected.
		localClassifier: undefined,
		fallbackToLocal: false,
	});
}

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

/** Deterministic stand-in for `AkariClassifier`. */
function fakeLocal(
	prediction: AkariPrediction | null,
	status: AkariStatus = localStatus()
): LocalClassifier & { calls: number } {
	const fake = {
		calls: 0,
		getStatus: () => status,
		getModelVersionLabel: () => "akari-3.17",
		async classify(): Promise<AkariPrediction | null> {
			fake.calls += 1;
			return prediction;
		},
	};
	return fake;
}

const songProbabilityFetch = (notSongProbability: number) =>
	stubFetch(
		async () =>
			new Response(
				JSON.stringify({
					label: 1,
					probabilities: [notSongProbability, 1 - notSongProbability],
				}),
				{ status: 200, headers: { "content-type": "application/json" } }
			)
	);

describe("VideoClassifierClient", () => {
	test("derives song probability from the not-a-song class", async () => {
		stubFetch(async (url, init) => {
			expect(url).toBe("http://ml.test/classify");
			const body = JSON.parse(String(init?.body));
			expect(body).toMatchObject({ title: "song", description: "N/A", tags: "empty" });
			return new Response(JSON.stringify({ label: 2, probabilities: [0.1, 0.2, 0.7] }), {
				status: 200,
				headers: { "content-type": "application/json" },
			});
		});

		const prediction = await classifier().classify({ title: "song" });

		expect(prediction?.label).toBe(2);
		expect(prediction?.songProbability).toBeCloseTo(0.9, 5);
	});

	test("returns null when the service answers with an error", async () => {
		stubFetch(async () => new Response("boom", { status: 500 }));

		expect(await classifier().classify({ title: "song" })).toBeNull();
	});

	test("returns null when the service is unreachable", async () => {
		stubFetch(async () => {
			throw new Error("ECONNREFUSED");
		});

		expect(await classifier().classify({ title: "song" })).toBeNull();
	});

	test("reports health from the models_loaded flag", async () => {
		stubFetch(
			async () =>
				new Response(JSON.stringify({ status: "ok", models_loaded: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
		);

		expect(await classifier().health()).toEqual({ reachable: true, modelsLoaded: true });
	});

	test("stamps predictions with a model version", async () => {
		stubFetch(
			async () =>
				new Response(JSON.stringify({ label: 1, probabilities: [0.2, 0.8] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
		);

		const prediction = await classifier().classify({ title: "song" });
		expect(prediction?.modelVersion).toBe("akari-3.17");
		expect(prediction?.source).toBe("remote");
	});

	test("prefers the model version echoed by the inference service", async () => {
		stubFetch(
			async () =>
				new Response(
					JSON.stringify({
						label: 1,
						probabilities: [0.2, 0.8],
						model_version: "akari-3.18",
					}),
					{ status: 200, headers: { "content-type": "application/json" } }
				)
		);

		expect((await classifier().classify({ title: "song" }))?.modelVersion).toBe("akari-3.18");
	});

	test("falls back to the local ONNX classifier when the service is down", async () => {
		stubFetch(async () => {
			throw new Error("ECONNREFUSED");
		});

		const local = fakeLocal({
			label: 1,
			probabilities: [0.1, 0.9],
			songProbability: 0.9,
			modelVersion: "akari-3.17",
		});
		const client = new VideoClassifierClient({
			baseUrl: "http://ml.test",
			timeoutMs: 1_000,
			localClassifier: local,
		});

		const prediction = await client.classify({ title: "song" });
		expect(prediction?.source).toBe("local");
		expect(prediction?.songProbability).toBeCloseTo(0.9, 5);
		expect(prediction?.modelVersion).toBe("akari-3.17");
		expect(local.calls).toBe(1);
	});

	test("prefers the remote service when it answers", async () => {
		songProbabilityFetch(0.2);

		const local = fakeLocal({
			label: 0,
			probabilities: [0.9, 0.1],
			songProbability: 0.1,
			modelVersion: "akari-3.17",
		});
		const client = new VideoClassifierClient({
			baseUrl: "http://ml.test",
			timeoutMs: 1_000,
			localClassifier: local,
		});

		const prediction = await client.classify({ title: "song" });
		expect(prediction?.source).toBe("remote");
		expect(local.calls).toBe(0);
	});

	test("never touches ONNX when the local model files are missing", async () => {
		stubFetch(async () => {
			throw new Error("ECONNREFUSED");
		});

		const local = fakeLocal(
			{
				label: 1,
				probabilities: [0.1, 0.9],
				songProbability: 0.9,
				modelVersion: "akari-3.17",
			},
			localStatus({ embeddingExists: false, classifierExists: false, ready: false })
		);
		const client = new VideoClassifierClient({
			baseUrl: "http://ml.test",
			timeoutMs: 1_000,
			localClassifier: local,
		});

		expect(await client.classify({ title: "song" })).toBeNull();
		expect(local.calls).toBe(0);
	});

	test("runs local-only when no inference service is configured", async () => {
		const fetchSpy = mock(async () => new Response("{}", { status: 200 }));
		stubFetch(fetchSpy);

		const local = fakeLocal({
			label: 1,
			probabilities: [0.05, 0.95],
			songProbability: 0.95,
			modelVersion: "akari-3.17",
		});
		const client = new VideoClassifierClient({
			timeoutMs: 1_000,
			localClassifier: local,
		});

		const prediction = await client.classify({ title: "song", tags: ["洛天依"] });
		expect(prediction?.source).toBe("local");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test("reports local model health when the service is unreachable", async () => {
		stubFetch(async () => {
			throw new Error("ECONNREFUSED");
		});

		const client = new VideoClassifierClient({
			baseUrl: "http://ml.test",
			timeoutMs: 1_000,
			localClassifier: fakeLocal(null),
		});

		expect(await client.health()).toEqual({ reachable: true, modelsLoaded: true });
	});

	test("preferLocal classifies locally first when the model files exist", async () => {
		const fetchSpy = mock(
			async () =>
				new Response(JSON.stringify({ label: 1, probabilities: [0.01, 0.99] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
		);
		stubFetch(fetchSpy);

		const local = fakeLocal({
			label: 0,
			probabilities: [0.8, 0.2],
			songProbability: 0.2,
			modelVersion: "akari-3.17",
		});
		const client = new VideoClassifierClient({
			baseUrl: "http://ml.test",
			timeoutMs: 1_000,
			localClassifier: local,
			preferLocal: true,
		});

		const prediction = await client.classify({ title: "song" });
		expect(prediction?.source).toBe("local");
		expect(fetchSpy).not.toHaveBeenCalled();
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
		songProbabilityFetch(0.2); // 0.8 song probability
		const service = new DiscoveryFilterService({ modelThreshold: 0.5 });

		const decision = await service.evaluateCandidate(baseInput, classifier());

		expect(decision.action).toBe("accept");
		expect(decision.reason).toBe("model_hit");
		expect(decision.confidence).toBeCloseTo(0.8, 5);
		expect(decision.model?.label).toBe(1);
	});

	test("rejects when P(song) stays under the threshold", async () => {
		songProbabilityFetch(0.9); // 0.1 song probability
		const service = new DiscoveryFilterService({ modelThreshold: 0.5 });

		const decision = await service.evaluateCandidate(baseInput, classifier());

		expect(decision.action).toBe("reject");
		expect(decision.reason).toBe("model_rejected");
	});

	test("blacklist outranks the model", async () => {
		const fetchSpy = mock(async () => new Response("{}", { status: 200 }));
		stubFetch(fetchSpy);
		const service = new DiscoveryFilterService();

		const decision = await service.evaluateCandidate(
			{ ...baseInput, title: "原神 live" },
			classifier()
		);

		expect(decision.action).toBe("reject");
		expect(decision.reason).toBe("blacklist_hit");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test("strong whitelist hit skips the model entirely", async () => {
		const fetchSpy = mock(async () => new Response("{}", { status: 200 }));
		stubFetch(fetchSpy);
		const service = new DiscoveryFilterService();

		const decision = await service.evaluateCandidate(
			{ ...baseInput, title: "洛天依 原创曲", tags: ["vocaloid"] },
			classifier()
		);

		expect(decision.action).toBe("accept");
		expect(decision.reason).toBe("whitelist_hit");
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	test("falls back to rules and flags model_unavailable when the service is down", async () => {
		stubFetch(async () => {
			throw new Error("ECONNREFUSED");
		});
		const service = new DiscoveryFilterService();

		const withSinger = await service.evaluateCandidate(
			{ ...baseInput, title: "洛天依 live" },
			classifier()
		);
		expect(withSinger.action).toBe("accept");
		expect(withSinger.reason).toBe("model_unavailable");

		const withoutSinger = await service.evaluateCandidate(baseInput, classifier());
		expect(withoutSinger.action).toBe("reject");
		expect(withoutSinger.reason).toBe("model_unavailable");
	});

	test("modelEnabled=false keeps rule-only behaviour", async () => {
		const fetchSpy = mock(async () => new Response("{}", { status: 200 }));
		stubFetch(fetchSpy);
		const service = new DiscoveryFilterService({ modelEnabled: false });

		const decision = await service.evaluateCandidate(baseInput, classifier());

		expect(decision.action).toBe("reject");
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
