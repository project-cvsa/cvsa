/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		user: import("@cvsa/authentication").CurrentUserInfoDto | null;
		session: import("@cvsa/authentication").AuthSessionDto | null;
	}
}
