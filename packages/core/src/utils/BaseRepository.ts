import { transformPrismaResult, type Serialized } from "@cvsa/db";
import { traceTask } from "@cvsa/observability";

export abstract class BaseRepository {
	protected async query<T>(name: string, fn: () => Promise<T>): Promise<Serialized<T>> {
		return traceTask(name, async () => transformPrismaResult(await fn()));
	}
}
