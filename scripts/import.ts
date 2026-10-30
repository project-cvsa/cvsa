import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import {
	artist,
	artistRole,
	db,
	singer as singerTable,
	song as songTable,
	songExternalLink,
} from "@cvsa/db";
import { and, eq, isNull } from "drizzle-orm";
import { songWriter, artistWriter, singerWriter, artistRoleWriter } from "@cvsa/catalog";
import { createServicePrincipal } from "@cvsa/authentication";

const systemPrincipal = createServicePrincipal("script:import");

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
	const [existing] = await db
		.select()
		.from(singerTable)
		.where(and(eq(singerTable.name, name), isNull(singerTable.deletedAt)))
		.limit(1);
	if (existing) return existing.id;
	const created = await singerWriter.create(systemPrincipal, { name });
	return created.id;
}

async function resolveArtist(name: string) {
	const [existing] = await db
		.select()
		.from(artist)
		.where(and(eq(artist.name, name), isNull(artist.deletedAt)))
		.limit(1);
	if (existing) return existing.id;
	const created = await artistWriter.create(systemPrincipal, { name });
	return created.id;
}

async function resolveRole(name: string) {
	const [existing] = await db
		.select()
		.from(artistRole)
		.where(and(eq(artistRole.name, name), isNull(artistRole.deletedAt)))
		.limit(1);
	if (existing) return existing.id;
	const created = await artistRoleWriter.create(systemPrincipal, { name });
	return created.id;
}

async function importSinger(data: JsonFile) {
	const result = await singerWriter.create(systemPrincipal, { name: data.name });
	console.log(`singer → ${result.id}`);
}

async function importArtist(data: JsonFile) {
	const result = await artistWriter.create(systemPrincipal, { name: data.name });
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

	const publishedAt = data.publishedAt ? new Date(data.publishedAt).toISOString() : undefined;

	const song = await songWriter.create(systemPrincipal, {
		name: data.name,
		type: data.songType ? (songTypeMap[data.songType] as never) : undefined,
		description: data.description,
		publishedAt,
		performances: performances.length ? performances : undefined,
		creations: creations.length ? creations : undefined,
		lyrics: lyrics.length ? lyrics : undefined,
	});

	if (data.bilibiliID) {
		const updateData: { bilibiliBvid?: string; bilibiliAid?: bigint } = {};
		if (/^BV/i.test(data.bilibiliID)) updateData.bilibiliBvid = data.bilibiliID;
		else if (/^\d+$/.test(data.bilibiliID)) updateData.bilibiliAid = BigInt(data.bilibiliID);
		if (Object.keys(updateData).length) {
			await db.update(songTable).set(updateData).where(eq(songTable.id, song.id));
		}
	}

	if (data.youtubeID) {
		await db.insert(songExternalLink).values({
			songId: song.id,
			url: `https://youtube.com/watch?v=${data.youtubeID}`,
			platform: "YOUTUBE",
			platformId: data.youtubeID,
		});
	}
	if (data.niconicoID) {
		await db.insert(songExternalLink).values({
			songId: song.id,
			url: `https://nicovideo.jp/watch/${data.niconicoID}`,
			platform: "NICONICO",
			platformId: data.niconicoID,
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
		if (file.startsWith("Category:") || file.startsWith("User:")) {
			console.log(`Skipping ${file}`);
			continue;
		}
		try {
			const rawData: JsonFile | JsonFile[] = JSON.parse(
				readFileSync(join(folderPath, file), "utf-8")
			);
			let data: JsonFile;
			if ("length" in rawData) {
				data = rawData[0];
			} else {
				data = rawData;
			}
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
					await importSong(data);
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
