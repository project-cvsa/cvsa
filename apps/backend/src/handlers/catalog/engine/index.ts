import { Elysia } from "elysia";
import { engineCreateHandler } from "./create";
import { engineUpdateHandler } from "./update";
import { engineDeleteHandler } from "./delete";
import { engineDetailsHandler } from "./details";

export const engineHandler = new Elysia({ name: "engineHandler" })
	.use(engineDetailsHandler)
	.use(engineCreateHandler)
	.use(engineUpdateHandler)
	.use(engineDeleteHandler);
