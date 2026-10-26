import Elysia from "elysia";
import { signupHandler } from "./signup";
import { getCurrentUserHandler } from "./currentUser";
import { loginHandler } from "./login";
import { logoutHandler } from "./logout";

export const authHandler = new Elysia()
	.use(signupHandler)
	.use(getCurrentUserHandler)
	.use(loginHandler)
	.use(logoutHandler);
