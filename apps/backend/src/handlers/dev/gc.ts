import { Elysia } from "elysia";
import { env } from "@cvsa/env";

export const gcHandler = new Elysia().get("/gc-result", async ({ status }) => {
	if (env.NODE_ENV !== "development") {
		throw status(404);
	}
	Bun.gc();
	return status(200, {
		success: true,
	});
});
