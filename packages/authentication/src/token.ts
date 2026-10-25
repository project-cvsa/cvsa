import { randomBytes } from "node:crypto";

export function generateSessionToken(): string {
	return randomBytes(32).toString("hex");
}
