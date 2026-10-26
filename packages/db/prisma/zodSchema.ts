import { z } from "zod";

export const LocalizedField = z.record(z.string(), z.string());
