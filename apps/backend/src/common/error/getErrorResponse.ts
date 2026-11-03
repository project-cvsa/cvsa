import type { ErrorResponseDto } from "@cvsa/contracts";
import { i18nRuntime } from "@/common/i18n";
import { getTraceId } from "@/common/trace";

export const getErrorResponse = <T>(
	statusFunc: (code: number, response: ErrorResponseDto) => T,
	statusCode: number,
	locale: string | undefined,
	data: ErrorResponseDto
): T => {
	const traceId = getTraceId();
	const { message } = data;
	const translatedMessages = message ? i18nRuntime.tAll(message) : undefined;
	const translatedMessage = message ? i18nRuntime.getT({ locale })(message) : undefined;
	return statusFunc(statusCode, {
		...data,
		message: translatedMessage,
		i18n: locale === undefined ? translatedMessages : undefined,
		traceId,
	});
};
