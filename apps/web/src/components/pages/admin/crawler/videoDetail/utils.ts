export interface StaffMember {
	mid: number;
	title: string;
	name: string;
	face: string;
}

export interface VideoPart {
	page: number;
	part: string;
	duration: number;
	cid: number;
}

export function parseTags(tags: unknown): string[] {
	if (!tags) return [];
	if (Array.isArray(tags)) {
		return tags.filter((t): t is string => typeof t === "string");
	}
	if (typeof tags === "string") {
		try {
			const parsed: unknown = JSON.parse(tags);
			if (Array.isArray(parsed)) {
				return parsed.filter((t): t is string => typeof t === "string");
			}
		} catch {
			return tags
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean);
		}
	}
	return [];
}

export function parseStaff(staff: unknown): StaffMember[] {
	if (!staff || !Array.isArray(staff)) return [];
	const result: StaffMember[] = [];
	for (const item of staff) {
		if (typeof item === "object" && item !== null) {
			const record = item as Record<string, unknown>;
			if (typeof record.name === "string" && typeof record.title === "string") {
				result.push({
					mid: typeof record.mid === "number" ? record.mid : 0,
					title: record.title,
					name: record.name,
					face: typeof record.face === "string" ? record.face : "",
				});
			}
		}
	}
	return result;
}

export function parsePages(pages: unknown): VideoPart[] {
	if (!pages || !Array.isArray(pages)) return [];
	const result: VideoPart[] = [];
	for (const item of pages) {
		if (typeof item === "object" && item !== null) {
			const record = item as Record<string, unknown>;
			result.push({
				page: typeof record.page === "number" ? record.page : result.length + 1,
				part: typeof record.part === "string" ? record.part : `P${result.length + 1}`,
				duration: typeof record.duration === "number" ? record.duration : 0,
				cid: typeof record.cid === "number" ? record.cid : 0,
			});
		}
	}
	return result;
}

export function parseDimension(dim: unknown): { width: number; height: number } | null {
	if (!dim || typeof dim !== "object") return null;
	const record = dim as Record<string, unknown>;
	if (typeof record.width === "number" && typeof record.height === "number") {
		return { width: record.width, height: record.height };
	}
	return null;
}

export function parseHonors(honorReply: unknown): string[] {
	if (!honorReply || typeof honorReply !== "object") return [];
	const record = honorReply as Record<string, unknown>;
	const honor = record.honor;
	if (!Array.isArray(honor)) return [];
	const result: string[] = [];
	for (const item of honor) {
		if (typeof item === "object" && item !== null) {
			const h = item as Record<string, unknown>;
			if (typeof h.desc === "string") {
				result.push(h.desc);
			}
		}
	}
	return result;
}

export function formatSecondsToTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
	const totalSec = Math.floor(seconds);
	const hours = Math.floor(totalSec / 3600);
	const mins = Math.floor((totalSec % 3600) / 60);
	const secs = totalSec % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	if (hours > 0) {
		return `${hours}:${pad(mins)}:${pad(secs)}`;
	}
	return `${pad(mins)}:${pad(secs)}`;
}
