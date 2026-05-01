import { NextResponse } from "next/server";
import { signToken, validatePassword } from "@/lib/auth";

export async function POST(request: Request) {
	try {
		const { password } = (await request.json()) as { password?: string };

		if (!password || !validatePassword(password)) {
			return NextResponse.json({ error: "Invalid password" }, { status: 401 });
		}

		const token = await signToken();
		return NextResponse.json({ token });
	} catch {
		return NextResponse.json({ error: "Authentication failed" }, { status: 500 });
	}
}
