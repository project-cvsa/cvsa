type PlainObject = Record<string, unknown>;

const isObject = (obj: unknown): obj is PlainObject => {
	return obj !== null && typeof obj === "object" && !Array.isArray(obj);
};

export const deepEqualUnordered = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;

	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;

		const bCopy = [...b];
		for (const itemA of a) {
			const indexB = bCopy.findIndex((itemB) => deepEqualUnordered(itemA, itemB));
			if (indexB === -1) return false;
			bCopy.splice(indexB, 1);
		}
		return true;
	}

	if (isObject(a) && isObject(b)) {
		const keysA = Object.keys(a);
		const keysB = Object.keys(b);

		if (keysA.length !== keysB.length) return false;

		for (const key of keysA) {
			// biome-ignore lint/suspicious/noPrototypeBuiltins: utility function
			if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
			if (!deepEqualUnordered(a[key], b[key])) return false;
		}
		return true;
	}

	return false;
};
