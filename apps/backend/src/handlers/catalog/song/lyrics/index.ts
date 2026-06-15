import { Elysia } from "elysia";
import { songLyricsListHandler } from "./list";
import { songLyricsGetHandler } from "./get";
import { songLyricsCreateHandler } from "./create";
import { songLyricsUpdateHandler } from "./update";
import { songLyricsDeleteHandler } from "./delete";

export const songLyricsHandler = new Elysia({ name: "songLyricsHandler" })
	.use(songLyricsListHandler)
	.use(songLyricsGetHandler)
	.use(songLyricsCreateHandler)
	.use(songLyricsUpdateHandler)
	.use(songLyricsDeleteHandler);
