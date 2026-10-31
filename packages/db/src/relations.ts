import { defineRelations } from "drizzle-orm/relations";
import * as schema from "./schema";

/**
 * Relational graph used by the relational query builder.
 *
 * Only the shapes the catalog actually traverses are declared: a song's cast
 * (performances → singer/engine), its credits (creations → artist/role), its
 * lyrics and its external links.
 */
export const relations = defineRelations(schema, (r) => ({
	song: {
		performances: r.many.performance({ from: r.song.id, to: r.performance.songId }),
		creations: r.many.creation({ from: r.song.id, to: r.creation.songId }),
		lyrics: r.many.lyrics({ from: r.song.id, to: r.lyrics.songId }),
		externalLinks: r.many.songExternalLink({
			from: r.song.id,
			to: r.songExternalLink.songId,
		}),
	},
	performance: {
		song: r.one.song({ from: r.performance.songId, to: r.song.id }),
		singer: r.one.singer({ from: r.performance.singerId, to: r.singer.id }),
		voicebank: r.one.voicebank({ from: r.performance.voicebankId, to: r.voicebank.id }),
		svsEngine: r.one.svsEngine({ from: r.performance.svsEngineId, to: r.svsEngine.id }),
		svsEngineVersion: r.one.svsEngineVersion({
			from: r.performance.svsEngineVersionId,
			to: r.svsEngineVersion.id,
		}),
	},
	creation: {
		song: r.one.song({ from: r.creation.songId, to: r.song.id }),
		artist: r.one.artist({ from: r.creation.artistId, to: r.artist.id }),
		role: r.one.artistRole({ from: r.creation.artistRoleId, to: r.artistRole.id }),
	},
	lyrics: {
		song: r.one.song({ from: r.lyrics.songId, to: r.song.id }),
	},
	songExternalLink: {
		song: r.one.song({ from: r.songExternalLink.songId, to: r.song.id }),
	},
}));
