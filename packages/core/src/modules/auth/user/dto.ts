import { z } from "zod";
import { getRandomId } from "@cvsa/core/internal";
import type { User } from "@cvsa/db";
import type { auth } from "@cvsa/core/internal";

type BetterAuthUser = Exclude<Awaited<ReturnType<typeof auth.api.getSession>>, null>["user"];

type BetterAuthSignupRequestBody = Exclude<
	Parameters<typeof auth.api.signUpEmail>[0],
	undefined
>["body"];

export const SignupRequestSchema = z.object({
	username: z.string().min(1).max(100),
	password: z.string().min(8),
	displayName: z.string().min(1).max(100).optional().nullable(),
	email: z.email().optional().nullable(),
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

export function signupRequestToBetterAuth(body: SignupRequestDto): BetterAuthSignupRequestBody {
	const fakeEmail = `delegate-${getRandomId(14).toLowerCase()}@projectcvsa.com`;

	return {
		name: body.displayName || body.username,
		email: body.email || fakeEmail,
		password: body.password,
		username: body.username,
	};
}

export function betterAuthToSignupUserInfoDto(
	user: BetterAuthUser,
	token: string
): SignupUserInfoDto {
	return {
		id: user.id,
		username: user.username ?? "",
		displayName: user.name,
		email: user.email,
		token,
	};
}

export function betterAuthToCurrentUserInfoDto(user: BetterAuthUser): CurrentUserInfoDto {
	return {
		id: user.id,
		username: user.username ?? "",
		displayName: user.name,
		email: user.email,
		createdAt: user.createdAt.toISOString() ?? null,
		image: user.image ?? null,
	};
}

export function toSignUpResponse(data: SignupUserInfoDto): SignupResponseDto {
	return {
		message: "Successfully registered",
		data,
	};
}

export const LoginRequestSchema = z.object({
	email: z.email(),
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

export function betterAuthToLoginUserInfoDto(
	user: BetterAuthUser,
	token: string
): LoginUserInfoDto {
	return {
		id: user.id,
		username: user.username ?? "",
		displayName: user.name,
		email: user.email,
		token,
	};
}

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

export const betterAuthUserToEntity = (user: BetterAuthUser): User => {
	const { image, roleId } = user;
	return {
		...user,
		image: image ?? null,
		roleId: roleId ?? null,
		username: user.username ?? "",
		displayUsername: user.displayUsername ?? "",
	};
};
