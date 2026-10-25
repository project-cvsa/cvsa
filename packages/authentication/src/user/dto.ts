import { z } from "zod";
import type { Session, User } from "@cvsa/db";

export interface AuthSessionDto {
	id: string;
	token: string;
	userId: string;
	expiresAt: Date | string;
	createdAt: Date | string;
	updatedAt: Date | string;
	ipAddress?: string | null;
	userAgent?: string | null;
}

export const SignupRequestSchema = z.object({
	username: z.string().min(1).max(100),
	password: z.string().min(8),
	displayName: z.string().min(1).max(100).optional().nullable(),
	email: z.email().optional().nullable(),
	inviteCode: z.string().optional().nullable(),
});

export const SignupUserInfoSchema = z.object({
	id: z.string(),
	username: z.string(),
	displayName: z.string().optional().nullable(),
	email: z.email().optional().nullable(),
	token: z.string(),
});

export const CurrentUserInfoSchema = z.object({
	id: z.string(),
	username: z.string(),
	displayName: z.string().optional().nullable(),
	email: z.email().optional().nullable(),
	createdAt: z.iso.datetime().nullish(),
	image: z.string().optional().nullable(),
	roleId: z.number().nullish(),
	roleName: z.string().nullish(),
});

export const SignupResponseSchema = z.object({
	message: z.string(),
	data: SignupUserInfoSchema,
});

export type SignupRequestDto = z.infer<typeof SignupRequestSchema>;
export type SignupUserInfoDto = z.infer<typeof SignupUserInfoSchema>;
export type CurrentUserInfoDto = z.infer<typeof CurrentUserInfoSchema>;
export type SignupResponseDto = z.infer<typeof SignupResponseSchema>;

export function toBetterAuthHeaders(
	headers: Record<string, string | undefined>
): [string, string][] {
	return Object.entries(headers).filter(
		(entry): entry is [string, string] => entry[1] !== undefined
	);
}

function formatIsoTimestamp(value: unknown): string {
	if (typeof value === "string") return value;
	if (value instanceof Date) return value.toISOString();
	if (
		value &&
		typeof value === "object" &&
		"toISOString" in value &&
		typeof value.toISOString === "function"
	) {
		return value.toISOString();
	}
	if (
		value &&
		typeof value === "object" &&
		"toString" in value &&
		typeof value.toString === "function"
	) {
		return value.toString();
	}
	return String(value);
}

export function userToSignupUserInfoDto(user: User, token: string): SignupUserInfoDto {
	return {
		id: user.id,
		username: user.username,
		displayName: user.name,
		email: user.email,
		token,
	};
}

export const betterAuthToSignupUserInfoDto = userToSignupUserInfoDto;

export function userToCurrentUserInfoDto(user: User, roleName?: string | null): CurrentUserInfoDto {
	return {
		id: user.id,
		username: user.username,
		displayName: user.name,
		email: user.email,
		createdAt: formatIsoTimestamp(user.createdAt),
		image: user.image,
		roleId: user.roleId,
		roleName: roleName ?? null,
	};
}

export const betterAuthToCurrentUserInfoDto = userToCurrentUserInfoDto;

export function toSignUpResponse(data: SignupUserInfoDto): SignupResponseDto {
	return {
		message: "Successfully registered",
		data,
	};
}

export const LoginRequestSchema = z.object({
	// Username or email
	email: z.string().min(1).max(255),
	password: z.string().min(1),
});

export const LoginUserInfoSchema = z.object({
	id: z.string(),
	username: z.string(),
	displayName: z.string().optional().nullable(),
	email: z.email().optional().nullable(),
	token: z.string(),
});

export const LoginResponseSchema = z.object({
	message: z.string(),
	data: LoginUserInfoSchema,
});

export type LoginRequestDto = z.infer<typeof LoginRequestSchema>;
export type LoginUserInfoDto = z.infer<typeof LoginUserInfoSchema>;
export type LoginResponseDto = z.infer<typeof LoginResponseSchema>;

export function userToLoginUserInfoDto(user: User, token: string): LoginUserInfoDto {
	return {
		id: user.id,
		username: user.username,
		displayName: user.name,
		email: user.email,
		token,
	};
}

export const betterAuthToLoginUserInfoDto = userToLoginUserInfoDto;

export function toLoginResponse(data: LoginUserInfoDto): LoginResponseDto {
	return {
		message: "Successfully logged in",
		data,
	};
}

export const LogoutResponseSchema = z.object({
	message: z.string(),
});

export type LogoutResponseDto = z.infer<typeof LogoutResponseSchema>;

export const betterAuthUserToEntity = (user: User): User => user;

export function sessionToDto(session: Session): AuthSessionDto {
	return {
		id: session.id,
		token: session.token,
		userId: session.userId,
		ipAddress: session.ipAddress,
		userAgent: session.userAgent,
		expiresAt: formatIsoTimestamp(session.expiresAt),
		createdAt: formatIsoTimestamp(session.createdAt),
		updatedAt: formatIsoTimestamp(session.updatedAt),
	};
}
