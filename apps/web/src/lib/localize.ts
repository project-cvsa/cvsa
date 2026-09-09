import type { SongLyricsResponseDto } from "@cvsa/core";

export interface Localizable {
	name?: string | null;
	language: string;
	localizedNames?: Record<string, string> | null;
}

export function localizedName(entity: Localizable, language: string): string {
	const baseLanguage = language.split("-")[0];
	if (language === entity.language || baseLanguage === entity.language) {
		return entity.name ?? "";
	}
	return (
		entity.localizedNames?.[language] ??
		entity.localizedNames?.[baseLanguage] ??
		entity.name ??
		""
	);
}

export function formatDuration(seconds?: number | null): string {
	if (seconds === null || seconds === undefined) {
		return "—";
	}
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;
	const pad = (value: number) => String(value).padStart(2, "0");
	return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

export function formatDateTime(iso?: string | null): string {
	if (!iso) {
		return "—";
	}
	const date = new Date(iso);
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function pickLyric(
	lyrics: SongLyricsResponseDto[],
	language: string
): SongLyricsResponseDto | undefined {
	const baseLanguage = language.split("-")[0];
	return (
		lyrics.find((lyric) => lyric.language === language) ??
		lyrics.find((lyric) => lyric.language === baseLanguage) ??
		lyrics[0]
	);
}
