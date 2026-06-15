import type { ErrorResponseDto } from "@cvsa/core";
import { i18nRuntime } from "@/common/i18n";
import { getTraceId } from "@/common/trace";

// biome-ignore lint/suspicious/noExplicitAny: Utility type
type StatusFunc = (code: number, response: any) => any;

export const getErrorResponse = <T extends StatusFunc>(
	statusFunc: T,
	statusCode: number,
	locale: string | undefined,
	data: ErrorResponseDto
): ReturnType<T> => {
	const traceId = getTraceId();
	const { message } = data;
	const translatedMessages = message ? i18nRuntime.tAll(message) : undefined;
	const translatedMessage = message ? i18nRuntime.t({ locale })(message) : undefined;
	return statusFunc(statusCode, {
		...data,
		message: translatedMessage,
		i18n: locale === undefined ? translatedMessages : undefined,
		traceId,
	});
};
