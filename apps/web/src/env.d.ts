/// <reference types="astro/client" />

declare namespace App {
	interface Locals {
		user: import("@cvsa/core").CurrentUserInfoDto | null;
		session: import("@cvsa/core").AuthSessionDto | null;
	}
}
