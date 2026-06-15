import { Elysia } from "elysia";
import { env } from "@cvsa/env";
import v8 from "node:v8";

export const getHeapSnapshotHandler = new Elysia().get("/heap-snapshot", async ({ status }) => {
	if (env.NODE_ENV !== "development") {
		throw status(404);
	}
	const snapshotPath = v8.writeHeapSnapshot();
	return status(200, {
		path: snapshotPath,
	});
});
