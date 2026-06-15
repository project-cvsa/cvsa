import Elysia, { ElysiaFile } from "elysia";
<<<<<<< HEAD

const encoder = new TextEncoder();

export const onAfterHandler = new Elysia().onAfterHandle(
	{ as: "global" },
	({ responseValue, request }) => {
=======
import { getTraceId } from "@/common/trace";

const encoder = new TextEncoder();

export const onAfterHandler = new Elysia()
	.onBeforeHandle({ as: "global" }, ({ set }) => {
		const traceId = getTraceId();
		if (traceId) {
			set.headers["X-Trace-ID"] = traceId;
		}
	})
	.onAfterHandle({ as: "global" }, ({ responseValue, request }) => {
>>>>>>> origin/develop
		const contentType = request.headers.get("Content-Type") || "";
		const accept = request.headers.get("Accept") || "";
		const secFetchMode = request.headers.get("Sec-Fetch-Mode");
		const requestJson = contentType.includes("application/json");
		const isBrowser =
			!requestJson && (accept.includes("text/html") || secFetchMode === "navigate");
		const isObject = typeof responseValue === "object";
		if (!isObject) {
			return;
		}
		if (responseValue instanceof ElysiaFile || responseValue instanceof Response) {
			return;
		}
<<<<<<< HEAD
		const realResponse = responseValue as { code?: number; response?: unknown };
		if (realResponse.code) {
			const text = isBrowser
				? JSON.stringify(realResponse.response, null, 2)
				: JSON.stringify(realResponse.response);
=======
		if (responseValue === null) {
			return;
		}
		const realResponse = responseValue as { code?: number; response?: unknown };

		if (realResponse.code && isBrowser) {
			const text = JSON.stringify(realResponse.response, null, 4);
>>>>>>> origin/develop
			return new Response(encoder.encode(text), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
				},
				status: realResponse.code,
			});
		}
<<<<<<< HEAD
		const text = isBrowser
			? JSON.stringify(realResponse, null, 2)
			: JSON.stringify(realResponse);
		return new Response(encoder.encode(text), {
			headers: {
				"Content-Type": "application/json; charset=utf-8",
			},
		});
	}
);
=======
		if (isBrowser) {
			const text = JSON.stringify(realResponse, null, 4);

			return new Response(encoder.encode(text), {
				headers: {
					"Content-Type": "application/json; charset=utf-8",
				},
			});
		}
	});
>>>>>>> origin/develop
