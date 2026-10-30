import { expect, test } from "bun:test";
import { createAxiosNetworkTransport } from "../src/adapter";

test("aborts a hanging HTTP response and completes attempt accounting", async () => {
	const server = Bun.serve({
		port: 0,
		fetch: () => new Promise<Response>(() => {}),
	});
	let completed = 0;
	try {
		const result = await createAxiosNetworkTransport().execute(
			{ url: server.url.toString(), timeoutMs: 30 },
			undefined,
			{
				started() {},
				completed() {
					completed += 1;
				},
			}
		);
		expect(result.errorCode).toBe("REQUEST_TIMEOUT");
		expect(completed).toBe(1);
	} finally {
		await server.stop(true);
	}
});
