<<<<<<< HEAD
declare global {
	namespace PrismaJson {
		type LocalizedField = {
			[lang: string]: string;
		};
	}
}

// This file must be a module.
export {};
=======
import type { z } from "zod";
import type { LocalizedField } from "./zodSchema";

declare global {
	namespace PrismaJson {
		type LocalizedField = z.infer<typeof LocalizedField>;
	}
}
>>>>>>> origin/develop
