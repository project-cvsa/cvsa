import type { z } from "zod";
import type { LocalizedField } from "./zodSchema";

declare global {
	namespace PrismaJson {
		type LocalizedField = z.infer<typeof LocalizedField>;
	}
}
