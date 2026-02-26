import { t } from "elysia";

export const errorCodes = [
	"INVALID_QUERY_PARAMS",
	"UNKNOWN_ERROR",
	"INVALID_PAYLOAD",
	"MALFORMED_SLOT",
	"INVALID_HEADER",
	"BODY_TOO_LARGE",
	"UNAUTHORIZED",
	"INVALID_CREDENTIALS",
	"ENTITY_NOT_FOUND",
	"SERVER_ERROR",
	"RATE_LIMIT_EXCEEDED",
	"ENTITY_EXISTS",
	"THIRD_PARTY_ERROR",
];

function generateErrorCodeRegex(strings: string[]): string {
	if (strings.length === 0) {
		return "(?!)";
	}

	const escapedStrings = strings.map((str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

	return `^(${escapedStrings.join("|")})$`;
}

export const ErrorResponseSchema = t.Object({
	code: t.String({ pattern: generateErrorCodeRegex(errorCodes) }),
	errors: t.Array(t.String()),
	i18n: t.Optional(
		t.Object({
			key: t.String(),
			values: t.Optional(t.Record(t.String(), t.Union([t.String(), t.Number(), t.Date()]))),
		})
	),
	message: t.String(),
});
