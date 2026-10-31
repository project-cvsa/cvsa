import { describe, expect, test } from "bun:test";
import pino from "pino";
import { LOG_REDACT_PATHS, createApplicationLogger, withLogContext } from "../src";

interface CapturedRecord {
	level: number;
	msg: string;
	[key: string]: unknown;
}

/** pino destination that records every serialized line. */
function createCapture(): {
	records: CapturedRecord[];
	destination: { write(chunk: string): void };
} {
	const records: CapturedRecord[] = [];
	return {
		records,
		destination: {
			write(chunk: string): void {
				for (const line of chunk.split("\n")) {
					if (line.trim() === "") continue;
					records.push(JSON.parse(line) as CapturedRecord);
				}
			},
		},
	};
}

function createLoggerWithRedaction() {
	const capture = createCapture();
	const logger = createApplicationLogger(
		pino({ redact: [...LOG_REDACT_PATHS] }, capture.destination),
		undefined
	);
	return { capture, logger };
}

describe("createApplicationLogger", () => {
	test("emits structured attributes instead of dropping them", () => {
		const { capture, logger } = createLoggerWithRedaction();

		logger.info("Network request completed", {
			component: "network-scheduler",
			adapterId: "proxy-a",
			requestType: "bilibili-api",
			errorCode: "HTTP_429",
			durationMs: 12,
			attempts: 2,
		});

		expect(capture.records).toHaveLength(1);
		expect(capture.records[0]).toMatchObject({
			msg: "Network request completed",
			component: "network-scheduler",
			adapterId: "proxy-a",
			requestType: "bilibili-api",
			errorCode: "HTTP_429",
			durationMs: 12,
			attempts: 2,
		});
	});

	test("records errors under the pino error serializer", () => {
		const { capture, logger } = createLoggerWithRedaction();

		logger.error("Crawler runtime failed to start", {
			component: "crawler-runtime",
			error: new Error("boom"),
		});

		expect(capture.records[0]?.component).toBe("crawler-runtime");
		expect(capture.records[0]?.err).toMatchObject({ message: "boom" });
	});

	test("scrubs proxy credentials from attributes", () => {
		const { capture, logger } = createLoggerWithRedaction();

		logger.info("Network runtime configuration rejected", {
			component: "network-config",
			adapter: { id: "proxy-a", proxyUrl: "http://bob:hunter2@proxy.example.com:8080" },
		});

		const serialized = JSON.stringify(capture.records[0]);
		expect(serialized).not.toContain("hunter2");
		expect(capture.records[0]?.adapter).toEqual({
			id: "proxy-a",
			proxyUrl: "[Redacted]",
		});
	});

	test("scrubs credentials embedded in the message", () => {
		const { capture, logger } = createLoggerWithRedaction();

		logger.warn("Connecting to redis at redis://:hunter2@127.0.0.1:6379");

		expect(capture.records[0]?.msg).toBe(
			"Connecting to redis at redis://***:***@127.0.0.1:6379"
		);
		expect(JSON.stringify(capture.records[0])).not.toContain("hunter2");
	});

	test("leaves messages and attributes without credentials intact", () => {
		const { capture, logger } = createLoggerWithRedaction();

		logger.info("Crawler runtime started", { component: "crawler-runtime" });

		expect(capture.records[0]).toMatchObject({
			msg: "Crawler runtime started",
			component: "crawler-runtime",
		});
	});

	test("automatically injects ambient log context across deep async calls without manual arguments", async () => {
		const { capture, logger } = createLoggerWithRedaction();

		async function deeplyNestedWork() {
			await new Promise((resolve) => setTimeout(resolve, 5));
			logger.info("Deep operation finished");
		}

		await withLogContext(
			{
				jobId: "batch-789",
				queue: "crawler-discovery",
				worker: "discovery-worker",
			},
			async () => {
				logger.info("Starting batch job");
				await deeplyNestedWork();
			}
		);

		expect(capture.records).toHaveLength(2);
		expect(capture.records[0]).toMatchObject({
			msg: "Starting batch job",
			jobId: "batch-789",
			queue: "crawler-discovery",
			worker: "discovery-worker",
		});
		expect(capture.records[1]).toMatchObject({
			msg: "Deep operation finished",
			jobId: "batch-789",
			queue: "crawler-discovery",
			worker: "discovery-worker",
		});
	});
});
