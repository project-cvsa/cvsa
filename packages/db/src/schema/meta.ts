import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, json, serial, text } from "drizzle-orm/pg-core";
import { managedInstant, temporalInstant } from "../customTypes";
import type { ChangeType, OutboxStatus } from "./enums";
import { user } from "./identity";
import { meta, platform } from "./schemas";

const createdAt = () => temporalInstant("created_at").notNull().default(sql`now()`);

export const history = meta.table(
	"history",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id").notNull(),
		table: text("table").notNull(),
		objectId: integer("object_id").notNull(),
		type: text("type").$type<ChangeType>().notNull(),
		comment: text("comment"),
		old: json("old"),
		new: json("new"),
		createdAt: createdAt(),
	},
	(table) => [
		index("history_user_id_idx_6c952402").on(table.userId),
		check(
			"history_type_check_d6a58d8c",
			sql`"type" = ANY (ARRAY['CREATE'::text, 'UPDATE'::text, 'DELETE'::text, 'RESTORE'::text])`
		),
		foreignKey({
			name: "history_user_id_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}),
	]
);

export const outbox = meta.table(
	"outbox",
	{
		id: serial("id").primaryKey(),
		aggregateType: text("aggregate_type").notNull(),
		aggregateId: integer("aggregate_id").notNull(),
		eventType: text("event_type").notNull(),
		payload: json("payload"),
		status: text("status").$type<OutboxStatus>().notNull().default("PENDING"),
		retryCount: integer("retry_count").notNull().default(0),
		lastError: text("last_error"),
		nextRetryAt: temporalInstant("next_retry_at"),
		createdAt: createdAt(),
		processedAt: temporalInstant("processed_at"),
	},
	(table) => [
		index("outbox_status_next_retry_at_idx_e5c71f91").on(table.status, table.nextRetryAt),
		check(
			"outbox_status_check_8a5bce80",
			sql`"status" = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'PROCESSED'::text, 'FAILED'::text])`
		),
	]
);

export const file = platform.table(
	"file",
	{
		id: text("id").primaryKey(),
		originalName: text("original_name"),
		path: text("path"),
		userId: text("user_id").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("file_user_id_idx_6c952402").on(table.userId),
		foreignKey({
			name: "file_user_id_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}),
	]
);

export const post = platform.table(
	"post",
	{
		id: text("id").primaryKey(),
		text: text("text"),
		userId: text("user_id").notNull(),
		createdAt: createdAt(),
		updatedAt: managedInstant("updated_at").notNull(),
		deletedAt: temporalInstant("deleted_at"),
	},
	(table) => [
		index("post_user_id_idx_6c952402").on(table.userId),
		foreignKey({
			name: "post_user_id_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}),
	]
);

export const reputationHistory = platform.table(
	"reputation_history",
	{
		id: serial("id").primaryKey(),
		userId: text("user_id").notNull(),
		actionType: text("action_type").notNull(),
		points: integer("points").notNull(),
		sourceType: integer("source_type").notNull(),
		sourceId: integer("source_id").notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		index("reputation_history_user_id_idx_6c952402").on(table.userId),
		foreignKey({
			name: "reputation_history_user_id_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}),
	]
);

export type History = typeof history.$inferSelect;
export type HistoryInsert = typeof history.$inferInsert;
export type Outbox = typeof outbox.$inferSelect;
export type OutboxInsert = typeof outbox.$inferInsert;
export type File = typeof file.$inferSelect;
export type FileInsert = typeof file.$inferInsert;
export type Post = typeof post.$inferSelect;
export type PostInsert = typeof post.$inferInsert;
export type ReputationHistory = typeof reputationHistory.$inferSelect;
export type ReputationHistoryInsert = typeof reputationHistory.$inferInsert;
