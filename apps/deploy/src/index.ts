import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { DeployRequestSchema } from "@cvsa/contracts";
import { DeploymentService } from "./deploymentService";
const service = new DeploymentService(resolve(import.meta.dir, "../../.."));
await service.initialize();
const secret = process.env.DEPLOY_WEBHOOK_SECRET ?? "";
Bun.serve({
	hostname: process.env.DEPLOY_HOST ?? "127.0.0.1",
	port: Number(process.env.DEPLOY_PORT ?? 9420),
	async fetch(req) {
		const path = new URL(req.url).pathname.replace(/^\/_deploy/, "") || "/";
		if (path === "/health") return Response.json({ status: "ok" });
		const auth = Buffer.from(req.headers.get("authorization") ?? "");
		const expected = Buffer.from(`Bearer ${secret}`);
		if (!secret || auth.length !== expected.length || !timingSafeEqual(auth, expected))
			return new Response("Unauthorized", { status: 401 });
		if (req.method === "GET" && path === "/status") return Response.json(service.status);
		if (req.method === "POST" && (path === "/deploy" || path === "/")) {
			const text = await req.text();
			if (text.length > 16384) return new Response("Payload too large", { status: 413 });
			let payload: unknown;
			try {
				payload = JSON.parse(text);
			} catch {
				return new Response("Invalid JSON", { status: 400 });
			}
			const result = DeployRequestSchema.safeParse(payload);
			if (!result.success) return new Response("Invalid deployment request", { status: 400 });
			const state = service.start(result.data);
			return Response.json(state ?? { error: "Deployment in progress" }, {
				status: state ? 202 : 409,
			});
		}
		return new Response("Not found", { status: 404 });
	},
});
