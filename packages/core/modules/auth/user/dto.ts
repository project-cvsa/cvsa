import { z } from "zod";
import type { auth } from "@modules/auth";
import { getRandomId } from "@common/utils";

type BetterAuthUser = Exclude<Awaited<ReturnType<typeof auth.api.getSession>>, null>["user"];

type BetterAuthSignupRequestBody = Exclude<
	Parameters<typeof auth.api.signUpEmail>[0],
	undefined
>["body"];

export const SignupRequestSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(8),
	displayName: z.string().max(100).optional().nullable(),
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
	createdAt: z.date().optional().nullable(),
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
		createdAt: user.createdAt ?? null,
		image: user.image ?? null,
	};
}

export function toSignUpResponse(data: SignupUserInfoDto): SignupResponseDto {
	return {
		message: "Successfully registered",
		data,
	};
}
