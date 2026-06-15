import { Elysia } from "elysia";
import { singerCreateHandler } from "./create";
import { singerUpdateHandler } from "./update";
import { singerDeleteHandler } from "./delete";
import { singerGetHandler } from "./get";
import { singerSearchHandler } from "./search";

export const singerHandler = new Elysia({ name: "singerHandler" })
	.use(singerGetHandler)
	.use(singerCreateHandler)
	.use(singerUpdateHandler)
	.use(singerDeleteHandler)
	.use(singerSearchHandler);
