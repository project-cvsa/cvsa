import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { app } from "../src/";

const api = treaty(app);

describe("Embedding E2E Tests - POST /embeddings", () => {
	test("should generate embeddings", async () => {
		const payload = {
			texts: ["Hello"],
		};

		const { data, status } = await api.embeddings.post(payload);

		expect(status).toBe(200);
		expect(data?.embeddings[0]).toHaveLength(256);
	});
});
