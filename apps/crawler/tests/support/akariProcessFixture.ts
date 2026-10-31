import { AkariWorkerRequestSchema, type AkariWorkerReply } from "@cvsa/contracts";
process.on("message", (message: unknown) => {
	const request = AkariWorkerRequestSchema.parse(message);
	if (request.kind === "classify" && request.input.title === "hang") {
		while (true) {}
	}
	const reply: AkariWorkerReply =
		request.kind === "health"
			? { id: request.id, kind: "health", health: { status: "healthy", modelLoaded: true } }
			: {
					id: request.id,
					kind: "classify",
					prediction: {
						label: 1,
						probabilities: [0.1, 0.9],
						songProbability: 0.9,
						isAccepted: true,
						modelVersion: "fixture",
					},
				};
	process.send?.(reply);
});
