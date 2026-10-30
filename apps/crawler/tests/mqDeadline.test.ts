import { expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { createCrawlerMq } from "../src/crawler/shared/mq";

test("unresponsive Redis cannot hold connect or enqueue operations indefinitely", async () => {
	const sockets = new Set<Socket>();
	const server = createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("Missing fixture port");
	const mq = createCrawlerMq(`redis://127.0.0.1:${address.port}`);
	mq.setOperationTimeout?.(100);
	try {
		await expect(mq.connect()).rejects.toThrow("timed out");
		const queue = mq.createQueue<{ value: number }>("deadline");
		await expect(queue.add("blocked", { value: 1 })).rejects.toThrow("timed out");
	} finally {
		for (const socket of sockets) socket.destroy();
		await mq.close();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});
