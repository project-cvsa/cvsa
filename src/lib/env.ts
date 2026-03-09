import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.url(),
		NODE_ENV: z.enum(["development", "test", "production"]).optional(),
	},

	runtimeEnv: import.meta.env,

	emptyStringAsUndefined: true,
});
