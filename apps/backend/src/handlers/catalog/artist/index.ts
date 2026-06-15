import { Elysia } from "elysia";
import { artistCreateHandler } from "./create";
import { artistUpdateHandler } from "./update";
import { artistDeleteHandler } from "./delete";
import { artistDetailsHandler } from "./get";
import { artistSearchHandler } from "./search";

export const artistHandler = new Elysia({ name: "artistHandler" })
	.use(artistDetailsHandler)
	.use(artistCreateHandler)
	.use(artistUpdateHandler)
	.use(artistDeleteHandler)
	.use(artistSearchHandler);
