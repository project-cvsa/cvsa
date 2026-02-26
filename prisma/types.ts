declare global {
	namespace PrismaJson {
		type LocalizedField = {
			[lang: string]: string;
		};
	}
}

// This file must be a module.
export {};
