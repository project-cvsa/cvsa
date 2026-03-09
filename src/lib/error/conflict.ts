import { AppError } from "@lib/error";

export class ConflictError extends AppError {
	constructor(
		field: string,
		code: string = "APP_CONFLICT_ERROR",
		message = "Record already exists",
		statusCode: number = 409
	) {
		super(message, code, statusCode, { field });
	}
}
