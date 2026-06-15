import chalk from "chalk";

export function getLogLevelForRequest(status: number): "error" | "warn" | "info" {
	if (status >= 500) return "error";
	if (status >= 400) return "warn";
	return "info";
}

interface GinLogData {
	method?: string;
	path?: string;
	status?: number;
	latency?: string;
	ip?: string;
}

export function formatGinLog(data: GinLogData = {}): string {
	const parts: string[] = [];

	if (data.method) {
		const m = data.method.toUpperCase();
		let methodBg = chalk.bgBlue.white.bold;
		if (m === "POST") methodBg = chalk.bgCyan.black.bold;
		else if (m === "PUT") methodBg = chalk.bgYellow.black.bold;
		else if (m === "DELETE") methodBg = chalk.bgRed.white.bold;
		else if (m === "PATCH") methodBg = chalk.bgGreen.white.bold;
		parts.push(methodBg(` ${m.padEnd(6)} `));
	}

	if (data.status) {
		let statusColor = chalk.green;
		if (data.status >= 400 && data.status < 500) statusColor = chalk.yellow;
		else if (data.status >= 500) statusColor = chalk.red;
		parts.push(statusColor(data.status.toString().padStart(3)));
	}

	if (data.latency !== undefined) {
		parts.push(chalk.magenta(data.latency.padStart(10)));
	}

	if (data.ip) {
		parts.push(chalk.gray(data.ip.padStart(15)));
	}

	if (data.path) {
		parts.push(`"${data.path}"`);
	}

	return parts.join(" | ");
}
