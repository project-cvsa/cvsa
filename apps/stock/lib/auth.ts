import { SignJWT, jwtVerify } from "jose";

function getMasterPassword(): string {
	const pw = process.env.MASTER_PASSWORD;
	if (!pw) throw new Error("MASTER_PASSWORD environment variable is not set");
	return pw;
}

function getJwtSecret(): Uint8Array {
	return new TextEncoder().encode(process.env.JWT_SECRET ?? getMasterPassword());
}

const TOKEN_EXPIRY = "14d";

export async function signToken(): Promise<string> {
	return new SignJWT({ role: "admin" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime(TOKEN_EXPIRY)
		.sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<boolean> {
	try {
		await jwtVerify(token, getJwtSecret());
		return true;
	} catch {
		return false;
	}
}

export function validatePassword(password: string): boolean {
	return password === getMasterPassword();
}
