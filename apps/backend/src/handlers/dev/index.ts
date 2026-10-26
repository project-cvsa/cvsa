import { Elysia } from "elysia";
import { getHeapSnapshotHandler } from "./snapshot";
import { gcHandler } from "./gc";

export const devHandler = new Elysia({ name: "devHandler" })
	.use(getHeapSnapshotHandler)
	.use(gcHandler);
