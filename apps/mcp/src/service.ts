import { getRedis } from "./redis";
import { getSql } from "./sql";

export async function blacklistVideo(aid: number) {
	const sql = getSql();
	await sql`
        INSERT INTO public.video_blacklist (aid)
        SELECT ${aid}
        WHERE NOT EXISTS (
            SELECT 1 FROM public.video_blacklist WHERE aid = ${aid}
        )
    `;
	const redis = getRedis();
	await redis.del("cvsa:stock:eta:top1000");
}
