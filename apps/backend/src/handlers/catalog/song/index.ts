import { Elysia } from "elysia";
import { songCreateHandler } from "./create";
import { songUpdateHandler } from "./update";
import { songDeleteHandler } from "./delete";
import { songDetailsHandler } from "./details";
import { songSearchHandler } from "./search";
import { songLyricsHandler } from "./lyrics";
import { songExternalLinkHandler } from "./externalLink";

export const songHandler = new Elysia({ name: "songHandler" })
	.use(songDetailsHandler)
	.use(songCreateHandler)
	.use(songUpdateHandler)
	.use(songDeleteHandler)
	.use(songSearchHandler)
	.use(songLyricsHandler)
	.use(songExternalLinkHandler);
