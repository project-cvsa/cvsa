import { sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	json,
	serial,
	text,
	unique,
} from "drizzle-orm/pg-core";
import { managedInstant, temporalInstant } from "../customTypes";
import { auth, meta } from "./schemas";

const id = () => serial("id").primaryKey();
const createdAt = () => temporalInstant("created_at").notNull().default(sql`now()`);
const updatedAt = () => managedInstant("updated_at").notNull();
const deletedAt = () => temporalInstant("deleted_at");

export const role = meta.table(
	"role",
	{
		id: id(),
		name: text("name").notNull(),
		localizedNames: json("localized_names"),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		deletedAt: deletedAt(),
	},
	(table) => [unique("role_name_key").on(table.name)]
);

export const permission = meta.table("permission", {
	id: id(),
	action: text("action").notNull(),
	createdAt: createdAt(),
	updatedAt: updatedAt(),
	deletedAt: deletedAt(),
});

export const rolePermission = meta.table(
	"role_permission",
	{
		id: id(),
		roleId: integer("role_id").notNull(),
		permissionId: integer("permission_id").notNull(),
	},
	(table) => [
		index("role_permission_permission_id_idx_909cec36").on(table.permissionId),
		index("role_permission_role_id_idx_d9467c50").on(table.roleId),
		foreignKey({
			name: "role_permission_permission_id_fkey",
			columns: [table.permissionId],
			foreignColumns: [permission.id],
		}),
		foreignKey({
			name: "role_permission_role_id_fkey",
			columns: [table.roleId],
			foreignColumns: [role.id],
		}),
	]
);

/**
 * Better Auth's core identity tables.
 *
 * These keep Better Auth's camelCase column names (`userId`, `expiresAt`, ...)
 * rather than the project-wide snake_case convention: the auth client writes
 * them directly and renaming would break its migrations.
 */
export const user = auth.table(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name"),
		username: text("username").notNull(),
		displayUsername: text("display_username").notNull(),
		email: text("email"),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		roleId: integer("role_id"),
		reputation: integer("reputation").notNull().default(0),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
	},
	(table) => [
		unique("user_username_key").on(table.username),
		unique("user_display_username_key").on(table.displayUsername),
		unique("user_email_key").on(table.email),
		index("user_role_id_idx_d9467c50").on(table.roleId),
		foreignKey({
			name: "user_role_id_fkey",
			columns: [table.roleId],
			foreignColumns: [role.id],
		}),
	]
);

export const account = auth.table(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("accountId").notNull(),
		providerId: text("providerId").notNull(),
		userId: text("userId").notNull(),
		accessToken: text("accessToken"),
		refreshToken: text("refreshToken"),
		idToken: text("idToken"),
		accessTokenExpiresAt: temporalInstant("accessTokenExpiresAt"),
		refreshTokenExpiresAt: temporalInstant("refreshTokenExpiresAt"),
		scope: text("scope"),
		password: text("password"),
		createdAt: temporalInstant("createdAt").notNull().default(sql`now()`),
		updatedAt: managedInstant("updatedAt").notNull(),
	},
	(table) => [
		index("account_userId_idx_a489d58a").on(table.userId),
		foreignKey({
			name: "account_userId_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}).onDelete("cascade"),
	]
);

export const session = auth.table(
	"session",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull(),
		userId: text("user_id").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		expiresAt: temporalInstant("expiresAt").notNull(),
		createdAt: temporalInstant("created_at").notNull().default(sql`now()`),
		updatedAt: managedInstant("updated_at").notNull(),
	},
	(table) => [
		unique("session_token_key").on(table.token),
		index("session_user_id_idx_6c952402").on(table.userId),
		foreignKey({
			name: "session_user_id_fkey",
			columns: [table.userId],
			foreignColumns: [user.id],
		}),
	]
);

export const verification = auth.table(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: temporalInstant("expiresAt").notNull(),
		createdAt: temporalInstant("createdAt").notNull().default(sql`now()`),
		updatedAt: managedInstant("updatedAt").notNull(),
	},
	(table) => [index("verification_identifier_idx_79a0dbb3").on(table.identifier)]
);

export type Role = typeof role.$inferSelect;
export type RoleInsert = typeof role.$inferInsert;
export type Permission = typeof permission.$inferSelect;
export type PermissionInsert = typeof permission.$inferInsert;
export type RolePermission = typeof rolePermission.$inferSelect;
export type RolePermissionInsert = typeof rolePermission.$inferInsert;
export type User = typeof user.$inferSelect;
export type UserInsert = typeof user.$inferInsert;
export type Account = typeof account.$inferSelect;
export type AccountInsert = typeof account.$inferInsert;
export type Session = typeof session.$inferSelect;
export type SessionInsert = typeof session.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type VerificationInsert = typeof verification.$inferInsert;
