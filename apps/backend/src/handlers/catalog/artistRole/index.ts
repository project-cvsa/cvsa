import { Elysia } from "elysia";
import { artistRoleCreateHandler } from "./create";
import { artistRoleUpdateHandler } from "./update";
import { artistRoleDeleteHandler } from "./delete";
import { artistRoleDetailsHandler } from "./get";
import { artistRoleSearchHandler } from "./search";

export const artistRoleHandler = new Elysia({ name: "artistRoleHandler" })
	.use(artistRoleDetailsHandler)
	.use(artistRoleCreateHandler)
	.use(artistRoleUpdateHandler)
	.use(artistRoleDeleteHandler)
	.use(artistRoleSearchHandler);
