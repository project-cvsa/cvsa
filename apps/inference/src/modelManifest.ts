export const AKARI_MODEL_MANIFEST = {
	modelVersion: "akari-3.17",
	embedding: {
		sha256: "d1be4da1cd314e79b6bcb62a16c2a75013e2567750964a1db98e02c8f46a95b4",
		inputNames: ["input_ids", "offsets"],
		outputName: "embeddings",
		featureWidth: 1024,
		featureRows: 3,
	},
	classifier: {
		sha256: "5f7f3c7f18378516cd15652228e3673b0697130082caeeb38d6d4a368130d054",
		inputName: "channel_features",
		outputName: "logits",
		featureWidth: 1024,
		featureRows: 3,
		labelCount: 3,
		rejectLabel: 0,
	},
	tokenizer: {
		modelId: "alikia2x/jina-embedding-v3-m2v-1024",
		assetVersion: "sha256:3a56def25aa40facc030ea8b0b87f3688e4b3c39eb8b45d5702b3a1300fe2a20",
		files: {
			"tokenizer.json": "3a56def25aa40facc030ea8b0b87f3688e4b3c39eb8b45d5702b3a1300fe2a20",
			"tokenizer_config.json":
				"7c3b3d9a988036fb400aa8f50634d74848da739fcd531d376ad953ddfb86cfbe",
		},
	},
	maxInputTokens: 8192,
};
