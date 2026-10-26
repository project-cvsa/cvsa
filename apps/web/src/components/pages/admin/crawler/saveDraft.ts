export function applySaveResult<T>(
	currentDraft: T | null,
	submittedDraft: T,
	savedValue: T
): T | null {
	return currentDraft === submittedDraft ? savedValue : currentDraft;
}

type LoadToken = {
	revision: number;
	request: number;
};

export function createConfigRequestCoordinator() {
	let revision = 0;
	let loadRequest = 0;
	return {
		beginLoad: (): LoadToken => {
			loadRequest += 1;
			return { revision, request: loadRequest };
		},
		canApplyLoad: (token: LoadToken): boolean =>
			token.revision === revision && token.request === loadRequest,
		beginSave: (): number => {
			revision += 1;
			loadRequest += 1;
			return revision;
		},
		canApplySave: (token: number): boolean => token === revision,
	};
}
