import Elysia from "elysia";
import { signupHandler } from "./signup";
import { getCurrentUserHandler } from "./currentUser";

export const authHandler = new Elysia()
    .use(signupHandler)
    .use(getCurrentUserHandler);
