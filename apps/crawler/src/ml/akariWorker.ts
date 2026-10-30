import { AkariWorkerRequestSchema, type AkariWorkerReply } from "@cvsa/contracts";
import { LocalAkariClassifier } from "./akari";

const classifier = new LocalAkariClassifier();
process.on("message", (message: unknown) => {
	const parsed = AkariWorkerRequestSchema.safeParse(message);
	if (!parsed.success) return;
	const request = parsed.data;
	const run = async (): Promise<AkariWorkerReply> => {
		try {
			if (request.kind === "health")
				return { id: request.id, kind: "health", health: await classifier.checkHealth() };
			const prediction = await classifier.classify(request.input);
			return {
				id: request.id,
				kind: "classify",
				prediction: prediction
					? { ...prediction, probabilities: [...prediction.probabilities] }
					: null,
			};
		} catch (error) {
			return {
				id: request.id,
				kind: "error",
				message: error instanceof Error ? error.message : String(error),
			};
		}
	};
	void run().then((reply) => process.send?.(reply));
});
process.on("disconnect", () => process.exit(0));
