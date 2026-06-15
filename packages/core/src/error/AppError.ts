export const APP_ERROR_MAGIC_NUMBER = 0x0712_0412_1099;

export class AppError extends Error {
	private readonly __type = APP_ERROR_MAGIC_NUMBER;

	constructor(
		public override message: string,
		public code: string,
		public statusCode: number = 500,
		public meta?: Record<string, unknown>
	) {
		super(message);
		this.name = new.target.name;
		Error.captureStackTrace(this, new.target);
	}

	static isAppError(obj: unknown): obj is AppError {
		if (!obj || typeof obj !== "object") {
			return false;
		}

		if (obj instanceof AppError) {
			return true;
		}

		return "__type" in obj && (obj as { __type: unknown }).__type === APP_ERROR_MAGIC_NUMBER;
	}
}
