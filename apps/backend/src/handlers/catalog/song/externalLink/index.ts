import { Elysia } from "elysia";
import { songExternalLinkCreateHandler } from "./create";
import { songExternalLinkUpdateHandler } from "./update";
import { songExternalLinkDeleteHandler } from "./delete";

export const songExternalLinkHandler = new Elysia({ name: "songExternalLinkHandler" })
	.use(songExternalLinkCreateHandler)
	.use(songExternalLinkUpdateHandler)
	.use(songExternalLinkDeleteHandler);
