import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { prisma } from "@cvsa/db";
import { songService, artistService, singerService, artistRoleService } from "@cvsa/core";

interface JsonFile {
	type: "song" | "album" | "series" | "singer" | "artist" | "others";
	name?: string;
	songType?: string;
	singers?: { name: string }[];
	artists?: { name: string; role: string }[];
	lyricsText?: string;
	producer?: string[];
	bilibiliID?: string;
	youtubeID?: string;
	niconicoID?: string;
	description?: string;
	uploader?: string;
	publishedAt?: string;
	lyricsTTML?: string;
}

const songTypeMap: Record<string, string> = {
	original: "ORIGINAL",
	cover: "COVER",
	retune: "RETUNE",
	contrafactum: "CONTRAFACTUM",
	translyrics: "TRANSLYRICS",
	remix: "REMIX",
	remaster: "REMASTER",
	mashup: "MASHUP",
	instrumental: "INSTRUMENTAL",
	others: "OTHERS",
};

async function resolveSinger(name: string) {
	const existing = await prisma.singer.findFirst({ where: { name, deletedAt: null } });
	if (existing) return existing.id;
	const created = await singerService.create({ name });
	return created.id;
}

async function resolveArtist(name: string) {
	const existing = await prisma.artist.findFirst({ where: { name, deletedAt: null } });
	if (existing) return existing.id;
	const created = await artistService.create({ name });
	return created.id;
}

async function resolveRole(name: string) {
	const existing = await prisma.artistRole.findFirst({ where: { name, deletedAt: null } });
	if (existing) return existing.id;
	const created = await artistRoleService.create({ name });
	return created.id;
}

async function importSinger(data: JsonFile) {
	const result = await singerService.create({ name: data.name });
	console.log(`singer → ${result.id}`);
}

async function importArtist(data: JsonFile) {
	const result = await artistService.create({ name: data.name });
	console.log(`artist → ${result.id}`);
}

async function importSong(data: JsonFile) {
	const performances: { singerId: number }[] = [];
	if (data.singers) {
		for (const s of data.singers) {
			performances.push({ singerId: await resolveSinger(s.name) });
		}
	}

	const creations: { artistId: number; roleId: number }[] = [];
	if (data.artists) {
		for (const a of data.artists) {
			creations.push({
				artistId: await resolveArtist(a.name),
				roleId: await resolveRole(a.role),
			});
		}
	}
	if (data.producer) {
		const roleId = await resolveRole("Producer");
		for (const name of data.producer) {
			creations.push({ artistId: await resolveArtist(name), roleId });
		}
	}
	if (data.uploader) {
		const roleId = await resolveRole("Uploader");
		creations.push({ artistId: await resolveArtist(data.uploader), roleId });
	}

	const lyrics: { plainText?: string; ttml?: string; language: string }[] = [];
	if (data.lyricsText) lyrics.push({ plainText: data.lyricsText, language: "zh" });
	if (data.lyricsTTML) {
		const existing = lyrics.find((l) => l.language === "zh" && l.plainText);
		if (existing) existing.ttml = data.lyricsTTML;
		else lyrics.push({ ttml: data.lyricsTTML, language: "zh" });
	}

	const song = await songService.create({
		name: data.name,
		type: data.songType ? (songTypeMap[data.songType] as never) : undefined,
		description: data.description,
		publishedAt: new Date(data.publishedAt ?? "").toISOString(),
		performances: performances.length ? performances : undefined,
		creations: creations.length ? creations : undefined,
		lyrics: lyrics.length ? lyrics : undefined,
	});

	if (data.bilibiliID) {
		const updateData: Record<string, unknown> = {};
		if (/^BV/i.test(data.bilibiliID)) updateData.bilibiliBvid = data.bilibiliID;
		else if (/^\d+$/.test(data.bilibiliID)) updateData.bilibiliAid = BigInt(data.bilibiliID);
		if (Object.keys(updateData).length) {
			await prisma.song.update({ where: { id: song.id }, data: updateData });
		}
	}

	if (data.youtubeID) {
		await prisma.externalLink.create({
			data: {
				songId: song.id,
				url: `https://youtube.com/watch?v=${data.youtubeID}`,
				platform: "YOUTUBE",
				platformId: data.youtubeID,
			},
		});
	}
	if (data.niconicoID) {
		await prisma.externalLink.create({
			data: {
				songId: song.id,
				url: `https://nicovideo.jp/watch/${data.niconicoID}`,
				platform: "NICONICO",
				platformId: data.niconicoID,
			},
		});
	}

	console.log(`song → ${song.id}`);
}

async function main() {
	const folder = process.argv[2];
	if (!folder) {
		console.error("Usage: bun run scripts/import.ts <folder>");
		process.exit(1);
	}

	const folderPath = resolve(folder);
	if (!existsSync(folderPath)) {
		console.error("not found");
		process.exit(1);
	}

	const files = readdirSync(folderPath)
		.filter((f) => extname(f) === ".json")
		.sort();

	for (const file of files) {
		try {
			const data: JsonFile = JSON.parse(readFileSync(join(folderPath, file), "utf-8"));
			switch (data.type) {
				case "singer":
					await importSinger(data);
					break;
				case "artist":
					await importArtist(data);
					break;
				case "song":
					await importSong(data);
					break;
				default:
					await importSinger(data);
					console.warn(`unkown type ${data.type} for file ${file}`);
			}
		} catch (e) {
			console.error("error at: ", file);
			console.error(e);
		}
	}
}

main()
	.catch((err) => {
		console.error("fatal:", err);
		process.exit(1);
	})
	.finally(() => {
		console.log("completed");
		process.exit(0);
	});
